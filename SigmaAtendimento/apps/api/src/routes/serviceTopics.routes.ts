import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireAdminOrSupervisor } from '../middlewares/authorization.middleware';
import { getCompanyId } from '../lib/tenant';

const router = Router();
router.use(authMiddleware);

const ServiceTopicSchema = z.object({
    name: z.string().trim().min(2),
    description: z.string().trim().optional().nullable(),
    active: z.boolean().optional(),
});

router.get('/', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';

        const topics = await prisma.serviceTopic.findMany({
            where: {
                companyId,
                ...(includeInactive ? {} : { active: true }),
            },
            orderBy: [{ active: 'desc' }, { name: 'asc' }],
        });

        res.json(topics);
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Erro ao listar sistemas/assuntos' });
    }
});

router.post('/', requireAdminOrSupervisor, async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const parsed = ServiceTopicSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados invalidos', details: parsed.error.issues });
        }

        const topic = await prisma.serviceTopic.create({
            data: {
                companyId,
                name: parsed.data.name,
                description: parsed.data.description || null,
                active: parsed.data.active ?? true,
            },
        });

        res.status(201).json(topic);
    } catch (error: any) {
        res.status(error?.status ?? 400).json({ error: error?.message ?? 'Erro ao criar sistema/assunto' });
    }
});

router.put('/:id', requireAdminOrSupervisor, async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const parsed = ServiceTopicSchema.partial().safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados invalidos', details: parsed.error.issues });
        }

        const result = await prisma.serviceTopic.updateMany({
            where: { id: req.params.id, companyId },
            data: {
                ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
                ...(parsed.data.description !== undefined ? { description: parsed.data.description || null } : {}),
                ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
            },
        });

        if (result.count === 0) {
            return res.status(404).json({ error: 'Sistema/assunto nao encontrado' });
        }

        const topic = await prisma.serviceTopic.findFirst({ where: { id: req.params.id, companyId } });
        res.json(topic);
    } catch (error: any) {
        res.status(error?.status ?? 400).json({ error: error?.message ?? 'Erro ao atualizar sistema/assunto' });
    }
});

router.delete('/:id', requireAdminOrSupervisor, async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const result = await prisma.serviceTopic.updateMany({
            where: { id: req.params.id, companyId },
            data: { active: false },
        });

        if (result.count === 0) {
            return res.status(404).json({ error: 'Sistema/assunto nao encontrado' });
        }

        res.status(204).send();
    } catch (error: any) {
        res.status(error?.status ?? 400).json({ error: error?.message ?? 'Erro ao inativar sistema/assunto' });
    }
});

export default router;
