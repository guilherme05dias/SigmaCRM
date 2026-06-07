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
        const customerId = req.query.customerId as string | undefined;
        const take = Math.max(1, Math.min(Number(req.query.take || 100), 500));
        const where: any = { ...companyScope(req) };
        if (customerId) where.customerId = customerId;
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
            take,
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
        const normalizedPhone = contact.phone.replace(/\D/g, '');
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
        const scope = companyScope(req);
        if (customerId) {
            const customer = await prisma.customer.findFirst({ where: { id: customerId, ...scope }, select: { id: true } });
            if (!customer) return res.status(404).json({ error: 'Customer not found' });
        }
        const existing = await prisma.contact.findFirst({ where: { phone, ...scope }, select: { id: true } });
        if (existing) return res.status(409).json({ error: 'Telefone já cadastrado nesta empresa' });
        const contact = await prisma.contact.create({
            data: { ...scope, name, phone, email, role, notes, customerId: customerId ?? undefined },
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
        const scope = companyScope(req);
        if (customerId) {
            const customer = await prisma.customer.findFirst({ where: { id: customerId, ...scope }, select: { id: true } });
            if (!customer) return res.status(404).json({ error: 'Customer not found' });
        }
        const result = await prisma.contact.updateMany({
            where: { id: req.params.id, ...scope },
            data: { name, email, notes, role, customerId },
        });
        if (result.count === 0) return res.status(404).json({ error: 'Contact not found' });
        const contact = await prisma.contact.findFirst({ where: { id: req.params.id, ...scope } });
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
        const normalizedPhone = contact.phone.replace(/\D/g, '');

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
                where: { companyId: contact.companyId, fromPhone: { in: [contact.phone, normalizedPhone] } },
            });
            const outbox = await tx.whatsAppOutbox.deleteMany({
                where: { companyId: contact.companyId, toPhone: normalizedPhone },
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
