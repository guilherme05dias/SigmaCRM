import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { canViewAll, requireAdminOrSupervisor } from '../middlewares/authorization.middleware';
import { companyScope } from '../lib/tenant';
import { ensureHashed } from '../lib/password';
import { Prisma, UserRole } from '@prisma/client';
import { z } from 'zod';

const router = Router();
router.use(authMiddleware);

const safeUserSelect = {
    id: true,
    companyId: true,
    name: true,
    email: true,
    role: true,
    specialty: true,
    messageSignature: true,
    departmentId: true,
    active: true,
    createdAt: true,
    updatedAt: true,
    department: true,
} as const;

const UserCreateSchema = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    password: z.string().min(8).max(128).optional(),
    passwordHash: z.string().min(8).optional(),
    role: z.nativeEnum(UserRole).default(UserRole.ATTENDANT),
    specialty: z.string().trim().max(160).nullable().optional(),
    departmentId: z.string().uuid().nullable().optional(),
    active: z.boolean().optional(),
    messageSignature: z.string().trim().max(500).nullable().optional(),
}).strict().refine((data) => Boolean(data.password || data.passwordHash), {
    message: 'Senha obrigatória para criar usuário',
    path: ['password'],
});

const UserUpdateSchema = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
    password: z.string().min(8).max(128).optional(),
    passwordHash: z.string().min(8).optional(),
    role: z.nativeEnum(UserRole).optional(),
    specialty: z.string().trim().max(160).nullable().optional(),
    departmentId: z.string().uuid().nullable().optional(),
    active: z.boolean().optional(),
    messageSignature: z.string().trim().max(500).nullable().optional(),
}).strict();

function supervisorCanManageRole(role: UserRole) {
    return role === UserRole.ATTENDANT || role === UserRole.TECHNICIAN;
}

async function assertDepartmentInCompany(departmentId: string | null | undefined, companyId: string) {
    if (!departmentId) return;
    const department = await prisma.department.findFirst({ where: { id: departmentId, companyId }, select: { id: true } });
    if (!department) throw Object.assign(new Error('Departamento não encontrado nesta empresa'), { status: 404 });
}

router.get('/', async (req, res) => {
    if (!canViewAll(req.user?.role)) {
        const users = await prisma.user.findMany({
            where: { ...companyScope(req), active: true, role: { in: ['ATTENDANT', 'TECHNICIAN'] } },
            select: { id: true, name: true, role: true, active: true, departmentId: true },
            orderBy: { name: 'asc' },
        });
        return res.json(users);
    }

    const users = await prisma.user.findMany({
        where: { ...companyScope(req) },
        select: safeUserSelect,
        orderBy: { createdAt: 'desc' },
    });
    res.json(users);
});

router.post('/', requireAdminOrSupervisor, async (req, res) => {
    try {
        const parsed = UserCreateSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.issues });
        const { password, passwordHash, messageSignature, ...data } = parsed.data;
        if (req.user?.role === UserRole.SUPERVISOR && !supervisorCanManageRole(data.role)) {
            return res.status(403).json({ error: 'Supervisores não podem criar administradores ou supervisores.' });
        }
        const companyId = companyScope(req).companyId;
        await assertDepartmentInCompany(data.departmentId, companyId);

        const finalHash = await ensureHashed((passwordHash ?? password)!);
        const user = await prisma.user.create({
            data: { ...data, messageSignature: messageSignature || null, passwordHash: finalHash, ...companyScope(req) },
            select: safeUserSelect,
        });
        res.status(201).json(user);
    } catch (error: any) {
        res.status(error?.status ?? 400).json({ error: error?.message ?? 'Erro ao criar usuário' });
    }
});

router.put('/:id', requireAdminOrSupervisor, async (req, res) => {
    try {
        const parsed = UserUpdateSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.issues });
        const target = await prisma.user.findFirst({ where: { id: req.params.id, ...companyScope(req) }, select: { id: true, role: true } });
        if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });

        const { password, passwordHash, messageSignature, ...data } = parsed.data;
        if (data.role !== undefined && req.params.id === req.user?.id) {
            return res.status(403).json({ error: 'Não é permitido alterar o próprio papel.' });
        }
        if (req.user?.role === UserRole.SUPERVISOR) {
            if (!supervisorCanManageRole(target.role) || (data.role !== undefined && !supervisorCanManageRole(data.role))) {
                return res.status(403).json({ error: 'Supervisores só podem gerenciar atendentes e técnicos.' });
            }
        }
        await assertDepartmentInCompany(data.departmentId, companyScope(req).companyId);
        const updateData: Prisma.UserUpdateManyMutationInput = { ...data };
        if (password || passwordHash) {
            updateData.passwordHash = await ensureHashed((passwordHash ?? password)!);
        }
        if (messageSignature !== undefined) updateData.messageSignature = messageSignature || null;
        const result = await prisma.user.updateMany({
            where: { id: req.params.id, ...companyScope(req) },
            data: updateData,
        });
        if (result.count === 0) return res.status(404).json({ error: 'Usuario nao encontrado' });
        const user = await prisma.user.findFirst({ where: { id: req.params.id, ...companyScope(req) }, select: safeUserSelect });
        res.json(user);
    } catch (error: any) {
        res.status(error?.status ?? 400).json({ error: error?.message ?? 'Erro ao atualizar usuário' });
    }
});

router.delete('/:id', requireAdminOrSupervisor, async (req, res) => {
    const target = await prisma.user.findFirst({ where: { id: req.params.id, ...companyScope(req) }, select: { role: true } });
    if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (req.params.id === req.user?.id) return res.status(403).json({ error: 'Não é permitido desativar o próprio usuário.' });
    if (req.user?.role === UserRole.SUPERVISOR && !supervisorCanManageRole(target.role)) {
        return res.status(403).json({ error: 'Supervisores só podem gerenciar atendentes e técnicos.' });
    }
    await prisma.user.updateMany({
        where: { id: req.params.id, ...companyScope(req) },
        data: { active: false },
    });
    res.status(204).send();
});

export default router;
