import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireAdminOrSupervisor } from '../middlewares/authorization.middleware';
import { companyScope } from '../lib/tenant';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
    const depts = await prisma.department.findMany({
        where: { ...companyScope(req) },
        orderBy: { name: 'asc' },
    });
    res.json(depts);
});

router.post('/', requireAdminOrSupervisor, async (req, res) => {
    try {
        const dept = await prisma.department.create({
            data: { ...req.body, ...companyScope(req) },
        });
        res.status(201).json(dept);
    } catch (error) {
        res.status(400).json({ error: 'Erro ao criar departamento' });
    }
});

router.put('/:id', requireAdminOrSupervisor, async (req, res) => {
    try {
        const { id: _ignore, companyId: _c, ...data } = req.body ?? {};
        const result = await prisma.department.updateMany({
            where: { id: req.params.id, ...companyScope(req) },
            data,
        });
        if (result.count === 0) return res.status(404).json({ error: 'Departamento nao encontrado' });
        const dept = await prisma.department.findFirst({ where: { id: req.params.id, ...companyScope(req) } });
        res.json(dept);
    } catch (error) {
        res.status(400).json({ error: 'Erro ao atualizar departamento' });
    }
});

router.delete('/:id', requireAdminOrSupervisor, async (req, res) => {
    try {
        const result = await prisma.department.updateMany({
            where: { id: req.params.id, ...companyScope(req) },
            data: { active: false },
        });
        if (result.count === 0) return res.status(404).json({ error: 'Departamento nao encontrado' });
        res.status(204).send();
    } catch (error) {
        res.status(400).json({ error: 'Erro ao inativar departamento' });
    }
});

export default router;
