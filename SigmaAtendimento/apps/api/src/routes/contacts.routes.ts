import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { companyScope } from '../lib/tenant';
import { getWhatsAppProvider } from '../whatsapp';
import { normalizePhone, phoneAliases } from '../lib/phone';

const router = Router();
router.use(authMiddleware); // tenancy (ADR-02)
const whatsappProvider = getWhatsAppProvider();

const contactCompanyInclude = {
    business: true,
    customer: {
        include: {
            businesses: { orderBy: { name: 'asc' as const } },
        },
    },
} as const;

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
                { business: { name: { contains: query, mode: 'insensitive' } } },
                { customer: { name: { contains: query, mode: 'insensitive' } } },
                { customer: { businesses: { some: { name: { contains: query, mode: 'insensitive' } } } } },
            ];
        }
        const contacts = await prisma.contact.findMany({
            where,
            include: contactCompanyInclude,
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
                ...contactCompanyInclude,
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

// Resolves and caches the WhatsApp photo while keeping the provider token server-side.
router.get('/:id/avatar', async (req, res) => {
    try {
        const contact = await prisma.contact.findFirst({
            where: { id: req.params.id, ...companyScope(req) },
            select: { id: true, phone: true, avatarUrl: true },
        });
        if (!contact) return res.status(404).json({ error: 'Contact not found' });
        const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
        if (contact.avatarUrl && !refresh) return res.json({ avatarUrl: contact.avatarUrl });
        if (!whatsappProvider.getProfilePictureUrl) return res.json({ avatarUrl: null });

        const avatarUrl = await whatsappProvider.getProfilePictureUrl({ phone: contact.phone });
        if (avatarUrl) {
            await prisma.contact.update({ where: { id: contact.id }, data: { avatarUrl } });
        }
        res.json({ avatarUrl });
    } catch (error: any) {
        res.status(502).json({ error: error?.message || 'N\u00e3o foi poss\u00edvel obter a foto do contato.' });
    }
});

// Create
router.post('/', async (req, res) => {
    try {
        const { name, phone, email, role, notes, customerId, businessId, welcomeMessageEnabled, includeInServiceReports } = req.body ?? {};
        if (!phone) return res.status(400).json({ error: 'phone é obrigatório' });
        const normalizedPhone = normalizePhone(phone);
        if (normalizedPhone.length < 10) return res.status(400).json({ error: 'Informe um telefone válido' });
        const scope = companyScope(req);
        let resolvedCustomerId = customerId || null;
        const resolvedBusinessId = typeof businessId === 'string' && businessId.trim() ? businessId.trim() : null;

        if (resolvedBusinessId) {
            const business = await prisma.customerBusiness.findFirst({
                where: { id: resolvedBusinessId, ...scope },
                select: { id: true, customerId: true },
            });
            if (!business) return res.status(404).json({ error: 'Empresa/CNPJ n\u00e3o encontrado nesta empresa' });
            if (resolvedCustomerId && resolvedCustomerId !== business.customerId) {
                return res.status(400).json({ error: 'A empresa/CNPJ selecionada n\u00e3o pertence ao cliente informado' });
            }
            resolvedCustomerId = business.customerId;
        }

        if (resolvedCustomerId) {
            const customer = await prisma.customer.findFirst({ where: { id: resolvedCustomerId, ...scope }, select: { id: true } });
            if (!customer) return res.status(404).json({ error: 'Customer not found' });
        }
        const existing = await prisma.contact.findFirst({
            where: { phone: { in: phoneAliases(normalizedPhone) }, ...scope },
            select: { id: true },
        });
        if (existing) return res.status(409).json({ error: 'Telefone já cadastrado nesta empresa' });
        const contact = await prisma.contact.create({
            data: {
                ...scope,
                name,
                phone: normalizedPhone,
                email,
                role,
                notes,
                customerId: resolvedCustomerId,
                businessId: resolvedBusinessId,
                ...(typeof welcomeMessageEnabled === 'boolean' ? { welcomeMessageEnabled } : {}),
                ...(typeof includeInServiceReports === 'boolean' ? { includeInServiceReports } : {}),
            },
            include: contactCompanyInclude,
        });
        res.status(201).json(contact);
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to create contact' });
    }
});

// Update
router.patch('/:id', async (req, res) => {
    try {
        const { name, email, notes, role, customerId, businessId, welcomeMessageEnabled, includeInServiceReports } = req.body ?? {};
        const scope = companyScope(req);
        const existing = await prisma.contact.findFirst({
            where: { id: req.params.id, ...scope },
            select: { id: true, customerId: true, businessId: true },
        });
        if (!existing) return res.status(404).json({ error: 'Contact not found' });

        const hasCustomerId = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'customerId');
        const hasBusinessId = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'businessId');
        let resolvedCustomerId = hasCustomerId ? (customerId || null) : existing.customerId;
        let resolvedBusinessId = hasBusinessId
            ? (typeof businessId === 'string' && businessId.trim() ? businessId.trim() : null)
            : existing.businessId;

        if (hasCustomerId && !hasBusinessId && resolvedCustomerId !== existing.customerId) {
            resolvedBusinessId = null;
        }

        if (resolvedBusinessId) {
            const business = await prisma.customerBusiness.findFirst({
                where: { id: resolvedBusinessId, ...scope },
                select: { id: true, customerId: true },
            });
            if (!business) return res.status(404).json({ error: 'Empresa/CNPJ n\u00e3o encontrado nesta empresa' });
            if (resolvedCustomerId && resolvedCustomerId !== business.customerId) {
                return res.status(400).json({ error: 'A empresa/CNPJ selecionada n\u00e3o pertence ao cliente informado' });
            }
            resolvedCustomerId = business.customerId;
        }

        if (resolvedCustomerId) {
            const customer = await prisma.customer.findFirst({
                where: { id: resolvedCustomerId, ...scope },
                select: { id: true },
            });
            if (!customer) return res.status(404).json({ error: 'Customer not found' });
        } else {
            resolvedBusinessId = null;
        }

        const contact = await prisma.contact.update({
            where: { id: existing.id },
            data: {
                name,
                email,
                notes,
                role,
                customerId: resolvedCustomerId,
                businessId: resolvedBusinessId,
                ...(typeof welcomeMessageEnabled === 'boolean' ? { welcomeMessageEnabled } : {}),
                ...(typeof includeInServiceReports === 'boolean' ? { includeInServiceReports } : {}),
            },
            include: contactCompanyInclude,
        });
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
        const acceptedPhoneVariants = phoneAliases(contact.phone);

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
                where: { companyId: contact.companyId, fromPhone: { in: acceptedPhoneVariants } },
            });
            const outbox = await tx.whatsAppOutbox.deleteMany({
                where: { companyId: contact.companyId, toPhone: { in: acceptedPhoneVariants } },
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
