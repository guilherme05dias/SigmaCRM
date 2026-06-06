import { Router } from 'express';
import { TicketChannel, TicketPriority, TicketStatus, ServiceType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { emitToCompany } from '../socket';
import { authMiddleware } from '../middlewares/auth.middleware';
import { companyScope, getCompanyId } from '../lib/tenant';
import { generateProtocol } from '../services/protocol.service';
import { assertTransition } from '../services/ticketStatus';
import { z } from 'zod';

const router = Router();
router.use(authMiddleware);

const fieldServiceShape = {
    serviceType: z.nativeEnum(ServiceType).optional(),
    equipment: z.string().optional().nullable(),
    technicianId: z.string().uuid().optional().nullable(),
    onSiteRequired: z.boolean().optional(),
    visitAddress: z.string().optional().nullable(),
    visitWindowStart: z.string().datetime().optional().nullable(),
    visitWindowEnd: z.string().datetime().optional().nullable(),
    scheduledAt: z.string().datetime().optional().nullable(),
    startedAt: z.string().datetime().optional().nullable(),
    finishedAt: z.string().datetime().optional().nullable(),
    hoursSpent: z.number().optional().nullable(),
    resolution: z.string().optional().nullable(),
};

const CreateTicketSchema = z.object({
    contactId: z.string().uuid(),
    customerId: z.string().uuid().optional().nullable(),
    conversationId: z.string().uuid().optional().nullable(),
    title: z.string().min(1),
    description: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    channel: z.nativeEnum(TicketChannel).optional(),
    priority: z.nativeEnum(TicketPriority),
    departmentId: z.string().uuid().optional().nullable(),
    assignedUserId: z.string().uuid().optional().nullable(),
    notesInternal: z.string().optional().nullable(),
    ...fieldServiceShape,
});

const UpdateTicketSchema = z.object({
    status: z.nativeEnum(TicketStatus).optional(),
    priority: z.nativeEnum(TicketPriority).optional(),
    assignedUserId: z.string().uuid().optional().nullable(),
    departmentId: z.string().uuid().optional().nullable(),
    title: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    notesInternal: z.string().optional().nullable(),
    ...fieldServiceShape,
});

const ticketInclude = {
    contact: true,
    customer: true,
    assignedUser: true,
    department: true,
    fieldService: { include: { technician: true } },
    evaluation: true,
} as const;

const toDate = (v?: string | null) => (v ? new Date(v) : null);

function extractFieldService(data: Record<string, any>) {
    const keys = Object.keys(fieldServiceShape);
    const fs: Record<string, any> = {};
    let has = false;
    for (const k of keys) {
        if (data[k] !== undefined) {
            has = true;
            fs[k] = ['visitWindowStart', 'visitWindowEnd', 'scheduledAt', 'startedAt', 'finishedAt'].includes(k)
                ? toDate(data[k])
                : data[k];
        }
    }
    return { has, fs };
}

// LISTAR (escopado por empresa)
router.get('/', async (req, res) => {
    try {
        const { status, priority, contactId, customerId, assignedUserId, departmentId } = req.query;
        const where: any = { ...companyScope(req) };
        if (status) where.status = status;
        if (priority) where.priority = priority;
        if (contactId) where.contactId = contactId;
        if (customerId) where.customerId = customerId;
        if (assignedUserId) where.assignedUserId = assignedUserId;
        if (departmentId) where.departmentId = departmentId;

        const tickets = await prisma.ticket.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: ticketInclude,
        });
        res.json(tickets);
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to fetch tickets' });
    }
});

// DETALHE
router.get('/:id', async (req, res) => {
    try {
        const ticket = await prisma.ticket.findFirst({
            where: { id: req.params.id, ...companyScope(req) },
            include: { ...ticketInclude, timeline: { orderBy: { createdAt: 'desc' } } },
        });
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
        res.json(ticket);
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to fetch ticket' });
    }
});

