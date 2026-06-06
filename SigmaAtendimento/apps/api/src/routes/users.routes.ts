import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { companyScope } from '../lib/tenant';
import { ensureHashed } from '../lib/password';

const router = Router();
router.use(authMiddleware); // tenancy (ADR-02)

router.get('/', async (req, res) => {
    const users = await prisma.user.findMany({
        where: { ...companyScope(req) },
        include: { department: true },
        orderBy: { createdAt: 'desc' },
    });
    const signatures = await prisma.$queryRawUnsafe<Array<{ id: string; messageSignature: string | null }>>(
        'SELECT id, message_signature as "messageSignature" FROM "User" WHERE company_id = $1',
        companyScope(req).companyId
    );
    const signatureByUserId = new Map(signatures.map((item) => [item.id, item.messageSignature]));

    res.json(users.map((user) => ({
        ...user,
        messageSignature: signatureByUserId.get(user.id) ?? null,
    })));
});

router.post('/', async (req, res) => {
    try {
        const { password, passwordHash, messageSignature, id: _id, companyId: _companyId, ...data } = req.body ?? {};

        if (!password && !passwordHash) {
            return res.status(400).json({ error: 'Senha obrigatória para criar usuário' });
        }

        // C1: grava sempre hash bcrypt (ensureHashed hasheia se vier em texto puro).
        const finalHash = await ensureHashed(passwordHash ?? password);
        const user = await prisma.user.create({
            data: { ...data, passwordHash: finalHash, ...companyScope(req) },
        });
        if (messageSignature !== undefined) {
            await prisma.$executeRawUnsafe(
                'UPDATE "User" SET message_signature = $1 WHERE id = $2 AND company_id = $3',
                messageSignature || null,
                user.id,
                companyScope(req).companyId
            );
        }
        res.status(201).json({ ...user, messageSignature: messageSignature || null });
    } catch (error) {
        res.status(400).json({ error: 'Erro ao criar usuário', details: error });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { id: _ignore, companyId: _c, password, passwordHash, messageSignature, ...data } = req.body ?? {};
        if (password || passwordHash) {
            // C1: hasheia antes de gravar (só quando uma nova senha foi enviada).
            data.passwordHash = await ensureHashed(passwordHash ?? password);
        }
        const result = await prisma.user.updateMany({
            where: { id: req.params.id, ...companyScope(req) },
            data,
        });
        if (result.count === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
        if (messageSignature !== undefined) {
            await prisma.$executeRawUnsafe(
                'UPDATE "User" SET message_signature = $1 WHERE id = $2 AND company_id = $3',
                messageSignature || null,
                req.params.id,
                companyScope(req).companyId
            );
        }
        const user = await prisma.user.findFirst({ where: { id: req.params.id, ...companyScope(req) } });
        res.json({ ...user, messageSignature: messageSignature || null });
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
