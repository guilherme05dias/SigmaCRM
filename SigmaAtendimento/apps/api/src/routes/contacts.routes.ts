import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { companyScope } from '../lib/tenant';

const router = Router();
router.use(authMiddleware); // tenancy (ADR-02)

// List contacts (escopado por empresa)
router.get('/', async (req, res) => {
    try {
        const query = req.query.query as string;
        const where: any = { ...companyScope(req) };
        if (query) {
            where.OR = [
                { name: { contains: query, mode: 'insensitive' } },
                { phone: { contains: query } },
                { email: { contains: query, mode: 'insensitive' } },
            ];
        }
        const contacts = await prisma.contact.findMany({
            where,
            include: { customer: true },
            orderBy: { updatedAt: 'desc' },
            take: 50,
        });
        res.json(contacts);
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to fetch contacts' });
    }
});

// Single contact
router.get('/:id', async (req, res) => {
    try {
        const contact = await prisma.contact.findFirst({
            where: { id: req.params.id, ...companyScope(req) },
            include: {
                customer: true,
                conversations: { orderBy: { createdAt: 'desc' }, take: 5 },
                tickets: { orderBy: { createdAt: 'desc' }, take: 5 },
            },
        });
        if (!contact) return res.status(404).json({ error: 'Contact not found' });
        res.json(contact);
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to fetch contact' });
    }
});

// Create
router.post('/', async (req, res) => {
    try {
        const { name, phone, email, role, notes, customerId } = req.body ?? {};
        if (!phone) return res.status(400).json({ error: 'phone é obrigatório' });
        const contact = await prisma.contact.create({
            data: { ...companyScope(req), name, phone, email, role, notes, customerId: customerId ?? undefined },
        });
        res.status(201).json(contact);
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to create contact' });
    }
});

// Update
router.patch('/:id', async (req, res) => {
    try {
        const { name, email, notes, role, customerId } = req.body ?? {};
        const result = await prisma.contact.updateMany({
            where: { id: req.params.id, ...companyScope(req) },
            data: { name, email, notes, role, customerId },
        });
        if (result.count === 0) return res.status(404).json({ error: 'Contact not found' });
        const contact = await prisma.contact.findFirst({ where: { id: req.params.id, ...companyScope(req) } });
        res.json(contact);
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to update contact' });
    }
});

// LGPD: remove histórico operacional vinculado a um contato.
router.delete('/:id/data', async (req, res) => {
    try {
        if (!['ADMIN', 'SUPERVISOR'].includes(req.user?.role || '')) {
            return res.status(403).json({ error: 'Apenas administradores ou supervisores podem excluir dados de contato.' });
        }

        const contact = await prisma.contact.findFirst({
            where: { id: req.params.id, ...companyScope(req) },
            select: { id: true, phone: true, companyId: true },
        });

        if (!contact) return res.status(404).json({ error: 'Contact not found' });

        const conversationIds = (await prisma.conversation.findMany({
            where: { contactId: contact.id, ...companyScope(req) },
            select: { id: true },
        })).map((conversation) => conversation.id);

        const ticketIds = (await prisma.ticket.findMany({
            where: { contactId: contact.id, ...companyScope(req) },
            select: { id: true },
        })).map((ticket) => ticket.id);

        const result = await prisma.$transaction(async (tx) => {
            const ticketTimeline = ticketIds.length
                ? await tx.ticketTimeline.deleteMany({ where: { ticketId: { in: ticketIds }, ...companyScope(req) } })
                : { count: 0 };
            const ticketEvaluation = ticketIds.length
                ? await tx.ticketEvaluation.deleteMany({ where: { ticketId: { in: ticketIds }, ...companyScope(req) } })
                : { count: 0 };
            const ticketFieldService = ticketIds.length
                ? await tx.ticketFieldService.deleteMany({ where: { ticketId: { in: ticketIds }, ...companyScope(req) } })
                : { count: 0 };
            const tickets = await tx.ticket.deleteMany({ where: { contactId: contact.id, ...companyScope(req) } });
            const messages = conversationIds.length
                ? await tx.message.deleteMany({ where: { conversationId: { in: conversationIds }, ...companyScope(req) } })
                : { count: 0 };
            const conversations = await tx.conversation.deleteMany({ where: { contactId: contact.id, ...companyScope(req) } });
            const inboundEvents = await tx.whatsAppInboundEvent.deleteMany({
                where: { companyId: contact.companyId, fromPhone: contact.phone },
            });
            const outbox = await tx.whatsAppOutbox.deleteMany({
                where: { companyId: contact.companyId, toPhone: contact.phone.replace(/\D/g, '') },
            });
            const contacts = await tx.contact.deleteMany({ where: { id: contact.id, ...companyScope(req) } });

            return {
                contacts: contacts.count,
                conversations: conversations.count,
                messages: messages.count,
                tickets: tickets.count,
                ticketTimeline: ticketTimeline.count,
                ticketEvaluation: ticketEvaluation.count,
                ticketFieldService: ticketFieldService.count,
                inboundEvents: inboundEvents.count,
                outbox: outbox.count,
            };
        });

        res.json({ ok: true, deleted: result });
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to delete contact data' });
    }
});

export default router;
