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
    onConversationNew?: (newConv: any) => void
) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    const callbacksRef = useRef({ onConversationUpdated, onMessageNew, onConversationNew });

    useEffect(() => {
        callbacksRef.current = { onConversationUpdated, onMessageNew, onConversationNew };
    });

    useEffect(() => {
        if (!token) return;

        const newSocket = io(SOCKET_URL, {
            auth: { token }
        });

        newSocket.on('connect', () => {
            console.log('Socket connected');
            setIsConnected(true);
        });

        newSocket.on('disconnect', () => {
            console.log('Socket disconnected');
            setIsConnected(false);
        });

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
