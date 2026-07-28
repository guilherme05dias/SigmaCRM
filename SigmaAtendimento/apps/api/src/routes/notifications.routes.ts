import { Router } from 'express';
import { NotificationType, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { getCompanyId } from '../lib/tenant';

const router = Router();

const ListQuerySchema = z.object({
    unreadOnly: z.string().optional(),
    mascotOnly: z.string().optional(),
    take: z.string().optional().transform((value) => value ? Math.min(Math.max(Number(value), 1), 100) : 20),
});

router.use(authMiddleware);

router.get('/', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Usuário não identificado' });

        const parsed = ListQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Parâmetros inválidos', details: parsed.error.issues });
        }

        const unreadOnly = parsed.data.unreadOnly === 'true';
        const mascotOnly = parsed.data.mascotOnly === 'true';
        const where = {
            companyId,
            userId,
            ...(unreadOnly ? { readAt: null } : {}),
            ...(mascotOnly ? {
                type: NotificationType.ASSISTANT_TASK_DUE,
                payload: { path: ['mascotAgentId'], equals: 'FOLLOWUP_MASCOT' },
            } : {}),
        } satisfies Prisma.NotificationWhereInput;

        const [items, unreadCount] = await Promise.all([
            prisma.notification.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: parsed.data.take,
            }),
            prisma.notification.count({
                where: { ...where, readAt: null },
            }),
        ]);

        res.json({ items, unreadCount });
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Erro ao listar notificações' });
    }
});

router.post('/:id/read', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Usuário não identificado' });

        const result = await prisma.notification.updateMany({
            where: { id: req.params.id, companyId, userId },
            data: { readAt: new Date() },
        });

        if (result.count === 0) {
            return res.status(404).json({ error: 'Notificação não encontrada' });
        }

        res.json({ ok: true });
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Erro ao marcar notificação como lida' });
    }
});

router.post('/read-all', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Usuário não identificado' });

        const result = await prisma.notification.updateMany({
            where: { companyId, userId, readAt: null },
            data: { readAt: new Date() },
        });

        res.json({ ok: true, updated: result.count });
    } catch (error: any) {
        res.status(error?.status ?? 500).json({ error: error?.message ?? 'Erro ao marcar notificações como lidas' });
    }
});

export default router;
