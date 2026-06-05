import { FormEvent, useState } from 'react';
import type { Conversation, Message } from './types';
import { Icon } from '../ui/Icon';

interface ChatWindowProps {
    conversation: Conversation | null;
    messages: Message[];
    isLoading: boolean;
    isSubmitting: boolean;
    onTake: () => void;
    onSend: (body: string) => void;
    onTransfer: (departmentId: string) => void;
    hasMore: boolean;
    onLoadMore: () => void;
}

function formatDate(value?: string | Date) {
    if (!value) return '';
    return new Date(value).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

export function ChatWindow({ conversation, messages, isLoading, isSubmitting, onTake, onSend, hasMore, onLoadMore }: ChatWindowProps) {
    const [body, setBody] = useState('');

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

    return (
        <section className="flex min-w-0 flex-1 flex-col bg-background">
            <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-4">
                <div>
                    <h2 className="font-bold text-foreground">{contactName}</h2>
                    <p className="text-sm text-muted-foreground">{conversation.contact?.phone}</p>
                </div>

                {conversation.status === 'OPEN' && (
                    <button onClick={onTake} className="rounded-pill bg-primary px-5 py-2 text-sm font-semibold text-white shadow-primary-glow hover:bg-primary-700 transition-colors cursor-pointer">
                        Assumir conversa
                    </button>
                )}
            </header>

            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
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
            </div>

            <form onSubmit={submit} className="border-t border-border bg-surface p-4">
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
        </section>
    );
}
