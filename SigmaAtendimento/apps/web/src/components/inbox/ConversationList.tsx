import { FormEvent, useState } from 'react';
import type { Conversation } from './types';

interface ConversationListProps {
    conversations: Conversation[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onStartConversation: (phone: string) => Promise<void>;
    isStartingConversation: boolean;
    startConversationError: string | null;
    activeTab: 'chats' | 'fila' | 'historico' | 'contatos';
    setActiveTab: (tab: 'chats' | 'fila' | 'historico' | 'contatos') => void;
}

function formatTime(value?: string | Date | null) {
    if (!value) return '';
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value?: string | Date | null) {
    if (!value) return '';
    return new Date(value).toLocaleString([], {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function statusLabel(status: Conversation['status']) {
    if (status === 'OPEN') return 'Fila';
    if (status === 'ASSIGNED') return 'Em atendimento';
    return 'Fechada';
}

function statusClass(status: Conversation['status']) {
    if (status === 'OPEN') return 'bg-warning-soft text-warning-fg';
    if (status === 'ASSIGNED') return 'bg-primary-50 text-primary-700';
    return 'bg-surface-alt text-muted-foreground';
}

export function ConversationList({
    conversations,
    selectedId,
    onSelect,
    onStartConversation,
    isStartingConversation,
    startConversationError,
    activeTab,
    setActiveTab,
}: ConversationListProps) {
    const [phone, setPhone] = useState('');
    const isHistoryTab = activeTab === 'historico';
    const emptyLabel = activeTab === 'historico'
        ? 'Nenhum histórico encontrado.'
        : activeTab === 'fila'
            ? 'Nenhuma conversa na fila.'
            : activeTab === 'chats'
                ? 'Nenhuma conversa em atendimento.'
                : 'Nenhum contato encontrado.';

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const value = phone.trim();
        if (!value) return;
        await onStartConversation(value);
    };

    return (
        <aside className={`${selectedId ? 'hidden md:flex' : 'flex'} min-h-0 w-full shrink-0 flex-col border-b border-border bg-surface md:w-[360px] md:border-b-0 md:border-r`}>
            <div className="p-5 border-b border-border">
                <h1 className="text-xl font-bold text-foreground">Conversas</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {isHistoryTab ? 'Histórico completo do WhatsApp e atendimentos' : 'Atendimento em tempo real'}
                </p>

                <form onSubmit={submit} className="mt-4 rounded-xl border border-border bg-surface-alt p-3">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Nova conversa
                    </label>
                    <div className="mt-2 flex gap-2">
                        <input
                            value={phone}
                            onChange={(event) => setPhone(event.target.value)}
                            placeholder="5511999999999"
                            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30"
                        />
                        <button
                            type="submit"
                            disabled={isStartingConversation || !phone.trim()}
                            className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isStartingConversation ? 'Validando...' : 'Iniciar'}
                        </button>
                    </div>
                    {startConversationError && (
                        <p className="mt-2 text-xs font-medium text-danger-fg">{startConversationError}</p>
                    )}
                    <p className="mt-2 text-[11px] text-muted-foreground">
                        O sistema valida se o número tem WhatsApp antes de abrir o atendimento.
                    </p>
                </form>

                <div className="mt-4 grid grid-cols-4 gap-2 rounded-lg bg-surface-alt p-1">
                    {[
                        ['chats', 'Chats'],
                        ['fila', 'Fila'],
                        ['historico', 'Histórico'],
                        ['contatos', 'Contatos'],
                    ].map(([value, label]) => (
                        <button
                            key={value}
                            onClick={() => setActiveTab(value as ConversationListProps['activeTab'])}
                            className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${activeTab === value ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-surface hover:text-foreground'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                    <div className="p-6 text-sm text-muted-foreground">{emptyLabel}</div>
                ) : (
                    conversations.map((conversation) => {
                        const lastMessage = conversation.messages?.[0];
                        const name = conversation.contact?.name || (conversation.contact as any)?.nome || conversation.contact?.phone || 'Contato';
                        const selected = selectedId === conversation.id;

                        return (
                            <button
                                key={conversation.id}
                                onClick={() => onSelect(conversation.id)}
                                className={`w-full border-b border-border p-4 text-left transition-colors cursor-pointer ${selected ? 'bg-primary/10' : 'hover:bg-surface-alt'}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">{name}</p>
                                        <p className="mt-1 truncate text-sm text-muted-foreground">{lastMessage?.body || 'Sem mensagens recentes'}</p>
                                    </div>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        {isHistoryTab ? formatDateTime(conversation.lastMessageAt as any) : formatTime(conversation.lastMessageAt as any)}
                                    </span>
                                </div>
                                <div className="mt-3 flex items-center justify-between gap-2">
                                    <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${statusClass(conversation.status)}`}>
                                        {statusLabel(conversation.status)}
                                    </span>
                                    {conversation.department?.name && <span className="truncate text-xs text-muted-foreground">{conversation.department.name}</span>}
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </aside>
    );
}
