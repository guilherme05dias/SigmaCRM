import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: Server;

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

        const tokenParts = token.split('fake-jwt-token-for-');
        if (tokenParts.length < 2) {
            console.log('Socket disconnected: Invalid token format');
            socket.disconnect(true);
            return;
        }

        const userId = tokenParts[1];
        socket.data.userId = userId;

        console.log(`Socket connected: User ${userId} (${socket.id})`);

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
            console.log(`Socket disconnected: User ${userId} (${socket.id})`);
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
