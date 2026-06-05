import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { companyScope } from '../lib/tenant';

const router = Router();
router.use(authMiddleware); // tenancy (ADR-02)

router.get('/', async (req, res) => {
    const users = await prisma.user.findMany({
        where: { ...companyScope(req) },
        include: { department: true },
        orderBy: { createdAt: 'desc' },
    });
    res.json(users);
});

router.post('/', async (req, res) => {
    try {
        // Basic sem validação forte para a V1. Escopo de empresa forçado pelo token.
        const user = await prisma.user.create({
            data: { ...req.body, ...companyScope(req) },
        });
        res.status(201).json(user);
    } catch (error) {
        res.status(400).json({ error: 'Erro ao criar usuário', details: error });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { id: _ignore, companyId: _c, ...data } = req.body ?? {};
        const result = await prisma.user.updateMany({
            where: { id: req.params.id, ...companyScope(req) },
            data,
        });
        if (result.count === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
        const user = await prisma.user.findFirst({ where: { id: req.params.id, ...companyScope(req) } });
        res.json(user);
    } catch (error) {
        res.status(400).json({ error: 'Erro ao atualizar' });
    }
});

router.delete('/:id', async (req, res) => {
    await prisma.user.updateMany({
        where: { id: req.params.id, ...companyScope(req) },
        data: { active: false },
    });
    res.status(204).send();
});

export default router;
