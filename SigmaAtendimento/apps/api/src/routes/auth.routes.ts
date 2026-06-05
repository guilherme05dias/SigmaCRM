import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

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
        // DEV: comparação em texto puro. TODO(M3/M6): migrar para hash (bcrypt/argon2).
        if (user.passwordHash !== password) {
            return res.status(401).json({ error: 'Senha incorreta' });
        }

        // Real JWT token (inclui companyId p/ multi-tenant — ADR-02)
        const token = jwt.sign(
            { id: user.id, role: user.role, companyId: user.companyId, departmentId: user.departmentId },
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

export default router;
