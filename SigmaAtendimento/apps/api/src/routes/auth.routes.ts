import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { authMiddleware } from '../middlewares/auth.middleware';
import { verifyPassword, isHashed, hashPassword } from '../lib/password';

const router = Router();

import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { rateLimit } from '../middlewares/rateLimit.middleware';

const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});

const invalidCredentials = { error: 'E-mail ou senha inválidos' };
const DUMMY_PASSWORD_HASH = '$2b$10$7EqJtq98hPqEX7fNZaFWoO5uUEG8VQw4KpVbDdd4VQJHjKcQb1j6K';

const loginIpLimit = rateLimit(15 * 60_000, 20, (req) => `login:ip:${req.ip || 'unknown'}`);
const loginIdentityLimit = rateLimit(15 * 60_000, 8, (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : 'invalid';
    return `login:identity:${email}`;
});

router.post('/login', loginIpLimit, loginIdentityLimit, async (req, res) => {
    try {
        const { email: rawEmail, password } = LoginSchema.parse(req.body);
        const email = rawEmail.trim().toLowerCase();

        // Auth Simples para V1 Fundação
        const user = await prisma.user.findUnique({ where: { email } });
        // Faz uma comparação bcrypt mesmo quando o usuário não existe,
        // reduzindo diferenças de tempo que facilitariam enumeração de contas.
        // C1: bcrypt + migração preguiçosa de senhas legadas em texto puro.
        const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
        if (!user || !user.active || !passwordOk) {
            return res.status(401).json(invalidCredentials);
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
                specialty: user.specialty,
                canViewAllConversations: user.canViewAllConversations,
            },
            env.jwtSecret,
            { expiresIn: '1d' }
        );

        res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, specialty: user.specialty, companyId: user.companyId, canViewAllConversations: user.canViewAllConversations } });
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
                specialty: true,
                companyId: true,
                departmentId: true,
                messageSignature: true,
                canViewAllConversations: true,
                department: { select: { name: true } },
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
