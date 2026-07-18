import { io, type Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

let sharedSocket: Socket | null = null;
let sharedToken: string | null = null;
let sharedRefs = 0;

export function acquireSharedSocket(token: string | null) {
    if (!token) return null;

    if (!sharedSocket || sharedToken !== token) {
        if (sharedSocket) {
            sharedSocket.disconnect();
        }

        sharedSocket = io(SOCKET_URL, {
            auth: { token },
        });
        sharedToken = token;
        sharedRefs = 0;
    }

    sharedRefs += 1;
    return sharedSocket;
}

export function releaseSharedSocket(socket: Socket | null) {
    if (!socket) return;

    if (socket !== sharedSocket) {
        socket.disconnect();
        return;
    }

    sharedRefs = Math.max(0, sharedRefs - 1);

    if (sharedRefs === 0 && sharedSocket) {
        sharedSocket.disconnect();
        sharedSocket = null;
        sharedToken = null;
    }
}
