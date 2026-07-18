import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthPayload {
    id: string;
    role: string;
    companyId?: string | null;
    departmentId?: string | null;
    name?: string;
    email?: string;
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthPayload;
        }
    }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Token nao fornecido' });
    }

    const parts = authHeader.split(' ');

    if (parts.length !== 2) {
        return res.status(401).json({ error: 'Erro de token' });
    }

    const [scheme, token] = parts;

    if (!/^Bearer$/i.test(scheme)) {
        return res.status(401).json({ error: 'Token mal formatado' });
    }

    jwt.verify(token, env.jwtSecret, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Token invalido' });
        }

        req.user = decoded as AuthPayload;
        return next();
    });
}
