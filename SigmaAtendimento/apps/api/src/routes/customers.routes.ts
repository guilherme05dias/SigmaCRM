import { Router } from 'express';
import { CustomerStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { companyScope, getCompanyId } from '../lib/tenant';

const router = Router();
router.use(authMiddleware);

const normalizeCnpj = (value: string) => value.replace(/\D/g, '');

const isValidCnpj = (value: string) => {
    const cnpj = normalizeCnpj(value);
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

    const calculateDigit = (base: string, weights: number[]) => {
        const sum = base
            .split('')
            .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
        const remainder = sum % 11;
        return remainder < 2 ? 0 : 11 - remainder;
    };

    const firstDigit = calculateDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const secondDigit = calculateDigit(`${cnpj.slice(0, 12)}${firstDigit}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return cnpj.endsWith(`${firstDigit}${secondDigit}`);
};

const CustomerBusinessSchema = z.object({
    name: z.string().trim().min(1, 'Nome da empresa é obrigatório').max(160),
    cnpj: z.string().trim().transform(normalizeCnpj).refine(isValidCnpj, 'CNPJ inválido'),
});

const CustomerCreateSchema = z.object({
    name: z.string().trim().min(1, 'Nome é obrigatório'),
    document: z.string().trim().optional().nullable(),
    segment: z.string().trim().optional().nullable(),
    city: z.string().trim().optional().nullable(),
    status: z.nativeEnum(CustomerStatus).optional(),
    systems: z.string().trim().optional().nullable(),
    notes: z.string().trim().optional().nullable(),
    businesses: z.array(CustomerBusinessSchema).max(20, 'Limite de 20 empresas por cliente').optional(),
});

const CustomerUpdateSchema = CustomerCreateSchema.partial();

const customerInclude = {
    businesses: {
        orderBy: { createdAt: 'asc' as const },
    },
    contacts: {
        orderBy: { updatedAt: 'desc' as const },
        take: 20,
        include: { business: true },
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
    if (input.systems !== undefined) data.systems = emptyToNull(input.systems);
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
            const cnpjTerm = normalizeCnpj(term);
            where.OR = [
                { name: { contains: term, mode: 'insensitive' } },
                { document: { contains: term, mode: 'insensitive' } },
                { segment: { contains: term, mode: 'insensitive' } },
                { city: { contains: term, mode: 'insensitive' } },
                {
                    businesses: {
                        some: {
                            OR: [
                                { name: { contains: term, mode: 'insensitive' } },
                                ...(cnpjTerm ? [{ cnpj: { contains: cnpjTerm } }] : []),
                            ],
                        },
                    },
                },
            ];
        }

        const customers = await prisma.customer.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            take: 100,
            include: {
                businesses: {
                    orderBy: { createdAt: 'asc' },
                },
                _count: {
                    select: { contacts: true, tickets: true, businesses: true },
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

        const companyId = getCompanyId(req);
        const customer = await prisma.customer.create({
            data: {
                companyId,
                name: parsed.data.name,
                document: emptyToNull(parsed.data.document),
                segment: emptyToNull(parsed.data.segment),
                city: emptyToNull(parsed.data.city),
                status: parsed.data.status ?? CustomerStatus.ATIVO,
                systems: emptyToNull(parsed.data.systems),
                notes: emptyToNull(parsed.data.notes),
                businesses: parsed.data.businesses?.length
                    ? {
                        create: parsed.data.businesses.map((business) => ({
                            companyId,
                            name: business.name,
                            cnpj: business.cnpj,
                        })),
                    }
                    : undefined,
            },
            include: customerInclude,
        });

        res.status(201).json(customer);
    } catch (error: any) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return res.status(409).json({ error: 'Este CNPJ já está vinculado a outro cliente' });
        }
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to create customer' });
    }
});

// ADICIONAR uma empresa/CNPJ ao cliente sem sair do cadastro do contato.
router.post('/:id/businesses', async (req, res) => {
    try {
        const parsed = CustomerBusinessSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inv\u00e1lidos', details: parsed.error.issues });
        }

        const customer = await prisma.customer.findFirst({
            where: { id: req.params.id, ...companyScope(req) },
            select: { id: true, companyId: true },
        });
        if (!customer) return res.status(404).json({ error: 'Customer not found' });

        const business = await prisma.customerBusiness.create({
            data: {
                companyId: customer.companyId,
                customerId: customer.id,
                name: parsed.data.name,
                cnpj: parsed.data.cnpj,
            },
        });

        res.status(201).json(business);
    } catch (error: any) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return res.status(409).json({ error: 'Este CNPJ j\u00e1 est\u00e1 vinculado a outro cliente' });
        }
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Failed to create customer business' });
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
        if (Object.keys(data).length === 0 && parsed.data.businesses === undefined) {
            return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
        }

        const existingCustomer = await prisma.customer.findFirst({
            where: { id: req.params.id, ...companyScope(req) },
            select: { id: true, companyId: true },
        });

        if (!existingCustomer) return res.status(404).json({ error: 'Customer not found' });

        const customer = await prisma.$transaction(async (transaction) => {
            if (parsed.data.businesses !== undefined) {
                const existingBusinesses = await transaction.customerBusiness.findMany({
                    where: { customerId: existingCustomer.id, companyId: existingCustomer.companyId },
                    select: { id: true, cnpj: true },
                });
                const desiredCnpjs = parsed.data.businesses.map((business) => business.cnpj);

                await transaction.customerBusiness.deleteMany({
                    where: {
                        customerId: existingCustomer.id,
                        companyId: existingCustomer.companyId,
                        ...(desiredCnpjs.length ? { cnpj: { notIn: desiredCnpjs } } : {}),
                    },
                });

                for (const business of parsed.data.businesses) {
                    const existingBusiness = existingBusinesses.find((candidate) => candidate.cnpj === business.cnpj);
                    if (existingBusiness) {
                        await transaction.customerBusiness.update({
                            where: { id: existingBusiness.id },
                            data: { name: business.name },
                        });
                    } else {
                        await transaction.customerBusiness.create({
                            data: {
                                companyId: existingCustomer.companyId,
                                customerId: existingCustomer.id,
                                name: business.name,
                                cnpj: business.cnpj,
                            },
                        });
                    }
                }
            }

            return transaction.customer.update({
                where: { id: existingCustomer.id },
                data,
                include: customerInclude,
            });
        });

        res.json(customer);
    } catch (error: any) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return res.status(409).json({ error: 'Este CNPJ já está vinculado a outro cliente' });
        }
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
