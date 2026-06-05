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

export default router;
