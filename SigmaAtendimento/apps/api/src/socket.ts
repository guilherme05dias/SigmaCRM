import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import type { AuthPayload } from './middlewares/auth.middleware';

let io: Server;
const JWT_SECRET = process.env.JWT_SECRET || 'sigma-secret-dev-key';

export const initSocket = (httpServer: HttpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: '*',
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
            payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
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

        socket.on('conversation:join', ({ conversationId }) => {
            if (conversationId) {
                socket.join(`conversation:${conversationId}`);
                // console.log(`Socket ${socket.id} joined conversation:${conversationId}`);
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
