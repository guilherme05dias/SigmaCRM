import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { SigmaSidebarIcon } from '../components/sigma/SigmaSidebarIcon';
import { useNavigate } from 'react-router-dom';
import type { Conversation, Message, OutgoingMessagePayload } from '../components/inbox/types';
import { useInboxSocket } from '../lib/useInboxSocket';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';
import { clearAuthToken, getAuthToken } from '../lib/authToken';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/ui/Toast';

const ConversationList = lazy(() => import('../components/inbox/ConversationList').then((module) => ({ default: module.ConversationList })));
const ChatWindow = lazy(() => import('../components/inbox/ChatWindow').then((module) => ({ default: module.ChatWindow })));
const ContactSidebar = lazy(() => import('../components/inbox/ContactSidebar').then((module) => ({ default: module.ContactSidebar })));

function InboxColumnSkeleton() {
    return <div className="hidden md:block md:w-[320px] lg:w-[360px]" />;
}

interface DepartmentOption {
    id: string;
    name: string;
    active?: boolean;
}

interface ServiceTopicOption {
    id: string;
    name: string;
    description?: string | null;
    active?: boolean;
}

interface UserOption {
    id: string;
    name: string;
    role: string;
    active?: boolean;
}

interface CloseConversationPayload {
    result: string;
    summary: string;
    serviceTopicId: string;
    otherTopicDescription?: string | null;
    notes?: string | null;
    fieldServiceRequired?: boolean;
    sendSatisfactionSurvey?: boolean;
}

type ManagementScope = 'mine' | 'all';

function canSeeConversation(user: { id: string; role: string } | null, conversation: Conversation, managementScope: ManagementScope) {
    if (!user) return false;
    if ((user.role === 'ADMIN' || user.role === 'SUPERVISOR') && managementScope === 'all') return true;
    return conversation.status === 'OPEN' || conversation.assignedUser?.id === user.id;
}

function conversationActivityTime(conversation: Conversation): number {
    const previewTime = conversation.messages?.[0]?.createdAt
        ? new Date(conversation.messages[0].createdAt as any).getTime()
        : 0;
    const activityTime = new Date(
        conversation.lastMessageAt
        || conversation.startedAt
        || conversation.createdAt
        || 0
    ).getTime();
    return Math.max(previewTime, activityTime);
}

function sortConversationsByActivity(list: Conversation[]): Conversation[] {
    return [...list].sort((first, second) => {
        const diff = conversationActivityTime(second) - conversationActivityTime(first);
        return diff !== 0 ? diff : second.id.localeCompare(first.id);
    });
}

function conversationPreference(conversation: Conversation): [number, number, number] {
    const statusPriority = conversation.status === 'ASSIGNED' ? 2 : conversation.status === 'OPEN' ? 1 : 0;
    const hasMessagePreview = conversation.messages?.length ? 1 : 0;
    return [statusPriority, hasMessagePreview, conversationActivityTime(conversation)];
}

function isPreferredConversation(candidate: Conversation, current: Conversation): boolean {
    const candidatePreference = conversationPreference(candidate);
    const currentPreference = conversationPreference(current);

    for (let index = 0; index < candidatePreference.length; index += 1) {
        if (candidatePreference[index] !== currentPreference[index]) {
            return candidatePreference[index] > currentPreference[index];
        }
    }

    return candidate.id > current.id;
}

function deduplicateConversationsByContact(list: Conversation[]): Conversation[] {
    const preferredByContact = new Map<string, Conversation>();

    for (const conversation of list) {
        const contactKey = conversation.contactId || conversation.contact?.phone || conversation.id;
        const current = preferredByContact.get(contactKey);
        if (!current || isPreferredConversation(conversation, current)) {
            preferredByContact.set(contactKey, conversation);
        }
    }

    return sortConversationsByActivity(Array.from(preferredByContact.values()));
}

function isInboxActivelyViewed() {
    return document.visibilityState === 'visible' && document.hasFocus();
}

