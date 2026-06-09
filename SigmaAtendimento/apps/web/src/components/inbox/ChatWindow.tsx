import { FormEvent, useEffect, useRef, useState } from 'react';
import type { Conversation, Message } from './types';
import { Button } from '../ui/Button';
import { TicketFromConvModal } from './TicketFromConvModal';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';

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
    onCreateTicket: (payload: {
        title: string;
        priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        description?: string | null;
    }) => Promise<void>;
    onBack?: () => void;
    isClosingConversation: boolean;
    isCreatingTicket: boolean;
    createTicketError: string | null;
    departments: Array<{ id: string; name: string; active?: boolean }>;
    hasMore: boolean;
    onLoadMore: () => void;
}

/** Formata apenas a hora (ex: 14:30) — exibida dentro de cada bolha */
function formatTime(value?: string | Date | null): string {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Rótulo legível para o separador de data */
function dateSeparatorLabel(value: string | Date): string {
    const d = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Hoje';
    if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Agrupa mensagens por dia para exibir separadores de data */
function groupByDate(messages: Message[]) {
    const groups: { dateKey: string; label: string; items: Message[] }[] = [];
    for (const msg of messages) {
        const dateKey = new Date(msg.createdAt).toDateString();
        const last = groups.at(-1);
        if (last?.dateKey === dateKey) {
            last.items.push(msg);
        } else {
            groups.push({ dateKey, label: dateSeparatorLabel(msg.createdAt), items: [msg] });
        }
    }
    return groups;
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

    const containerRef    = useRef<HTMLDivElement>(null);
    const bottomRef       = useRef<HTMLDivElement>(null);
    const textareaRef     = useRef<HTMLTextAreaElement>(null);
    const prevConvIdRef   = useRef<string | null>(null);
    const prevMsgCountRef = useRef(0);

    /* Scroll instantâneo ao trocar de conversa */
    useEffect(() => {
        if (isLoading) return;
        if (conversation?.id !== prevConvIdRef.current) {
            prevConvIdRef.current = conversation?.id ?? null;
            requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }));
        }
    }, [conversation?.id, isLoading]);

    /* Scroll suave em novas mensagens recebidas via socket */
    useEffect(() => {
        const grew = messages.length > prevMsgCountRef.current;
        prevMsgCountRef.current = messages.length;
        if (!grew || isLoading) return;
        const c = containerRef.current;
        if (!c) return;
        if (c.scrollHeight - c.scrollTop - c.clientHeight < 200) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    /* Auto-resize do textarea */
    const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setBody(e.target.value);
        const ta = e.target;
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(ta.scrollHeight, 144)}px`;
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (!body.trim()) return;
        onSend(body);
        setBody('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
    };

    /* Enter envia; Shift+Enter quebra linha */
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit(e as unknown as FormEvent);
        }
    };

    /* ── Tela sem conversa selecionada ── */
    if (!conversation) {
        return (
            <section className="flex flex-1 items-center justify-center bg-surface-alt">
                <EmptyState
                    icon="forum"
                    title="Selecione uma conversa"
                    description="Escolha um atendimento na lista para visualizar as mensagens e responder o cliente."
                />
            </section>
        );
    }

    const contactName = conversation.contact?.name
        || (conversation.contact as Record<string, unknown>)?.nome as string
        || conversation.contact?.phone
        || 'Contato';

    const canAct = conversation.status !== 'CLOSED';

    const handleCloseConversation = async () => {
        const ok = window.confirm('Deseja encerrar esta conversa? O cliente receberá a mensagem de encerramento configurada.');
        if (!ok) return;
        await onCloseConversation();
    };

    const handleCreateTicket = async (payload: {
        title: string;
        priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        description?: string | null;
    }) => {
        await onCreateTicket(payload);
        setTicketModalOpen(false);
    };

    const groups = groupByDate(messages);

    return (
        <section className={`${conversation ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col bg-background`}>

            {/* ══ Header ══════════════════════════════════════════════ */}
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 md:px-5">
                <div className="flex min-w-0 items-center gap-3">
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            aria-label="Voltar para a lista de conversas"
                            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-surface-alt transition-colors md:hidden"
                        >
                            ← Voltar
                        </button>
                    )}

                    {/* Avatar com inicial */}
                    <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white select-none"
                        aria-hidden="true"
                    >
                        {contactName.charAt(0).toUpperCase()}
                    </div>

                    <div className="min-w-0">
                        <h2 className="truncate text-sm font-bold text-foreground">{contactName}</h2>
                        <p className="truncate text-xs text-muted-foreground">{conversation.contact?.phone}</p>
                    </div>
                </div>

                {/* Ações */}
                <div className="flex flex-wrap items-center justify-end gap-2">
                    {canAct && (
                        <Button type="button" variant="outline" size="sm" onClick={() => setTicketModalOpen(true)}>
                            Criar chamado
                        </Button>
                    )}
                    {canAct && (
                        <Button type="button" variant="ghost" size="sm" loading={isClosingConversation} onClick={handleCloseConversation}>
                            Encerrar
                        </Button>
                    )}
                    {canAct && departments.length > 0 && (
                        <form
                            onSubmit={(e) => { e.preventDefault(); if (departmentId) onTransfer(departmentId); }}
                            className="flex items-center gap-2"
                        >
                            <select
                                value={departmentId}
                                onChange={(e) => setDepartmentId(e.target.value)}
                                aria-label="Departamento de destino"
                                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                            >
                                <option value="">Transferir para...</option>
                                {departments.filter((d) => d.active ?? true).map((d) => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                            <button
                                type="submit"
                                disabled={!departmentId}
                                className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-surface-alt hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Transferir
                            </button>
                        </form>
                    )}
                    {conversation.status === 'OPEN' && (
                        <button
                            type="button"
                            onClick={onTake}
                            aria-label="Assumir esta conversa"
                            className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-white shadow-primary-glow hover:bg-primary-700 transition-colors"
                        >
                            Assumir conversa
                        </button>
                    )}
                </div>
            </header>

            {/* ══ Área de mensagens ═══════════════════════════════════ */}
            <div
                ref={containerRef}
                className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4"
                style={{ background: 'var(--c-chat-bg)' }}
            >
                {/* Botão de carregar mais */}
                {hasMore && (
                    <div className="mb-4 flex justify-center">
                        <button
                            type="button"
                            onClick={onLoadMore}
                            disabled={isLoading}
                            aria-label="Carregar mensagens anteriores"
                            className="rounded-full border border-border bg-surface px-4 py-1 text-xs font-medium text-muted-foreground shadow-sm hover:bg-surface-alt transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isLoading ? 'Carregando...' : '↑ Carregar anteriores'}
                        </button>
                    </div>
                )}

                {/* Skeletons */}
                {isLoading && (
                    <div className="space-y-3" aria-label="Carregando mensagens">
                        {([false, true, false, true] as boolean[]).map((out, i) => (
                            <div key={i} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className="w-2/3 max-w-xs rounded-2xl p-3"
                                    style={{ background: out ? 'var(--c-chat-bubble-out)' : 'var(--c-chat-bubble-in)', border: '1px solid var(--c-border)' }}
                                >
                                    <Skeleton className="h-3 w-4/5" />
                                    <Skeleton className="mt-1.5 h-3 w-3/5" />
                                    <div className="mt-2 flex justify-end">
                                        <Skeleton className="h-2.5 w-8" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Empty state */}
                {!isLoading && messages.length === 0 && (
                    <div className="flex h-full items-center justify-center">
                        <div className="rounded-2xl border border-border bg-surface px-6 py-5 text-center shadow-sm">
                            <EmptyState
                                icon="forum"
                                title="Conversa sem mensagens"
                                description="As mensagens trocadas com este contato aparecerão aqui."
                            />
                        </div>
                    </div>
                )}

                {/* Grupos por data */}
                {!isLoading && groups.map((group) => (
                    <div key={group.dateKey}>

                        {/* Separador de data */}
                        <div className="my-4 flex items-center justify-center">
                            <span className="rounded-full border border-border bg-surface px-3 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm">
                                {group.label}
                            </span>
                        </div>

                        <div className="space-y-1">
                            {group.items.map((msg, idx) => {
                                const outbound = msg.direction === 'OUTBOUND';
                                const system   = msg.direction === 'SYSTEM';

                                /* Detecta sequência para suprimir a "cauda" nos intermediários */
                                const prevSameDir = group.items[idx - 1]?.direction === msg.direction;
                                const nextSameDir = group.items[idx + 1]?.direction === msg.direction;

                                /* ── Mensagem de sistema ── */
                                if (system) {
                                    return (
                                        <div key={msg.id} className="flex justify-center py-1">
                                            <span className="rounded-full bg-surface px-4 py-0.5 text-[11px] text-muted-foreground border border-border shadow-sm">
                                                {msg.body}
                                            </span>
                                        </div>
                                    );
                                }

                                /* Dados do agente para assinatura */
                                const user         = msg.user as Record<string, unknown> | undefined;
                                const agentName    = (user?.nome ?? user?.name ?? '') as string;
                                const deptName     = ((user?.department as Record<string, unknown>)?.nome
                                    ?? (user?.department as Record<string, unknown>)?.name ?? '') as string;
                                const specialty    = (user?.specialty ?? '') as string;
                                const agentLabel   = deptName || specialty;
                                const hasSignature = outbound && !!agentName;

                                /* ── Bolha de mensagem ── */
                                return (
                                    <div
                                        key={msg.id}
                                        className={`flex ${outbound ? 'justify-end' : 'justify-start'} ${prevSameDir ? 'mt-0.5' : 'mt-2'}`}
                                    >
                                        <div
                                            className={[
                                                'relative max-w-[72%] min-w-[80px] px-3 pt-2 pb-5 text-sm text-foreground shadow-sm',
                                                /* Geometria das bolhas — canto oposto à direção tem raio menor (efeito cauda) */
                                                outbound
                                                    ? nextSameDir
                                                        ? 'rounded-2xl rounded-br-md'
                                                        : 'rounded-2xl rounded-br-sm'
                                                    : nextSameDir
                                                        ? 'rounded-2xl rounded-bl-md'
                                                        : 'rounded-2xl rounded-bl-sm',
                                            ].join(' ')}
                                            style={{
                                                background: outbound
                                                    ? 'var(--c-chat-bubble-out)'
                                                    : 'var(--c-chat-bubble-in)',
                                                border: outbound
                                                    ? '1px solid rgb(var(--c-primary) / 0.18)'
                                                    : '1px solid var(--c-border)',
                                            }}
                                        >
                                            {/* Assinatura do técnico — apenas em mensagens enviadas */}
                                            {hasSignature && (
                                                <p
                                                    className="mb-1 text-[11px] font-semibold leading-tight"
                                                    style={{ color: 'var(--c-chat-sig)' }}
                                                >
                                                    {agentName}
                                                    {agentLabel && (
                                                        <span className="font-normal text-muted-foreground">
                                                            {' '}| {agentLabel}
                                                        </span>
                                                    )}
                                                    {':'}
                                                </p>
                                            )}

                                            {/* Mídia */}
                                            {msg.mediaUrl && msg.type === 'IMAGE' && (
                                                <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="block mb-1">
                                                    <img
                                                        src={msg.mediaUrl}
                                                        alt={msg.body || 'imagem'}
                                                        className="max-w-full rounded-lg max-h-64 object-cover cursor-zoom-in"
                                                        loading="lazy"
                                                    />
                                                </a>
                                            )}
                                            {msg.mediaUrl && msg.type === 'AUDIO' && (
                                                <audio controls src={msg.mediaUrl} className="w-full mb-1 max-w-xs" />
                                            )}
                                            {msg.mediaUrl && msg.type === 'VIDEO' && (
                                                <video controls src={msg.mediaUrl} className="max-w-full rounded-lg max-h-64 mb-1" />
                                            )}
                                            {msg.mediaUrl && msg.type === 'DOCUMENT' && (
                                                <a
                                                    href={msg.mediaUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    download
                                                    className="flex items-center gap-2 mb-1 text-xs underline opacity-80 hover:opacity-100"
                                                >
                                                    📎 {msg.body || 'Documento'}
                                                </a>
                                            )}

                                            {/* Corpo da mensagem (texto / legenda) */}
                                            {(msg.body || !msg.mediaUrl) && (
                                                <p className="whitespace-pre-wrap leading-snug text-foreground">
                                                    {msg.body || ''}
                                                </p>
                                            )}

                                            {/* Horário — canto inferior direito, dentro da bolha */}
                                            <span
                                                className="absolute bottom-1 right-2.5 text-[10px] text-muted-foreground select-none"
                                                aria-label={`Enviado às ${formatTime(msg.createdAt)}`}
                                            >
                                                {formatTime(msg.createdAt)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {/* Sentinel para scroll-to-bottom */}
                <div ref={bottomRef} className="h-1" />
            </div>

            {/* ══ Barra de envio ══════════════════════════════════════ */}
            <form
                onSubmit={submit}
                className="shrink-0 border-t border-border px-3 py-2"
                style={{ background: 'var(--c-chat-input-bg)' }}
            >
                {sendError && (
                    <div className="mb-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger-fg">
                        {sendError}
                    </div>
                )}

                <div className="flex items-end gap-2">
                    <textarea
                        ref={textareaRef}
                        id="chat-message-input"
                        value={body}
                        onChange={handleBodyChange}
                        onKeyDown={handleKeyDown}
                        rows={1}
                        disabled={conversation.status === 'CLOSED'}
                        aria-label="Mensagem para o cliente"
                        placeholder={
                            conversation.status === 'CLOSED'
                                ? 'Conversa encerrada'
                                : 'Digite uma mensagem... (Enter para enviar, Shift+Enter para quebrar linha)'
                        }
                        className={[
                            'flex-1 resize-none rounded-xl border border-border bg-surface',
                            'px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground',
                            'outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30',
                            'disabled:cursor-not-allowed disabled:opacity-60',
                        ].join(' ')}
                        style={{ minHeight: 44, maxHeight: 144, lineHeight: 1.5 }}
                    />

                    <button
                        type="submit"
                        disabled={isSubmitting || !body.trim() || conversation.status === 'CLOSED'}
                        aria-label="Enviar mensagem"
                        className={[
                            'flex h-11 w-11 shrink-0 items-center justify-center',
                            'rounded-full bg-primary text-white shadow-primary-glow',
                            'transition-all hover:bg-primary-700 active:scale-95',
                            'disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
                        ].join(' ')}
                    >
                        {/* Ícone de enviar (send) — inline SVG, sem dependência externa */}
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                            <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
                        </svg>
                    </button>
                </div>
            </form>

            {/* Modal de criação de chamado */}
            {conversation && (
                <TicketFromConvModal
                    conversation={conversation}
                    open={ticketModalOpen}
                    loading={isCreatingTicket}
                    error={createTicketError}
                    onClose={() => setTicketModalOpen(false)}
                    onSubmit={handleCreateTicket}
                />
            )}
        </section>
    );
}
