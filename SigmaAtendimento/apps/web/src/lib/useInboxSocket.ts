/// <reference types="vite/client" />
import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Conversation, Message } from '../components/inbox/types';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3334';

export function useInboxSocket(
    token: string | null,
    currentConversationId: string | null,
    onConversationUpdated: (updatedConv: any) => void,
    onMessageNew: (newMessage: any) => void,
    onConversationNew?: (newConv: any) => void,
    /** Chamado em reconexões (NÃO na conexão inicial) para recarregar dados. */
    onReconnect?: () => void
) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    const callbacksRef = useRef({ onConversationUpdated, onMessageNew, onConversationNew, onReconnect });

    useEffect(() => {
        callbacksRef.current = { onConversationUpdated, onMessageNew, onConversationNew, onReconnect };
    });

    useEffect(() => {
        if (!token) return;

        const newSocket = io(SOCKET_URL, {
            auth: { token }
        });

        // isFirstConnect é local a esta instância de socket — a primeira conexão
        // é a inicial; todas as seguintes são reconexões (socket.io reconecta auto).
        let isFirstConnect = true;

        newSocket.on('connect', () => {
            setIsConnected(true);
            if (!isFirstConnect) {
                callbacksRef.current.onReconnect?.();
            }
            isFirstConnect = false;
        });

        newSocket.on('disconnect', () => setIsConnected(false));

        newSocket.on('conversation:updated', (conv) => {
            callbacksRef.current.onConversationUpdated(conv);
        });

        newSocket.on('message:new', (msg) => {
            callbacksRef.current.onMessageNew(msg);
        });

        newSocket.on('conversation:new', (conv) => {
            if (callbacksRef.current.onConversationNew) {
                callbacksRef.current.onConversationNew(conv);
            } else {
                callbacksRef.current.onConversationUpdated(conv);
            }
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, [token]);

    // Handle joining/leaving rooms
    useEffect(() => {
        if (!socket || !isConnected) return;

        if (currentConversationId) {
            socket.emit('conversation:join', { conversationId: currentConversationId });
        }

        return () => {
            if (currentConversationId) {
                socket.emit('conversation:leave', { conversationId: currentConversationId });
            }
        };
    }, [socket, isConnected, currentConversationId]);

    return { isConnected, socket };
}
