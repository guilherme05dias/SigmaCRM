import { useEffect, useState, useRef } from 'react';
import { ConversationList } from '../components/inbox/ConversationList';
import { ChatWindow } from '../components/inbox/ChatWindow';
import { ContactSidebar } from '../components/inbox/ContactSidebar';
import { SigmaSidebarIcon } from '../components/sigma/SigmaSidebarIcon';
import { useNavigate } from 'react-router-dom';
import type { Conversation, Message } from '../components/inbox/types';
import { useInboxSocket } from '../lib/useInboxSocket';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';
import { clearAuthToken, getAuthToken } from '../lib/authToken';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/ui/Toast';

interface DepartmentOption {
    id: string;
    name: string;
    active?: boolean;
}

export default function Inbox() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { showToast } = useToast();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
    const [isLoadingConversations, setIsLoadingConversations] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isClosingConversation, setIsClosingConversation] = useState(false);
    const [isCreatingTicket, setIsCreatingTicket] = useState(false);
    const [createTicketError, setCreateTicketError] = useState<string | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);
    const [isStartingConversation, setIsStartingConversation] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [departments, setDepartments] = useState<DepartmentOption[]>([]);
    const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(false);
    const [messageCursor, setMessageCursor] = useState<string | null>(null);
    const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
    const [activeTab, setActiveTab] = useState<'chats' | 'fila' | 'historico' | 'contatos'>('chats');
    const [unauthorized, setUnauthorized] = useState(false);
    const redirectingRef = useRef(false);

    const token = getAuthToken();

    // Redireciona via useEffect — navigate não deve ser chamado dentro de Promise
    useEffect(() => {
        if (unauthorized && !redirectingRef.current) {
            redirectingRef.current = true;
            clearAuthToken();
            navigate('/login');
        }
    }, [unauthorized, navigate]);

    const handleApiError = (err: unknown) => {
        if (redirectOnUnauthorized(err, navigate)) {
            setUnauthorized(true);
            return true;
        }
        console.error(err);
        showToast({
            title: 'Nao foi possivel concluir a acao',
            description: err instanceof Error ? err.message : 'Tente novamente em alguns instantes.',
            variant: 'error',
        });
        return true;
    };

    const loadConversations = () => {
        setIsLoadingConversations(true);
        apiRequest<Conversation[]>('/api/conversations')
            .then(data => {
                if (Array.isArray(data)) setConversations(data);
            })
            .catch(handleApiError)
            .finally(() => setIsLoadingConversations(false));
    };

    useEffect(() => {
        loadConversations();
        apiRequest<DepartmentOption[]>('/api/departments')
            .then((data) => setDepartments(Array.isArray(data) ? data : []))
            .catch(handleApiError);
    }, []);

    const loadMessages = (id: string, options: { cursor?: string | null; prepend?: boolean } = {}) => {
        setIsLoadingMessages(true);
        const params = new URLSearchParams({ take: '50' });
        if (options.cursor) params.set('cursor', options.cursor);

        apiRequest<{ data: Message[]; meta?: { hasMore?: boolean; nextCursor?: string | null } }>(`/api/conversations/${id}/messages?${params.toString()}`)
            .then(data => {
                if (!data) return;
                const fetched = Array.isArray(data.data) ? data.data : [];
                setMessages((prev) => {
                    if (!options.prepend) return fetched;
                    const existingIds = new Set(prev.map((message) => message.id));
                    const older = fetched.filter((message) => !existingIds.has(message.id));
                    return [...older, ...prev];
                });
                setHasMoreMessages(Boolean(data.meta?.hasMore));
                setMessageCursor(data.meta?.nextCursor ?? null);
            })
            .catch(handleApiError)
            .finally(() => setIsLoadingMessages(false));
    };

    const loadMoreMessages = () => {
        if (!selectedConvId || !hasMoreMessages || isLoadingMessages || !messageCursor) return;
        loadMessages(selectedConvId, { cursor: messageCursor, prepend: true });
    };

    useEffect(() => {
        setMessages([]);
        setHasMoreMessages(false);
        setMessageCursor(null);
        if (selectedConvId) loadMessages(selectedConvId);
    }, [selectedConvId]);

    const { isConnected } = useInboxSocket(
        token,
        selectedConvId,
        // conversation:updated
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
        // message:new
        (newMessage: Message) => {
            if (newMessage.conversationId === selectedConvId) {
                setMessages(prev => {
                    if (prev.find(m => m.id === newMessage.id)) return prev;
                    return [...prev, newMessage];
                });
            }
        },
        // conversation:new — trata como update para aparecer na lista
        undefined,
        // onReconnect — socket reconectou (ex.: WhatsApp voltou): recarrega tudo
        () => {
            loadConversations();
            if (selectedConvId) loadMessages(selectedConvId);
        }
    );

    const handleSelectConversation = (id: string) => setSelectedConvId(id);

    const handleStartConversation = async (phone: string) => {
        setIsStartingConversation(true);

        try {
            const result = await apiRequest<{ conversation: Conversation; created: boolean; hasWhatsApp: boolean }>('/api/conversations/start', {
                method: 'POST',
                body: JSON.stringify({ phone }),
            });

            setConversations((prev) => {
                const safeList = Array.isArray(prev) ? prev : [];
                const exists = safeList.some((conversation) => conversation.id === result.conversation.id);
                const nextList = exists
                    ? safeList.map((conversation) => conversation.id === result.conversation.id ? result.conversation : conversation)
                    : [result.conversation, ...safeList];

                return nextList.sort(
                    (a, b) => new Date((b.lastMessageAt as any) || b.startedAt || b.createdAt || 0).getTime()
                        - new Date((a.lastMessageAt as any) || a.startedAt || a.createdAt || 0).getTime()
                );
            });
            setSelectedConvId(result.conversation.id);
            setActiveTab(result.conversation.status === 'OPEN' ? 'fila' : 'chats');
            loadMessages(result.conversation.id);
            showToast({
                title: result.created ? 'Conversa iniciada' : 'Conversa existente aberta',
                description: 'O contato foi validado no WhatsApp.',
                variant: 'success',
            });
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                showToast({
                    title: 'Nao foi possivel iniciar a conversa',
                    description: err instanceof Error ? err.message : 'Verifique o numero informado e tente novamente.',
                    variant: 'error',
                });
            }
        } finally {
            setIsStartingConversation(false);
        }
    };

    const handleTakeConversation = () => {
        if (!selectedConvId) return;
        apiRequest(`/api/conversations/${selectedConvId}/take`, { method: 'POST' })
            .then(() => {
                loadConversations();
                showToast({ title: 'Conversa assumida', variant: 'success' });
            })
            .catch(handleApiError);
    };

    const handleSendMessage = (body: string) => {
        if (!selectedConvId || !body.trim()) return;
        setIsSubmitting(true);
        setSendError(null);
        apiRequest<Message>(`/api/conversations/${selectedConvId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ body })
        })
            .then((message) => {
                setMessages(prev => {
                    if (prev.find(m => m.id === message.id)) return prev;
                    return [...prev, message];
                });
                loadConversations();
            })
            .catch((err) => {
                if (!redirectOnUnauthorized(err, navigate)) {
                    setSendError(err instanceof Error ? err.message : 'Erro ao enviar mensagem.');
                }
            })
            .finally(() => setIsSubmitting(false));
    };

    const handleTransfer = (departmentId: string) => {
        if (!selectedConvId) return;
        apiRequest(`/api/conversations/${selectedConvId}/transfer`, {
            method: 'POST',
            body: JSON.stringify({ departmentId })
        })
            .then(() => {
                loadConversations();
                showToast({ title: 'Conversa transferida', variant: 'success' });
            })
            .catch(handleApiError);
    };

    const handleCloseConversation = async () => {
        if (!selectedConvId) return;
        setIsClosingConversation(true);
        setSendError(null);

        try {
            const closedConversation = await apiRequest<Conversation>(`/api/inbox/conversations/${selectedConvId}/close`, {
                method: 'POST',
            });
            setConversations((prev) => {
                const safeList = Array.isArray(prev) ? prev : [];
                return safeList.map((conversation) => (
                    conversation.id === closedConversation.id ? { ...conversation, ...closedConversation } : conversation
                ));
            });
            setActiveTab('historico');
            loadMessages(selectedConvId);
            loadConversations();
            showToast({
                title: 'Conversa encerrada',
                description: 'O atendimento foi enviado para o historico.',
                variant: 'success',
            });
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                setSendError(err instanceof Error ? err.message : 'Erro ao encerrar conversa.');
            }
        } finally {
            setIsClosingConversation(false);
        }
    };

    const handleCreateTicket = async (payload: { title: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; description?: string | null }) => {
        if (!selectedConvId) return;
        setIsCreatingTicket(true);
        setCreateTicketError(null);

        try {
            await apiRequest(`/api/inbox/conversations/${selectedConvId}/tickets`, {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            loadConversations();
            showToast({
                title: 'Chamado criado',
                description: 'O chamado foi vinculado a esta conversa.',
                variant: 'success',
            });
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Erro ao criar chamado.';
                setCreateTicketError(message);
                throw err;
            }
        } finally {
            setIsCreatingTicket(false);
        }
    };

    // Guard defensivo — sempre array mesmo se algo inesperado acontecer
    const safeConversations = Array.isArray(conversations) ? conversations : [];
    const selectedConv = safeConversations.find(c => c.id === selectedConvId) ?? null;
    const visibleConversations = activeTab === 'fila'
        ? safeConversations.filter((conversation) => conversation.status === 'OPEN')
        : activeTab === 'chats'
            ? safeConversations.filter((conversation) => conversation.status === 'ASSIGNED')
            : activeTab === 'historico'
                ? safeConversations.filter((conversation) => conversation.status === 'CLOSED')
                : safeConversations.filter((conversation, index, list) => (
                    list.findIndex((item) => item.contactId === conversation.contactId) === index
                ));

    // Não renderiza conteúdo enquanto redireciona
    if (unauthorized) return null;

    return (
        <div className="relative flex h-screen w-full flex-col overflow-hidden bg-background pb-16 font-sans text-foreground md:flex-row md:pb-0">
            {!isConnected && (
                <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-warning-soft text-warning-fg px-3 py-1 rounded-full text-xs font-medium border border-warning/30 shadow-lifted z-50 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-warning animate-pulse"></span>
                    Reconectando...
                </div>
            )}
            <SigmaSidebarIcon user={user} onLogout={logout} />
            <ConversationList
                conversations={visibleConversations}
                selectedId={selectedConvId}
                onSelect={handleSelectConversation}
                onStartConversation={handleStartConversation}
                isStartingConversation={isStartingConversation}
                isLoading={isLoadingConversations}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
            />
            <ChatWindow
                conversation={selectedConv}
                messages={messages}
                isLoading={isLoadingMessages}
                isSubmitting={isSubmitting}
                sendError={sendError}
                onTake={handleTakeConversation}
                onSend={handleSendMessage}
                onTransfer={handleTransfer}
                onCloseConversation={handleCloseConversation}
                onCreateTicket={handleCreateTicket}
                onBack={() => setSelectedConvId(null)}
                isClosingConversation={isClosingConversation}
                isCreatingTicket={isCreatingTicket}
                createTicketError={createTicketError}
                departments={departments}
                hasMore={hasMoreMessages}
                onLoadMore={loadMoreMessages}
            />
            <ContactSidebar conversation={selectedConv} />
        </div>
    );
}
