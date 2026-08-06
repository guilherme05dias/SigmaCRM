import { FormEvent, useState } from 'react';
import type { Conversation } from './types';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import { ContactAvatar } from './ContactAvatar';
import { messagePreviewText } from './messagePresentation';
import { contactDisplayName } from './contactDisplayName';

interface ConversationListProps {
    conversations: Conversation[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onStartConversation: (phone: string) => Promise<void>;
    isStartingConversation: boolean;
    isLoading: boolean;
    activeTab: 'chats' | 'fila' | 'historico' | 'contatos';
    setActiveTab: (tab: 'chats' | 'fila' | 'historico' | 'contatos') => void;
    queueCount: number;
    showManagementScope?: boolean;
    managementScope?: 'mine' | 'all';
    onManagementScopeChange?: (scope: 'mine' | 'all') => void;
}

function formatTime(value?: string | Date | null) {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value?: string | Date | null) {
    if (!value) return '';
    return new Date(value).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function conversationName(conversation: Conversation) {
    return contactDisplayName(conversation.contact);
}

export function ConversationList({
    conversations,
    selectedId,
    onSelect,
    onStartConversation,
    isStartingConversation,
    isLoading,
    activeTab,
    setActiveTab,
    queueCount,
    showManagementScope = false,
    managementScope = 'mine',
    onManagementScopeChange,
}: ConversationListProps) {
    const [query, setQuery] = useState('');
    const isHistoryTab = activeTab === 'historico';

    const emptyCopy = activeTab === 'historico'
        ? {
            title: 'Nenhum historico encontrado',
            description: 'Conversas encerradas aparecerao aqui para consulta posterior.',
            icon: 'forum' as const,
        }
        : activeTab === 'fila'
            ? {
                title: 'Nenhuma conversa na fila',
                description: 'Novas mensagens recebidas pelo WhatsApp entrarao nesta lista.',
                icon: 'forum' as const,
            }
            : activeTab === 'chats'
                ? {
                    title: 'Nenhuma conversa em atendimento',
                    description: 'Assuma uma conversa da fila ou inicie uma conversa pelo telefone do cliente.',
                    icon: 'forum' as const,
                }
                : {
                    title: 'Nenhum contato encontrado',
                    description: 'Os contatos aparecem aqui quando houver conversas vinculadas.',
                    icon: 'group' as const,
                };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const value = query.trim();
        if (!value) return;
        await onStartConversation(value);
        setQuery('');
    };

    const filteredConversations = conversations.filter((conversation) => {
        const value = query.trim().toLowerCase();
        if (!value) return true;

        const lastMessage = conversation.messages?.[0];
        const lastMessagePreview = lastMessage ? messagePreviewText(lastMessage) : '';
        const name = conversationName(conversation);
        const phone = conversation.contact?.phone || '';
        return `${name} ${phone} ${lastMessagePreview}`.toLowerCase().includes(value);
    });

    const tabItems: Array<[ConversationListProps['activeTab'], string]> = [
        ['chats', 'Conversas'],
        ['fila', 'Fila'],
        ['historico', 'Historico'],
        ['contatos', 'Contatos'],
    ];

    return (
        <aside
            className={`${selectedId ? 'hidden md:flex' : 'flex'} sigma-wa-conversation-list min-h-0 flex-col border-b border-border bg-surface md:border-b-0 md:border-r`}
        >
            <div className="border-b border-border bg-surface">
                <div className="flex h-16 items-center justify-between gap-3 pl-[68px] pr-4">
                    <div className="min-w-0">
                        <h1 className="text-[22px] font-bold leading-7 text-foreground">Conversas</h1>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            const value = query.trim();
                            if (value) void onStartConversation(value).then(() => setQuery(''));
                        }}
                        disabled={isStartingConversation || !query.trim()}
                        aria-label="Iniciar conversa"
                        className="flex size-11 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ background: 'var(--c-chat-action)' }}
                    >
                        {isStartingConversation ? (
                            <span className="h-3 w-3 rounded-full border-2 border-white/50 border-t-white animate-spin" />
                        ) : (
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M12 5v14" />
                                <path d="M5 12h14" />
                            </svg>
                        )}
                    </button>
                </div>

                <div className="px-3 pb-3">
                    <form onSubmit={submit} className="flex items-center gap-2 rounded-full bg-surface-alt px-3 py-2" aria-label="Buscar ou iniciar conversa">
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground" aria-hidden="true">
                            <circle cx="11" cy="11" r="7" />
                            <path d="m20 20-3.5-3.5" />
                        </svg>
                        <input
                            id="new-conversation-phone"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Pesquisar ou iniciar nova conversa"
                            className="min-w-0 flex-1 border-0 bg-transparent px-1 py-0.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                        />
                        {query.trim() && (
                            <button
                                type="button"
                                onClick={() => setQuery('')}
                                className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
                                aria-label="Limpar busca"
                            >
                                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                                    <path d="M18 6 6 18" />
                                    <path d="m6 6 12 12" />
                                </svg>
                            </button>
                        )}
                    </form>
                </div>

