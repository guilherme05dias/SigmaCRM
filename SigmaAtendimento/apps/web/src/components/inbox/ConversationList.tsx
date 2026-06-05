import type { Conversation } from './types';

interface ConversationListProps {
    conversations: Conversation[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    activeTab: 'chats' | 'fila' | 'contatos';
    setActiveTab: (tab: 'chats' | 'fila' | 'contatos') => void;
}

function formatTime(value?: string | Date | null) {
    if (!value) return '';
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

export function ConversationList({ conversations, selectedId, onSelect, activeTab, setActiveTab }: ConversationListProps) {
    return (
        <aside className="w-[360px] shrink-0 border-r border-border bg-surface flex flex-col">
            <div className="p-5 border-b border-border">
                <h1 className="text-xl font-bold text-foreground">Conversas</h1>
                <p className="mt-1 text-sm text-muted-foreground">Atendimento em tempo real</p>

                <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-surface-alt p-1">
                    {[
                        ['chats', 'Chats'],
                        ['fila', 'Fila'],
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

            <div className="flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                    <div className="p-6 text-sm text-muted-foreground">Nenhuma conversa encontrada.</div>
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
                                    <span className="shrink-0 text-xs text-muted-foreground">{formatTime(conversation.lastMessageAt as any)}</span>
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
