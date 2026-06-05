import { Router } from 'express';
import { CustomerStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { companyScope, getCompanyId } from '../lib/tenant';

const router = Router();
router.use(authMiddleware);

const CustomerCreateSchema = z.object({
    name: z.string().trim().min(1, 'Nome é obrigatório'),
    document: z.string().trim().optional().nullable(),
    segment: z.string().trim().optional().nullable(),
    city: z.string().trim().optional().nullable(),
    status: z.nativeEnum(CustomerStatus).optional(),
    notes: z.string().trim().optional().nullable(),
});

const CustomerUpdateSchema = CustomerCreateSchema.partial();

const customerInclude = {
    contacts: {
        orderBy: { updatedAt: 'desc' as const },
        take: 20,
    },
    tickets: {
        orderBy: { createdAt: 'desc' as const },
        take: 20,
        include: {
            contact: true,
            assignedUser: true,
            department: true,
            fieldService: { include: { technician: true } },
            evaluation: true,
        },
    },
} as const;

const emptyToNull = (value?: string | null) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

function customerData(input: z.infer<typeof CustomerUpdateSchema>) {
    const data: Record<string, any> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.document !== undefined) data.document = emptyToNull(input.document);
    if (input.segment !== undefined) data.segment = emptyToNull(input.segment);
    if (input.city !== undefined) data.city = emptyToNull(input.city);
    if (input.status !== undefined) data.status = input.status;
    if (input.notes !== undefined) data.notes = emptyToNull(input.notes);
    return data;
}

// LISTAR clientes/empresas finais do CRM, sempre escopado pela empresa do usuário.
router.get('/', async (req, res) => {
    try {
        const { query, status } = req.query;
        const where: any = { ...companyScope(req) };

        if (typeof status === 'string' && status in CustomerStatus) {
            where.status = status;
        }

        if (typeof query === 'string' && query.trim()) {
            const term = query.trim();
            where.OR = [
                { name: { contains: term, mode: 'insensitive' } },
                { document: { contains: term, mode: 'insensitive' } },
                { segment: { contains: term, mode: 'insensitive' } },
                { city: { contains: term, mode: 'insensitive' } },
            ];
        }

        const customers = await prisma.customer.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            take: 100,
            include: {
                _count: {
                    select: { contacts: true, tickets: true },
                },
            },
        });

        res.json(customers);
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to fetch customers' });
    }
});

// DETALHE com contatos e últimos tickets.
router.get('/:id', async (req, res) => {
    try {
        const customer = await prisma.customer.findFirst({
            where: { id: req.params.id, ...companyScope(req) },
            include: customerInclude,
        });

        if (!customer) return res.status(404).json({ error: 'Customer not found' });
        res.json(customer);
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to fetch customer' });
    }
});

// CRIAR cliente.
router.post('/', async (req, res) => {
    try {
        const parsed = CustomerCreateSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.issues });
        }

        const customer = await prisma.customer.create({
            data: {
                companyId: getCompanyId(req),
                name: parsed.data.name,
                document: emptyToNull(parsed.data.document),
                segment: emptyToNull(parsed.data.segment),
                city: emptyToNull(parsed.data.city),
                status: parsed.data.status ?? CustomerStatus.ATIVO,
                notes: emptyToNull(parsed.data.notes),
            },
        });

        res.status(201).json(customer);
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to create customer' });
    }
});

// ATUALIZAR cliente sem permitir troca de tenant.
router.patch('/:id', async (req, res) => {
    try {
        const parsed = CustomerUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.issues });
        }

        const data = customerData(parsed.data);
        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
        }

        const result = await prisma.customer.updateMany({
            where: { id: req.params.id, ...companyScope(req) },
            data,
        });

        if (result.count === 0) return res.status(404).json({ error: 'Customer not found' });

        const customer = await prisma.customer.findFirst({
            where: { id: req.params.id, ...companyScope(req) },
            include: customerInclude,
        });

        res.json(customer);
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to update customer' });
    }
});

// INATIVAR cliente preservando histórico de contatos, tickets e relatórios.
router.delete('/:id', async (req, res) => {
    try {
        const result = await prisma.customer.updateMany({
            where: { id: req.params.id, ...companyScope(req) },
            data: { status: CustomerStatus.INATIVO },
        });

        if (result.count === 0) return res.status(404).json({ error: 'Customer not found' });
        res.status(204).send();
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to delete customer' });
    }
});

export default router;
