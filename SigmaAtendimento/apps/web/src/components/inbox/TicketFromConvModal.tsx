import { FormEvent, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { Conversation } from './types';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface TicketFromConvModalProps {
    conversation: Conversation;
    open: boolean;
    loading: boolean;
    error: string | null;
    onClose: () => void;
    onSubmit: (payload: { title: string; priority: Priority; description?: string | null }) => Promise<void>;
}

const priorityLabels: Record<Priority, string> = {
    LOW: 'Baixa',
    MEDIUM: 'Média',
    HIGH: 'Alta',
    CRITICAL: 'Crítica',
};

export function TicketFromConvModal({ conversation, open, loading, error, onClose, onSubmit }: TicketFromConvModalProps) {
    const contactName = conversation.contact?.name || conversation.contact?.phone || 'Contato';
    const [title, setTitle] = useState(`Atendimento - ${contactName}`);
    const [priority, setPriority] = useState<Priority>('MEDIUM');
    const [description, setDescription] = useState('');
    const titleInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        setTitle(`Atendimento - ${contactName}`);
        setPriority('MEDIUM');
        setDescription('');
        window.setTimeout(() => titleInputRef.current?.focus(), 0);
    }, [open, contactName]);

    if (!open) return null;

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!title.trim()) return;
        await onSubmit({
            title: title.trim(),
            priority,
            description: description.trim() || null,
        });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="ticket-from-conv-title">
            <form onSubmit={submit} className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-lifted">
                <div className="mb-5">
                    <h2 id="ticket-from-conv-title" className="text-xl font-semibold text-foreground">Criar chamado</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Vinculado à conversa com {contactName}.
                    </p>
                </div>

                <div className="space-y-4">
                    <Input
                        ref={titleInputRef}
                        label="Título"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        required
                    />

                    <label className="block space-y-1.5">
                        <span className="block text-sm font-medium text-foreground">Prioridade</span>
                        <select
                            value={priority}
                            onChange={(event) => setPriority(event.target.value as Priority)}
                            className="h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/40"
                        >
                            {Object.entries(priorityLabels).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </label>

                    <label className="block space-y-1.5">
                        <span className="block text-sm font-medium text-foreground">Descrição</span>
                        <textarea
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            rows={4}
                            className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/40"
                            placeholder="Resumo do atendimento, problema relatado ou próximos passos."
                        />
                    </label>

                    {error && (
                        <div className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger-fg">
                            {error}
                        </div>
                    )}
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                        Cancelar
                    </Button>
                    <Button type="submit" loading={loading} disabled={!title.trim()}>
                        Criar chamado
                    </Button>
                </div>
            </form>
        </div>
    );
}
