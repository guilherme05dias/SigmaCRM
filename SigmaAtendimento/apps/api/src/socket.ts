import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import type { AuthPayload } from './middlewares/auth.middleware';
import { prisma } from './lib/prisma';
import { env, isOriginAllowed } from './config/env';

let io: Server;

export const initSocket = (httpServer: HttpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: (origin, callback) => {
                if (isOriginAllowed(origin)) {
                    return callback(null, true);
                }
                return callback(new Error(`Origem nao permitida pelo Socket.io: ${origin}`));
            },
            methods: ['GET', 'POST']
        }
    });

    io.on('connection', (socket: Socket) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token || typeof token !== 'string') {
            console.log('Socket disconnected: Missing token');
            socket.disconnect(true);
            return;
        }

        let payload: AuthPayload;

        try {
            payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
        } catch {
            console.log('Socket disconnected: Invalid token');
            socket.disconnect(true);
            return;
        }

        socket.data.userId = payload.id;
        socket.data.companyId = payload.companyId;
        socket.data.role = payload.role;

        // C4: cada socket entra na sala da sua empresa — isolamento multi-tenant
        // dos eventos broadcast (conversation:*, ticket:*).
        if (payload.companyId) {
            socket.join(`company:${payload.companyId}`);
        }

        console.log(`Socket connected: User ${payload.id} (${socket.id})`);
        socket.join(`user:${payload.id}`);

        socket.on('conversation:join', async ({ conversationId }) => {
            if (!conversationId || !socket.data.companyId) return;

            const conversation = await prisma.conversation.findFirst({
                where: { id: conversationId, companyId: socket.data.companyId },
                select: { id: true },
            });

            if (conversation) {
                socket.join(`conversation:${conversationId}`);
            }
        });

        socket.on('conversation:leave', ({ conversationId }) => {
            if (conversationId) {
                socket.leave(`conversation:${conversationId}`);
                // console.log(`Socket ${socket.id} left conversation:${conversationId}`);
            }
        });

        socket.on('disconnect', () => {
            console.log(`Socket disconnected: User ${payload.id} (${socket.id})`);
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized');
    }
    return io;
};

/**
 * C4: emite um evento APENAS para os sockets da empresa informada.
 * Use para eventos broadcast (conversation:*, ticket:*) em vez de getIO().emit(),
 * que vaza para todas as empresas. Se companyId for nulo, faz no-op seguro
 * (não faz broadcast global — evita vazamento por engano).
 */
export const emitToCompany = (
    companyId: string | null | undefined,
    event: string,
    payload: unknown
) => {
    if (!companyId) {
        console.warn(`[socket] emitToCompany sem companyId — evento "${event}" não emitido`);
        return;
    }
    getIO().to(`company:${companyId}`).emit(event, payload);
};

export const emitToUser = (
    userId: string | null | undefined,
    event: string,
    payload: unknown
) => {
    if (!userId) {
        console.warn(`[socket] emitToUser sem userId — evento "${event}" não emitido`);
        return;
    }
    getIO().to(`user:${userId}`).emit(event, payload);
};
