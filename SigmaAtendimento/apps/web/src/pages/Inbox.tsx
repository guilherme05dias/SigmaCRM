import { useEffect, useState, useRef } from 'react';
import { ConversationList } from '../components/inbox/ConversationList';
import { ChatWindow } from '../components/inbox/ChatWindow';
import { ContactSidebar } from '../components/inbox/ContactSidebar';
import { SigmaSidebarIcon } from '../components/sigma/SigmaSidebarIcon';
import { useNavigate } from 'react-router-dom';
import type { Conversation, Message } from '../components/inbox/types';
import { useInboxSocket } from '../lib/useInboxSocket';

export default function Inbox() {
    const navigate = useNavigate();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(false);
    const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
    const [activeTab, setActiveTab] = useState<'chats' | 'fila' | 'contatos'>('chats');
    const [unauthorized, setUnauthorized] = useState(false);
    const redirectingRef = useRef(false);

    const token = localStorage.getItem('sigma-token');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    // Redireciona via useEffect — navigate não deve ser chamado dentro de Promise
    useEffect(() => {
        if (unauthorized && !redirectingRef.current) {
            redirectingRef.current = true;
            localStorage.removeItem('sigma-token');
            navigate('/login');
        }
    }, [unauthorized, navigate]);

    /** Sinaliza 401/403 como estado — não navega diretamente */
    const handle401 = (res: Response): boolean => {
        if (res.status === 401 || res.status === 403) {
            setUnauthorized(true);
            return true;
        }
        return false;
    };

    const loadConversations = () => {
        fetch('http://localhost:3334/api/conversations', { headers })
            .then(res => {
                if (handle401(res)) return null;
                return res.json();
            })
            .then(data => {
                if (Array.isArray(data)) setConversations(data);
            })
            .catch(console.error);
    };

    useEffect(() => {
        loadConversations();
    }, []);

    const loadMessages = (id: string, cursor?: string) => {
        setIsLoadingMessages(true);
        const url = new URL(`http://localhost:3334/api/conversations/${id}/messages`);
        if (cursor) url.searchParams.append('cursor', cursor);
        url.searchParams.append('take', '50');

        fetch(url.toString(), { headers })
            .then(res => {
                if (handle401(res)) return null;
                return res.json();
            })
            .then(data => {
                if (!data) return;
                const fetchedMessages = Array.isArray(data.data) ? data.data : [];
                const meta = data.meta || { hasMore: false };

                if (cursor) {
                    setMessages(prev => {
                        const existingIds = new Set(prev.map(m => m.id));
                        const newMsgs = fetchedMessages.filter((m: Message) => !existingIds.has(m.id));
                        return [...newMsgs, ...prev];
                    });
                } else {
                    setMessages(fetchedMessages);
                }
                setHasMoreMessages(meta.hasMore);
            })
            .catch(console.error)
            .finally(() => setIsLoadingMessages(false));
    };

    const loadMoreMessages = () => {
        if (!selectedConvId || !hasMoreMessages || messages.length === 0 || isLoadingMessages) return;
        const sortedMessages = [...messages].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        const cursor = sortedMessages[0]?.id;
        if (cursor) loadMessages(selectedConvId, cursor);
    };

    useEffect(() => {
        if (selectedConvId) loadMessages(selectedConvId);
    }, [selectedConvId]);

    const { isConnected } = useInboxSocket(
        token,
        selectedConvId,
        (updatedConv: Conversation) => {
            setConversations(prev => {
                const safeList = Array.isArray(prev) ? prev : [];
                const exists = safeList.find(c => c.id === updatedConv.id);
                const newList = exists
                    ? safeList.map(c => c.id === updatedConv.id ? updatedConv : c)
                    : [updatedConv, ...safeList];
                return [...newList].sort(
                    (a, b) => new Date((b.lastMessageAt as any) || 0).getTime() - new Date((a.lastMessageAt as any) || 0).getTime()
                );
            });
        },
        (newMessage: Message) => {
            if (newMessage.conversationId === selectedConvId) {
                setMessages(prev => {
                    if (prev.find(m => m.id === newMessage.id)) return prev;
                    return [...prev, newMessage];
                });
            }
        }
    );

    const handleSelectConversation = (id: string) => setSelectedConvId(id);

    const handleTakeConversation = () => {
        if (!selectedConvId) return;
        fetch(`http://localhost:3334/api/conversations/${selectedConvId}/take`, { method: 'POST', headers })
            .then(res => { if (!handle401(res)) loadConversations(); })
            .catch(console.error);
    };

    const handleSendMessage = (body: string) => {
        if (!selectedConvId || !body.trim()) return;
        setIsSubmitting(true);
        fetch(`http://localhost:3334/api/conversations/${selectedConvId}/messages`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ body })
        })
            .then(res => { if (!handle401(res)) loadConversations(); })
            .catch(console.error)
            .finally(() => setIsSubmitting(false));
    };

    const handleTransfer = (departmentId: string) => {
        if (!selectedConvId) return;
        fetch(`http://localhost:3334/api/conversations/${selectedConvId}/transfer`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ departmentId })
        })
            .then(res => { if (!handle401(res)) loadConversations(); })
            .catch(console.error);
    };

    const handleLogout = () => {
        localStorage.removeItem('sigma-token');
        navigate('/login');
    };

    // Guard defensivo — sempre array mesmo se algo inesperado acontecer
    const safeConversations = Array.isArray(conversations) ? conversations : [];
    const selectedConv = safeConversations.find(c => c.id === selectedConvId) ?? null;
    const mockUser = { nome: 'Admin', role: 'Administrador' };

    // Não renderiza conteúdo enquanto redireciona
    if (unauthorized) return null;

    return (
        <div className="flex w-full h-screen bg-background overflow-hidden text-foreground font-sans relative">
            {!isConnected && (
                <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-warning-soft text-warning-fg px-3 py-1 rounded-full text-xs font-medium border border-warning/30 shadow-lifted z-50 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-warning animate-pulse"></span>
                    Reconectando...
                </div>
            )}
            <SigmaSidebarIcon user={mockUser} onLogout={handleLogout} />
            <ConversationList
                conversations={safeConversations.filter(c =>
                    activeTab === 'fila' ? c.status === 'OPEN' : c.status !== 'OPEN'
                )}
                selectedId={selectedConvId}
                onSelect={handleSelectConversation}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
            />
            <ChatWindow
                conversation={selectedConv}
                messages={messages}
                isLoading={isLoadingMessages}
                isSubmitting={isSubmitting}
                onTake={handleTakeConversation}
                onSend={handleSendMessage}
                onTransfer={handleTransfer}
                hasMore={hasMoreMessages}
                onLoadMore={loadMoreMessages}
            />
            <ContactSidebar conversation={selectedConv} />
        </div>
    );
}