export default function Inbox() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { showToast } = useToast();
    const isManager = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
    const [isLoadingConversations, setIsLoadingConversations] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSyncingHistory, setIsSyncingHistory] = useState(false);
    const [isClosingConversation, setIsClosingConversation] = useState(false);
    const [isCreatingTicket, setIsCreatingTicket] = useState(false);
    const [createTicketError, setCreateTicketError] = useState<string | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);
    const [isStartingConversation, setIsStartingConversation] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [departments, setDepartments] = useState<DepartmentOption[]>([]);
    const [serviceTopics, setServiceTopics] = useState<ServiceTopicOption[]>([]);
    const [technicians, setTechnicians] = useState<Array<{ id: string; name: string; active?: boolean }>>([]);
    const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(false);
    const [messageCursor, setMessageCursor] = useState<string | null>(null);
    const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
    const [isRefreshingInbox, setIsRefreshingInbox] = useState(false);
    const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
    const [activeTab, setActiveTab] = useState<'chats' | 'fila' | 'historico' | 'contatos'>('chats');
    const [managementScope, setManagementScope] = useState<ManagementScope>('mine');
    const [unauthorized, setUnauthorized] = useState(false);
    const redirectingRef = useRef(false);
    const selectedConvIdRef = useRef<string | null>(null);
    const conversationsRef = useRef<Conversation[]>([]);
    const isRefreshingRef = useRef(false);
    const loadConversationsRef = useRef<((options?: { silent?: boolean }) => void) | null>(null);
    const loadMessagesRef = useRef<((id: string, options?: { cursor?: string | null; prepend?: boolean; silent?: boolean }) => void) | null>(null);

    const token = getAuthToken();
    conversationsRef.current = conversations;

    const markConversationRead = (conversationId: string, force = false) => {
        if (!isInboxActivelyViewed()) return;
        const current = conversationsRef.current.find((conversation) => conversation.id === conversationId);
        if (!force && (!current || current.unreadCount <= 0)) return;

        setConversations((previous) => previous.map((conversation) => (
            conversation.id === conversationId
                ? { ...conversation, unreadCount: 0 }
                : conversation
        )));
        void apiRequest(`/api/conversations/${conversationId}/read`, {
            method: 'POST',
            headers: { 'X-Sigma-Read-Source': 'conversation-open' },
        }).catch(() => undefined);
    };

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

    const loadConversations = (options: { silent?: boolean } = {}) => {
        if (!options.silent) setIsLoadingConversations(true);
        const scopeQuery = isManager ? `?scope=${managementScope}` : '';
        apiRequest<Conversation[]>(`/api/conversations${scopeQuery}`)
            .then(data => {
                if (Array.isArray(data)) {
                    setConversations(data);
                    const selectedId = selectedConvIdRef.current;
                    if (selectedId && !data.some((conversation) => conversation.id === selectedId)) {
                        setSelectedConvId(null);
                    }
                }
                setLastSyncedAt(new Date());
            })
            .catch(handleApiError)
            .finally(() => {
                if (!options.silent) setIsLoadingConversations(false);
            });
    };
    loadConversationsRef.current = loadConversations;

    useEffect(() => {
        apiRequest<DepartmentOption[]>('/api/departments')
            .then((data) => setDepartments(Array.isArray(data) ? data : []))
            .catch(handleApiError);
        apiRequest<ServiceTopicOption[]>('/api/service-topics')
            .then((data) => setServiceTopics(Array.isArray(data) ? data : []))
            .catch(handleApiError);
        apiRequest<UserOption[]>('/api/users')
            .then((data) => {
                const activeTechnicians = Array.isArray(data)
                    ? data
                        .filter((userOption) => userOption.role === 'TECHNICIAN' && (userOption.active ?? true))
                        .map((userOption) => ({ id: userOption.id, name: userOption.name, active: userOption.active }))
                    : [];
                setTechnicians(activeTechnicians);
            })
            .catch(handleApiError);
    }, []);

    useEffect(() => {
        if (!user) return;
        loadConversations();
    }, [user?.id, managementScope]);

    const loadMessages = (id: string, options: { cursor?: string | null; prepend?: boolean; silent?: boolean } = {}) => {
        if (!options.silent) setIsLoadingMessages(true);
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
                setLastSyncedAt(new Date());
            })
            .catch(handleApiError)
            .finally(() => {
                if (!options.silent) setIsLoadingMessages(false);
            });
    };
    loadMessagesRef.current = loadMessages;

    const loadMoreMessages = () => {
        if (!selectedConvId || !hasMoreMessages || isLoadingMessages || !messageCursor) return;
        loadMessages(selectedConvId, { cursor: messageCursor, prepend: true });
    };

    useEffect(() => {
        setMessages([]);
        setHasMoreMessages(false);
        setMessageCursor(null);
        selectedConvIdRef.current = selectedConvId;
        if (selectedConvId) {
            loadMessages(selectedConvId);
        }
    }, [selectedConvId]);

    useEffect(() => {
        const refreshInbox = async () => {
            if (document.visibilityState !== 'visible') return;
            if (isRefreshingRef.current) return;

            isRefreshingRef.current = true;
            setIsRefreshingInbox(true);
            loadConversationsRef.current?.({ silent: true });
            const currentConversationId = selectedConvIdRef.current;
            if (currentConversationId) {
                loadMessagesRef.current?.(currentConversationId, { silent: true });
            }
            window.setTimeout(() => {
                isRefreshingRef.current = false;
                setIsRefreshingInbox(false);
                setLastSyncedAt(new Date());
            }, 400);
        };

        const intervalId = window.setInterval(refreshInbox, 2500);
        window.addEventListener('focus', refreshInbox);
        document.addEventListener('visibilitychange', refreshInbox);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('focus', refreshInbox);
            document.removeEventListener('visibilitychange', refreshInbox);
        };
    }, []);

    const { isConnected } = useInboxSocket(
        token,
        selectedConvId,
        // conversation:updated
        (updatedConv: Conversation) => {
            setLastSyncedAt(new Date());
            setConversations(prev => {
                const safeList = Array.isArray(prev) ? prev : [];
                const existing = safeList.find(c => c.id === updatedConv.id);
                const candidate = existing
                    ? {
                        ...existing,
                        ...updatedConv,
                        contact: updatedConv.contact
                            ? {
                                ...existing.contact,
                                ...updatedConv.contact,
                                customer: updatedConv.contact.customer ?? existing.contact.customer,
                            }
                            : existing.contact,
                    }
                    : updatedConv;
                if (!canSeeConversation(user, candidate, managementScope)) {
                    return safeList.filter(c => c.id !== updatedConv.id);
                }
                const newList = existing
                    ? safeList.map(c => c.id === updatedConv.id
                        ? {
                            ...c,
                            ...updatedConv,
                            contact: candidate.contact,
                            // Atualizações de transferência/atribuição podem vir do banco
                            // com o contador local defasado. A leitura autoritativa da UAZAPI
                            // chega no polling; até lá, não apague um destaque já visível.
                            unreadCount: Math.max(Number(c.unreadCount) || 0, Number(updatedConv.unreadCount) || 0),
                        }
                        : c)
                    : [updatedConv, ...safeList];
                return sortConversationsByActivity(newList);
            });
        },
        // message:new
        (newMessage: Message) => {
            setLastSyncedAt(new Date());
            if (newMessage.conversationId === selectedConvId) {
                setMessages(prev => {
                    if (prev.find(m => m.id === newMessage.id)) return prev;
                    return [...prev, newMessage];
                });
            }
            setConversations((prev) => sortConversationsByActivity(prev.map((conversation) => {
                if (conversation.id !== newMessage.conversationId) return conversation;
                return {
                    ...conversation,
                    lastMessageAt: newMessage.createdAt,
                    messages: [newMessage],
                };
            })));
        },
        (updatedMessage: Partial<Message> & { id: string }) => {
            setLastSyncedAt(new Date());
            setMessages((prev) => prev.map((message) => {
                if (message.id === updatedMessage.id) return { ...message, ...updatedMessage };
                if (message.replyToMessage?.id === updatedMessage.id) {
                    return { ...message, replyToMessage: { ...message.replyToMessage, ...updatedMessage } };
                }
                return message;
            }));
            setConversations((prev) => prev.map((conversation) => {
                const preview = conversation.messages?.[0];
                if (preview?.id !== updatedMessage.id) return conversation;
                return { ...conversation, messages: [{ ...preview, ...updatedMessage }] };
            }));
        },
        // conversation:new — trata como update para aparecer na lista
        undefined,
        // onReconnect — socket reconectou (ex.: WhatsApp voltou): recarrega tudo
        () => {
            loadConversations();
            if (selectedConvId) loadMessages(selectedConvId);
        }
    );

    const handleSelectConversation = (id: string) => {
        setSelectedConvId(id);
        markConversationRead(id);
    };

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

                return sortConversationsByActivity(nextList);
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

    const handleSendMessage = async (payload: OutgoingMessagePayload): Promise<boolean> => {
        if (!selectedConvId || (!payload.body?.trim() && !payload.mediaUrl)) return false;
        const conversationId = selectedConvId;
        const conversationBeforeSend = conversations.find((conversation) => conversation.id === conversationId);
        const text = payload.body?.trim() || null;
        const optimisticId = `local-${Date.now()}`;
        const optimisticMessage: Message = {
            id: optimisticId,
            conversationId,
            direction: 'OUTBOUND',
            type: payload.type,
            body: text,
            mediaUrl: payload.mediaUrl || null,
            replyToMessageId: payload.replyToMessageId ?? null,
            replyToMessage: payload.replyToMessageId
                ? messages.find((message) => message.id === payload.replyToMessageId) || null
                : null,
            createdAt: new Date().toISOString(),
        };

        setIsSubmitting(true);
        setSendError(null);
        setMessages(prev => [...prev, optimisticMessage]);
        setConversations(prev => sortConversationsByActivity(prev.map(conversation => (
            conversation.id === conversationId
                ? {
                    ...conversation,
                    lastMessageAt: optimisticMessage.createdAt,
                    messages: [optimisticMessage],
                }
                : conversation
        ))));

        try {
            const message = await apiRequest<Message>(`/api/conversations/${conversationId}/messages`, {
                method: 'POST',
                body: JSON.stringify({
                    body: text || undefined,
                    type: payload.type,
                    mediaUrl: payload.mediaUrl,
                    replyToMessageId: payload.replyToMessageId,
                }),
            });
            setMessages(prev => {
                if (prev.find(m => m.id === message.id)) {
                    return prev.filter(m => m.id !== optimisticId);
                }
                return prev.map(m => m.id === optimisticId ? message : m);
            });
            setConversations(prev => sortConversationsByActivity(prev.map(conversation => (
                conversation.id === conversationId
                    ? {
                        ...conversation,
                        lastMessageAt: message.createdAt,
                        messages: [message],
                    }
                    : conversation
            ))));
            setLastSyncedAt(new Date());
            return true;
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                setSendError(err instanceof Error ? err.message : 'Erro ao enviar mensagem.');
                setMessages(prev => prev.filter(message => message.id !== optimisticId));
                setConversations(prev => sortConversationsByActivity(prev.map(conversation => {
                    if (conversation.id !== conversationId || conversation.messages?.[0]?.id !== optimisticId) {
                        return conversation;
                    }
                    return {
                        ...conversation,
                        lastMessageAt: conversationBeforeSend?.lastMessageAt ?? undefined,
                        messages: conversationBeforeSend?.messages ?? [],
                    };
                })));
            }
            return false;
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReactToMessage = async (messageId: string, emoji: string): Promise<boolean> => {
        if (!selectedConvId) return false;

        try {
            await apiRequest(`/api/conversations/${selectedConvId}/messages/${messageId}/react`, {
                method: 'POST',
                body: JSON.stringify({ emoji }),
            });
            loadMessages(selectedConvId, { silent: true });
            return true;
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                showToast({
                    title: 'Não foi possível reagir à mensagem',
                    description: err instanceof Error ? err.message : 'Tente novamente em alguns instantes.',
                    variant: 'error',
                });
            }
            return false;
        }
    };

    const handleEditMessage = async (messageId: string, body: string): Promise<boolean> => {
        if (!selectedConvId || !body.trim()) return false;
        setIsSubmitting(true);
        setSendError(null);
        try {
            const updatedMessage = await apiRequest<Message>(`/api/conversations/${selectedConvId}/messages/${messageId}`, {
                method: 'PATCH',
                body: JSON.stringify({ body: body.trim() }),
            });
            setMessages((prev) => prev.map((message) => message.id === updatedMessage.id ? updatedMessage : message));
            setConversations((prev) => prev.map((conversation) => {
                const preview = conversation.messages?.[0];
                return conversation.id === selectedConvId && preview?.id === updatedMessage.id
                    ? { ...conversation, messages: [updatedMessage] }
                    : conversation;
            }));
            setLastSyncedAt(new Date());
            return true;
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Não foi possível editar a mensagem.';
                setSendError(message);
                showToast({ title: 'Não foi possível editar a mensagem', description: message, variant: 'error' });
            }
            return false;
        } finally {
            setIsSubmitting(false);
        }
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

    const handleSyncConversationHistory = async () => {
        if (!selectedConv?.contact?.phone) return;
        setIsSyncingHistory(true);
        try {
            const summary = await apiRequest<{ importedMessages: number; historyRequests?: number }>(`/api/whatsapp/sessions/default/sync-history`, {
                method: 'POST',
                body: JSON.stringify({ phone: selectedConv.contact.phone, chatLimit: 1, messageLimit: 1000, requestOlder: true }),
            });
            await Promise.all([loadConversations(), loadMessages(selectedConv.id)]);
            showToast({
                title: summary.historyRequests ? 'Buscando histórico' : 'Histórico atualizado',
                description: summary.historyRequests
                    ? `${summary.importedMessages} mensagem(ns) já disponível(is). A busca das mensagens anteriores foi enviada ao WhatsApp; mantenha o aplicativo ativo no celular e elas aparecerão automaticamente quando forem recebidas.`
                    : `${summary.importedMessages} mensagem(ns) encontrada(s) para este contato.`,
                variant: summary.historyRequests ? 'info' : 'success',
            });
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                showToast({
                    title: 'Não foi possível importar o histórico',
                    description: err instanceof Error ? err.message : 'Verifique a conexão da instância e tente novamente.',
                    variant: 'error',
                });
            }
        } finally {
            setIsSyncingHistory(false);
        }
    };

    const handleCloseConversation = async (payload: CloseConversationPayload) => {
        if (!selectedConvId) return;
        setIsClosingConversation(true);
        setSendError(null);

        try {
            const closedConversation = await apiRequest<Conversation>(`/api/inbox/conversations/${selectedConvId}/close`, {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            setConversations((prev) => {
                const safeList = Array.isArray(prev) ? prev : [];
                return safeList.map((conversation) => (
                    conversation.id === closedConversation.id ? { ...conversation, ...closedConversation } : conversation
                ));
            });
            setSelectedConvId(null);
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

    const handleCreateTicket = async (payload: {
        title: string;
        priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        description?: string | null;
        technicianId?: string | null;
        scheduledAt?: string | null;
        visitAddress?: string | null;
        notesInternal?: string | null;
        serviceType?: 'REMOTO' | 'PRESENCIAL' | 'HIBRIDO';
    }) => {
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
    const activeConversations = deduplicateConversationsByContact(
        safeConversations.filter((conversation) => conversation.status !== 'CLOSED')
    );
    const queueCount = activeConversations.filter((conversation) => conversation.status === 'OPEN').length;
    const selectedConv = safeConversations.find(c => c.id === selectedConvId) ?? null;
    // WhatsApp Web keeps one visible row per customer, showing the latest activity.
    // Prefer an assigned conversation with messages when duplicated records exist.
    const latestConversationPerContact = deduplicateConversationsByContact(safeConversations);
    const visibleConversations = activeTab === 'fila'
        ? activeConversations.filter((conversation) => conversation.status === 'OPEN')
        : activeTab === 'chats'
            ? activeConversations.filter((conversation) => conversation.status === 'ASSIGNED')
            : activeTab === 'historico'
                ? safeConversations.filter((conversation) => conversation.status === 'CLOSED')
                : latestConversationPerContact;

    useEffect(() => {
        if (!selectedConvId) return;
        const selected = safeConversations.find((conversation) => conversation.id === selectedConvId);
        if (!selected || selected.status === 'CLOSED') return;

        const preferred = activeConversations.find((conversation) => conversation.contactId === selected.contactId);
        if (preferred && preferred.id !== selected.id) {
            setSelectedConvId(preferred.id);
        }
    }, [conversations, selectedConvId]);

    // Não renderiza conteúdo enquanto redireciona
    if (unauthorized) return null;

    return (
        <div className="sigma-inbox-shell relative flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-background font-sans text-foreground md:flex-row">
            {!isConnected && (
                <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-warning-soft text-warning-fg px-3 py-1 rounded-full text-xs font-medium border border-warning/30 shadow-lifted z-50 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-warning animate-pulse"></span>
                    Reconectando...
                </div>
            )}
            <SigmaSidebarIcon user={user} onLogout={logout} collapsible />
            <Suspense fallback={<InboxColumnSkeleton />}>
                <ConversationList
                    conversations={visibleConversations}
                    selectedId={selectedConvId}
                    onSelect={handleSelectConversation}
                    onStartConversation={handleStartConversation}
                    isStartingConversation={isStartingConversation}
                    isLoading={isLoadingConversations}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    queueCount={queueCount}
                    showManagementScope={isManager}
                    managementScope={managementScope}
                    onManagementScopeChange={(scope) => {
                        setManagementScope(scope);
                        setSelectedConvId(null);
                    }}
                />
            </Suspense>
            <Suspense fallback={<section className="flex flex-1 bg-background" />}>
                <ChatWindow
                    currentUser={user}
                    conversation={selectedConv}
                    messages={messages}
                    isLoading={isLoadingMessages}
                    isSubmitting={isSubmitting}
                    isSyncingHistory={isSyncingHistory}
                    sendError={sendError}
                    onTake={handleTakeConversation}
                    onSend={handleSendMessage}
                    onEdit={handleEditMessage}
                    onReact={handleReactToMessage}
                    onSyncHistory={handleSyncConversationHistory}
                    onTransfer={handleTransfer}
                    onCloseConversation={handleCloseConversation}
                    onCreateTicket={handleCreateTicket}
                    onBack={() => setSelectedConvId(null)}
                    isClosingConversation={isClosingConversation}
                    isCreatingTicket={isCreatingTicket}
                    createTicketError={createTicketError}
                    departments={departments}
                    serviceTopics={serviceTopics}
                    technicians={technicians}
                    hasMore={hasMoreMessages}
                    onLoadMore={loadMoreMessages}
                    isRealtimeConnected={isConnected}
                    isRefreshing={isRefreshingInbox}
                    lastSyncedAt={lastSyncedAt}
                />
            </Suspense>
            <Suspense fallback={null}>
                <ContactSidebar conversation={selectedConv} />
            </Suspense>
        </div>
    );
}