// CRIAR (gera protocolo + opcional field service + timeline)
router.post('/', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const parsed = CreateTicketSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.issues });
        }
        const { contactId, customerId, conversationId, title, description, category, channel, priority, departmentId, assignedUserId, notesInternal } = parsed.data;
        const { has: hasFS, fs } = extractFieldService(parsed.data);

        const ticket = await prisma.$transaction(async (tx) => {
            const protocol = await generateProtocol(companyId, tx);
            const created = await tx.ticket.create({
                data: {
                    companyId,
                    protocol,
                    contactId,
                    customerId: customerId ?? undefined,
                    conversationId: conversationId ?? undefined,
                    title,
                    description,
                    category,
                    channel: channel ?? TicketChannel.WHATSAPP,
                    priority,
                    status: TicketStatus.NEW,
                    departmentId: departmentId ?? undefined,
                    assignedUserId: assignedUserId ?? undefined,
                    notesInternal,
                },
            });
            if (hasFS) {
                await tx.ticketFieldService.create({ data: { companyId, ticketId: created.id, ...fs } });
            }
            await tx.ticketTimeline.create({
                data: { companyId, ticketId: created.id, type: 'CREATED', actorUserId: req.user?.id, payload: { protocol } },
            });
            return tx.ticket.findUnique({ where: { id: created.id }, include: ticketInclude });
        });

        emitToCompany(companyId, 'ticket:new', ticket);
        res.status(201).json(ticket);
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to create ticket' });
    }
});

// ATUALIZAR (valida transição de status; field service via upsert; timeline)
router.patch('/:id', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const parsed = UpdateTicketSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.issues });
        }

        const existing = await prisma.ticket.findFirst({ where: { id: req.params.id, ...companyScope(req) } });
        if (!existing) return res.status(404).json({ error: 'Ticket not found' });

        const { status, priority, assignedUserId, departmentId, title, description, category, notesInternal } = parsed.data;
        const { has: hasFS, fs } = extractFieldService(parsed.data);

        const data: any = {};
        if (status && status !== existing.status) {
            assertTransition(existing.status, status, { isAdmin: req.user?.role === 'ADMIN' });
            data.status = status;
            if (status === TicketStatus.RESOLVED) data.solvedAt = new Date();
            if (status === TicketStatus.CLOSED) data.closedAt = new Date();
        }
        if (priority) data.priority = priority;
        if (assignedUserId !== undefined) data.assignedUserId = assignedUserId;
        if (departmentId !== undefined) data.departmentId = departmentId;
        if (title) data.title = title;
        if (description !== undefined) data.description = description;
        if (category !== undefined) data.category = category;
        if (notesInternal !== undefined) data.notesInternal = notesInternal;

        const ticket = await prisma.$transaction(async (tx) => {
            await tx.ticket.update({ where: { id: existing.id }, data });
            if (hasFS) {
                await tx.ticketFieldService.upsert({
                    where: { ticketId: existing.id },
                    create: { companyId, ticketId: existing.id, ...fs },
                    update: fs,
                });
            }
            if (data.status) {
                await tx.ticketTimeline.create({
                    data: { companyId, ticketId: existing.id, type: 'STATUS_CHANGE', actorUserId: req.user?.id, payload: { from: existing.status, to: data.status } },
                });
            }
            if (assignedUserId !== undefined && assignedUserId !== existing.assignedUserId) {
                await tx.ticketTimeline.create({
                    data: { companyId, ticketId: existing.id, type: 'ASSIGNMENT', actorUserId: req.user?.id, payload: { assignedUserId } },
                });
            }
            return tx.ticket.findUnique({ where: { id: existing.id }, include: ticketInclude });
        });

        emitToCompany(companyId, 'ticket:updated', ticket);
        res.json(ticket);
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to update ticket' });
    }
});

// AVALIAÇÃO (CSAT) — ADR-03
router.post('/:id/evaluation', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const rating = Number(req.body?.rating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'rating deve ser inteiro entre 1 e 5' });
        }
        const existing = await prisma.ticket.findFirst({ where: { id: req.params.id, ...companyScope(req) } });
        if (!existing) return res.status(404).json({ error: 'Ticket not found' });

        const evaluation = await prisma.ticketEvaluation.upsert({
            where: { ticketId: existing.id },
            create: { companyId, ticketId: existing.id, rating, comment: req.body?.comment ?? null },
            update: { rating, comment: req.body?.comment ?? null },
        });
        await prisma.ticketTimeline.create({
            data: { companyId, ticketId: existing.id, type: 'EVALUATION', actorUserId: req.user?.id, payload: { rating } },
        });
        res.status(201).json(evaluation);
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to save evaluation' });
    }
});

export default router;
