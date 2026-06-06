import { FormEvent, useEffect, useRef, useState } from 'react';
import type { Conversation, Message } from './types';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/Button';
import { TicketFromConvModal } from './TicketFromConvModal';

interface ChatWindowProps {
    conversation: Conversation | null;
    messages: Message[];
    isLoading: boolean;
    isSubmitting: boolean;
    sendError: string | null;
    onTake: () => void;
    onSend: (body: string) => void;
    onTransfer: (departmentId: string) => void;
    onCloseConversation: () => Promise<void>;
    onCreateTicket: (payload: { title: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; description?: string | null }) => Promise<void>;
    onBack?: () => void;
    isClosingConversation: boolean;
    isCreatingTicket: boolean;
    createTicketError: string | null;
    departments: Array<{ id: string; name: string; active?: boolean }>;
    hasMore: boolean;
    onLoadMore: () => void;
}

function formatDate(value?: string | Date) {
    if (!value) return '';
    return new Date(value).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

export function ChatWindow({
    conversation,
    messages,
    isLoading,
    isSubmitting,
    sendError,
    onTake,
    onSend,
    onTransfer,
    onCloseConversation,
    onCreateTicket,
    onBack,
    isClosingConversation,
    isCreatingTicket,
    createTicketError,
    departments,
    hasMore,
    onLoadMore,
}: ChatWindowProps) {
    const [body, setBody] = useState('');
    const [departmentId, setDepartmentId] = useState('');
    const [ticketModalOpen, setTicketModalOpen] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const bottomRef   = useRef<HTMLDivElement>(null);
    // Track conversation changes to do instant scroll on open
    const prevConvIdRef = useRef<string | null>(null);
    // Track message count to detect new real-time messages vs. pagination loads
    const prevMsgCountRef = useRef(0);

    // Scroll to bottom instantly when a different conversation is opened
    // (wait until messages are loaded, not while isLoading)
    useEffect(() => {
        if (isLoading) return;
        const convChanged = conversation?.id !== prevConvIdRef.current;
        if (convChanged) {
            prevConvIdRef.current = conversation?.id ?? null;
            requestAnimationFrame(() => {
                bottomRef.current?.scrollIntoView({ behavior: 'instant' });
            });
        }
    }, [conversation?.id, isLoading]);

    // Auto-scroll when new messages arrive via socket (smooth, only if already near bottom)
    useEffect(() => {
        const countIncreased = messages.length > prevMsgCountRef.current;
        prevMsgCountRef.current = messages.length;

        if (!countIncreased || isLoading) return;
        const container = containerRef.current;
        if (!container) return;
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distanceFromBottom < 200) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!body.trim()) return;
        onSend(body);
        setBody('');
    };

    if (!conversation) {
        return (
            <section className="flex flex-1 items-center justify-center bg-background">
                <div className="text-center">
                    <Icon name="forum" className="size-12 text-muted-foreground/60 mx-auto" />
                    <h2 className="mt-4 text-xl font-bold text-foreground">Selecione uma conversa</h2>
                    <p className="mt-2 text-sm text-muted-foreground">Escolha um atendimento na lista para visualizar as mensagens.</p>
                </div>
            </section>
        );
    }

    const contactName = conversation.contact?.name || (conversation.contact as any)?.nome || conversation.contact?.phone || 'Contato';
    const canAct = conversation.status !== 'CLOSED';

    const closeConversation = async () => {
        const confirmed = window.confirm('Deseja encerrar esta conversa? O cliente receberá a mensagem de encerramento configurada.');
        if (!confirmed) return;
        await onCloseConversation();
    };

    const createTicket = async (payload: { title: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; description?: string | null }) => {
        await onCreateTicket(payload);
        setTicketModalOpen(false);
    };

    return (
        <section className={`${conversation ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col bg-background`}>
            <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-4 md:px-6">
                <div className="flex min-w-0 items-center gap-3">
                    {onBack && (
                        <button type="button" onClick={onBack} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-muted-foreground md:hidden">
                            Voltar
                        </button>
                    )}
                    <div className="min-w-0">
                        <h2 className="truncate font-bold text-foreground">{contactName}</h2>
                        <p className="truncate text-sm text-muted-foreground">{conversation.contact?.phone}</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                    {canAct && (
                        <Button type="button" variant="outline" size="sm" onClick={() => setTicketModalOpen(true)}>
                            Criar chamado
                        </Button>
                    )}
                    {canAct && (
                        <Button type="button" variant="ghost" size="sm" loading={isClosingConversation} onClick={closeConversation}>
                            Encerrar
                        </Button>
                    )}
                    {canAct && departments.length > 0 && (
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                if (departmentId) onTransfer(departmentId);
                            }}
                            className="flex items-center gap-2"
                        >
                            <select
                                value={departmentId}
                                onChange={(event) => setDepartmentId(event.target.value)}
                                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                            >
                                <option value="">Transferir para...</option>
                                {departments.filter((department) => department.active ?? true).map((department) => (
                                    <option key={department.id} value={department.id}>{department.name}</option>
                                ))}
                            </select>
                            <button
                                type="submit"
                                disabled={!departmentId}
                                className="rounded-pill border border-border bg-surface px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-surface-alt hover:text-foreground transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Transferir
                            </button>
                        </form>
                    )}
                    {conversation.status === 'OPEN' && (
                        <button onClick={onTake} className="rounded-pill bg-primary px-5 py-2 text-sm font-semibold text-white shadow-primary-glow hover:bg-primary-700 transition-colors cursor-pointer">
                            Assumir conversa
                        </button>
                    )}
                </div>
            </header>

            <div ref={containerRef} className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                {hasMore && (
                    <div className="mb-4 text-center">
                        <button onClick={onLoadMore} className="rounded-pill border border-border bg-surface px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-surface-alt hover:text-foreground transition-colors cursor-pointer">
                            Carregar anteriores
                        </button>
                    </div>
                )}

                {isLoading ? (
                    <div className="text-center text-sm text-muted-foreground">Carregando mensagens...</div>
                ) : messages.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground">Nenhuma mensagem nesta conversa.</div>
                ) : (
                    <div className="space-y-4">
                        {messages.map((message) => {
                            const outbound = message.direction === 'OUTBOUND';
                            const system = message.direction === 'SYSTEM';

                            return (
                                <div key={message.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[70%] rounded-xl px-4 py-3 ${system ? 'bg-surface-alt text-muted-foreground' : outbound ? 'bg-primary text-white' : 'bg-surface border border-border text-foreground'}`}>
                                        <p className="whitespace-pre-wrap text-sm">{message.body || (message as any).mediaUrl || ''}</p>
                                        <p className={`mt-2 text-[11px] ${outbound ? 'text-white/70' : 'text-muted-foreground'}`}>{formatDate(message.createdAt as any)}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                {/* Sentinel — scrolled into view to land at bottom of message list */}
                <div ref={bottomRef} />
            </div>

            <form onSubmit={submit} className="border-t border-border bg-surface p-4">
                {sendError && (
                    <div className="mb-3 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger-fg">
                        {sendError}
                    </div>
                )}
                <div className="flex items-end gap-3">
                    <textarea
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        rows={2}
                        disabled={conversation.status === 'CLOSED'}
                        placeholder={conversation.status === 'CLOSED' ? 'Conversa encerrada' : 'Digite sua mensagem...'}
                        className="min-h-[48px] flex-1 resize-none rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <button disabled={isSubmitting || !body.trim() || conversation.status === 'CLOSED'} className="rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-white shadow-primary-glow hover:bg-primary-700 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60">
                        Enviar
                    </button>
                </div>
            </form>

            {conversation && (
                <TicketFromConvModal
                    conversation={conversation}
                    open={ticketModalOpen}
                    loading={isCreatingTicket}
                    error={createTicketError}
                    onClose={() => setTicketModalOpen(false)}
                    onSubmit={createTicket}
                />
            )}
        </section>
    );
}