                {showManagementScope && (
                    <div className="px-3 pb-3">
                        <div className="grid grid-cols-2 rounded-lg bg-surface-alt p-1" role="group" aria-label="Escopo dos atendimentos">
                            {([
                                ['mine', 'Meus atendimentos'],
                                ['all', 'Todos'],
                            ] as const).map(([scope, label]) => {
                                const selected = managementScope === scope;
                                return (
                                    <button
                                        key={scope}
                                        type="button"
                                        onClick={() => onManagementScopeChange?.(scope)}
                                        aria-pressed={selected}
                                        className={`min-h-9 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${selected ? 'bg-surface text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="flex gap-2 overflow-x-auto px-3 pb-3 scrollbar-thin" role="tablist" aria-label="Filtros de conversa">
                    {tabItems.map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === value}
                            onClick={() => setActiveTab(value)}
                            className={`min-h-11 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold transition-colors cursor-pointer ${activeTab === value ? 'text-white' : 'bg-surface-alt text-muted-foreground hover:bg-elevated hover:text-foreground'}`}
                            style={activeTab === value ? { background: 'var(--c-chat-action)' } : undefined}
                        >
                            <span>{label}</span>
                            {value === 'fila' && queueCount > 0 && (
                                <span className={`ml-1 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] leading-none ${activeTab === value ? 'bg-white/20 text-white' : 'bg-warning-soft text-warning-fg'}`} aria-label={`${queueCount} conversas aguardando`}>
                                    {queueCount > 99 ? '99+' : queueCount}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {isLoading ? (
                    <div className="divide-y divide-border" aria-label="Carregando conversas">
                        {Array.from({ length: 7 }).map((_, index) => (
                            <div key={index} className="grid min-h-[72px] items-center gap-3 px-3 py-2 sm:px-4" style={{ gridTemplateColumns: '49px minmax(0, 1fr)' }}>
                                <Skeleton className="h-[49px] w-[49px] shrink-0 rounded-full" />
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex items-start justify-between gap-3">
                                        <Skeleton className="h-4 w-36" />
                                        <Skeleton className="h-3 w-10" />
                                    </div>
                                    <Skeleton className="h-3 w-full" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : filteredConversations.length === 0 ? (
                    <div className="p-4">
                        <EmptyState
                            icon={emptyCopy.icon}
                            title={emptyCopy.title}
                            description={query.trim() ? 'Nenhuma conversa encontrada para essa busca.' : emptyCopy.description}
                        />
                    </div>
                ) : (
                    filteredConversations.map((conversation) => {
                        const lastMessage = conversation.messages?.[0];
                        const name = conversationName(conversation);
                        const selected = selectedId === conversation.id;
                        const unreadCount = Math.max(0, Number(conversation.unreadCount) || 0);
                        const unreadLabel = `${unreadCount} ${unreadCount === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`;
                        const previewPrefix = lastMessage?.direction === 'OUTBOUND' ? 'Você: ' : '';
                        const previewBody = lastMessage ? messagePreviewText(lastMessage) : '';
                        const preview = previewBody ? `${previewPrefix}${previewBody}` : 'Sem mensagens recentes';

                        return (
                            <button
                                key={conversation.id}
                                type="button"
                                onClick={() => onSelect(conversation.id)}
                                aria-pressed={selected}
                                aria-label={`Abrir conversa com ${name}${unreadCount > 0 ? `, ${unreadLabel}` : ''}`}
                                className={`group min-h-[72px] w-full border-b border-border px-3 py-2 text-left transition-colors cursor-pointer sm:px-4 ${selected ? 'bg-surface-alt' : 'hover:bg-surface-alt'}`}
                                style={unreadCount > 0 ? { background: 'var(--c-unread-surface)' } : undefined}
                            >
                                <div className="grid items-center gap-3" style={{ gridTemplateColumns: '49px minmax(0, 1fr)' }}>
                                    <ContactAvatar
                                        contactId={conversation.contactId}
                                        avatarUrl={conversation.contact?.avatarUrl}
                                        name={name}
                                        className="h-[49px] w-[49px] shrink-0 rounded-full text-base"
                                        fetchOnMount
                                    />

                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-3">
                                            <p className={`truncate text-[15px] leading-5 text-foreground ${unreadCount > 0 ? 'font-bold' : 'font-semibold'}`}>{name}</p>
                                            <span className={`shrink-0 text-[11px] leading-5 ${unreadCount > 0 ? 'font-semibold' : selected ? 'text-[color:var(--c-chat-sig)]' : 'text-muted-foreground'}`} style={unreadCount > 0 ? { color: 'var(--c-unread-accent)' } : undefined}>
                                                {isHistoryTab ? formatDateTime(conversation.lastMessageAt as any) : formatTime(conversation.lastMessageAt as any)}
                                            </span>
                                        </div>

                                        <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
                                            <p className={`min-w-0 flex-1 truncate text-sm leading-5 ${unreadCount > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{preview}</p>
                                            {unreadCount > 0 && (
                                                <span
                                                    className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none"
                                                    style={{ background: 'var(--c-unread-bg)', color: 'var(--c-unread-fg)' }}
                                                    title={unreadLabel}
                                                    aria-label={unreadLabel}
                                                >
                                                    {unreadCount > 99 ? '99+' : unreadCount}
                                                </span>
                                            )}
                                        </div>

                                        {(conversation.department?.name || (showManagementScope && conversation.assignedUser)) && (
                                            <p className="mt-1 truncate text-[11px] text-muted-foreground">
                                                {conversation.department?.name || 'Sem setor'}
                                                {showManagementScope && conversation.assignedUser
                                                    ? ` · Responsável: ${conversation.assignedUser.name || conversation.assignedUser.nome || 'Usuário'}`
                                                    : ''}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </aside>
    );
}
