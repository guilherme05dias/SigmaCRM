import { FormEvent, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import type { Conversation } from './types';
import { contactDisplayName } from './contactDisplayName';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface TicketFromConvModalProps {
    conversation: Conversation;
    open: boolean;
    loading: boolean;
    error: string | null;
    technicians: Array<{ id: string; name: string; active?: boolean }>;
    onClose: () => void;
    onSubmit: (payload: {
        title: string;
        priority: Priority;
        description?: string | null;
        technicianId?: string | null;
        scheduledAt?: string | null;
        visitAddress?: string | null;
        notesInternal?: string | null;
        serviceType?: 'REMOTO' | 'PRESENCIAL' | 'HIBRIDO';
    }) => Promise<void>;
}

const priorityLabels: Record<Priority, string> = {
    LOW: 'Baixa',
    MEDIUM: 'Media',
    HIGH: 'Alta',
    CRITICAL: 'Critica',
};

export function TicketFromConvModal({
    conversation,
    open,
    loading,
    error,
    technicians,
    onClose,
    onSubmit,
}: TicketFromConvModalProps) {
    const contactName = contactDisplayName(conversation.contact);
    const [title, setTitle] = useState(`Atendimento - ${contactName}`);
    const [priority, setPriority] = useState<Priority>('MEDIUM');
    const [description, setDescription] = useState('');
    const [technicianId, setTechnicianId] = useState('');
    const [scheduledAt, setScheduledAt] = useState('');
    const [visitAddress, setVisitAddress] = useState('');
    const [notesInternal, setNotesInternal] = useState('');
    const titleInputRef = useRef<HTMLInputElement>(null);
    const dialogRef = useDialogFocus<HTMLDivElement>(open, onClose);

    useEffect(() => {
        if (!open) return;
        setTitle(`Atendimento - ${contactName}`);
        setPriority('MEDIUM');
        setDescription('');
        setTechnicianId(technicians[0]?.id || '');
        setScheduledAt('');
        setVisitAddress('');
        setNotesInternal('');
        window.setTimeout(() => titleInputRef.current?.focus(), 0);
    }, [open, contactName, technicians]);

    if (!open) return null;

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!title.trim()) return;
        await onSubmit({
            title: title.trim(),
            priority,
            description: description.trim() || null,
            technicianId: technicianId || null,
            scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
            visitAddress: visitAddress.trim() || null,
            notesInternal: notesInternal.trim() || null,
            serviceType: 'PRESENCIAL',
        });
    };

    return (
        <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="ticket-from-conv-title">
            <form onSubmit={submit} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-lifted">
                <div className="mb-5">
                    <h2 id="ticket-from-conv-title" className="text-xl font-semibold text-foreground">Novo chamado</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Vinculado a conversa com {contactName}. A data pode ficar como "Nao definido".
                    </p>
                </div>

                <div className="space-y-4">
                    <Input
                        ref={titleInputRef}
                        label="Titulo"
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
                        <span className="block text-sm font-medium text-foreground">Descricao</span>
                        <textarea
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            rows={4}
                            className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/40"
                            placeholder="Resumo do atendimento, problema relatado ou proximos passos."
                        />
                    </label>

                    <div className="rounded-xl border border-border bg-surface-alt p-4">
                        <p className="mb-3 text-sm font-semibold text-foreground">Agenda técnica</p>

                        <div className="grid gap-4 md:grid-cols-2">
                            <label className="block space-y-1.5">
                                <span className="block text-sm font-medium text-foreground">Tecnico responsavel</span>
                                <select
                                    value={technicianId}
                                    onChange={(event) => setTechnicianId(event.target.value)}
                                    className="h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/40"
                                >
                                    <option value="">Selecione</option>
                                    {technicians.filter((tech) => tech.active ?? true).map((tech) => (
                                        <option key={tech.id} value={tech.id}>{tech.name}</option>
                                    ))}
                                </select>
                            </label>

                            <label className="block space-y-1.5">
                                <span className="block text-sm font-medium text-foreground">Data combinada</span>
                                <input
                                    type="datetime-local"
                                    value={scheduledAt}
                                    onChange={(event) => setScheduledAt(event.target.value)}
                                    className="h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/40"
                                />
                                <span className="text-xs text-muted-foreground">Deixe vazio para "Nao definido".</span>
                            </label>
                        </div>

                        <label className="mt-4 block space-y-1.5">
                            <span className="block text-sm font-medium text-foreground">Endereço do chamado</span>
                            <input
                                value={visitAddress}
                                onChange={(event) => setVisitAddress(event.target.value)}
                                placeholder="Opcional"
                                className="h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/40"
                            />
                        </label>

                        <label className="mt-4 block space-y-1.5">
                            <span className="block text-sm font-medium text-foreground">Observacoes internas</span>
                            <textarea
                                value={notesInternal}
                                onChange={(event) => setNotesInternal(event.target.value)}
                                rows={3}
                                placeholder="Opcional"
                                className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/40"
                            />
                        </label>
                    </div>

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
