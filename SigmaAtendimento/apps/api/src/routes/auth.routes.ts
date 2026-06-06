import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { authMiddleware } from '../middlewares/auth.middleware';
import { verifyPassword, isHashed, hashPassword } from '../lib/password';

const router = Router();

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'sigma-secret-dev-key';

const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = LoginSchema.parse(req.body);

        // Auth Simples para V1 Fundação
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            console.log('Login failed: user not found', email);
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }
        if (!user.active) {
            return res.status(403).json({ error: 'Usuário inativo' });
        }
        // C1: bcrypt + migração preguiçosa de senhas legadas em texto puro.
        const passwordOk = await verifyPassword(password, user.passwordHash);
        if (!passwordOk) {
            return res.status(401).json({ error: 'Senha incorreta' });
        }
        // Upgrade preguiçoso: se a senha ainda estava em texto puro, re-hasheia agora.
        if (!isHashed(user.passwordHash)) {
            const upgraded = await hashPassword(password);
            await prisma.user.update({ where: { id: user.id }, data: { passwordHash: upgraded } });
        }

        // Real JWT token (inclui companyId p/ multi-tenant — ADR-02)
        const token = jwt.sign(
            {
                id: user.id,
                role: user.role,
                companyId: user.companyId,
                departmentId: user.departmentId,
                name: user.name,
                email: user.email,
            },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, companyId: user.companyId } });
    } catch (error: any) {
        console.error('Login Error:', error);
        if (error?.name === 'ZodError') {
            return res.status(400).json({ error: 'Erro na validação dos campos', details: error.errors });
        }
        res.status(500).json({ error: 'Erro interno no servidor ao tentar logar' });
    }
});

router.get('/me', authMiddleware, async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: 'Token inválido' });
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                companyId: true,
                departmentId: true,
                active: true,
            },
        });

        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        if (!user.active) {
            return res.status(403).json({ error: 'Usuário inativo' });
        }

        res.json(user);
    } catch (error) {
        console.error('Me Error:', error);
        res.status(500).json({ error: 'Erro interno ao carregar usuário' });
    }
});

export default router;
