import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SigmaSidebarIcon } from '../components/sigma/SigmaSidebarIcon';
import { PriorityBadge, StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';
import { useAuth } from '../lib/auth';

type TicketStatus =
    | 'NEW' | 'QUEUED' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'WAITING_INTERNAL'
    | 'SCHEDULED_FIELD_SERVICE' | 'RESOLVED' | 'CLOSED' | 'CANCELED';
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type ServiceType = 'PRESENCIAL' | 'REMOTO';

interface UserOption {
    id: string;
    name: string;
    role: string;
    active?: boolean;
}

interface TimelineEvent {
    id: string;
    type: string;
    payload?: Record<string, unknown> | null;
    createdAt: string;
}

interface TicketDetailData {
    id: string;
    protocol?: string | null;
    title: string;
    description?: string | null;
    priority: TicketPriority;
    status: TicketStatus;
    notesInternal?: string | null;
    contact: { name?: string | null; phone: string };
    customer?: { name: string } | null;
    assignedUser?: { id: string; name: string } | null;
    department?: { name: string } | null;
    fieldService?: {
        serviceType?: ServiceType;
        equipment?: string | null;
        visitAddress?: string | null;
        visitWindowStart?: string | null;
        visitWindowEnd?: string | null;
        technicianId?: string | null;
        technician?: { id: string; name: string } | null;
        resolution?: string | null;
    } | null;
    evaluation?: { rating: number; comment?: string | null } | null;
    timeline?: TimelineEvent[];
    createdAt: string;
    updatedAt: string;
}

interface TicketFormState {
    title: string;
    status: TicketStatus;
    priority: TicketPriority;
    description: string;
    notesInternal: string;
    serviceType: ServiceType;
    equipment: string;
    technicianId: string;
    visitAddress: string;
    visitWindowStart: string;
    visitWindowEnd: string;
}

const statusLabels: Record<TicketStatus, string> = {
    NEW: 'Novo',
    QUEUED: 'Na fila',
    IN_PROGRESS: 'Em andamento',
    WAITING_CUSTOMER: 'Aguardando cliente',
    WAITING_INTERNAL: 'Aguardando interno',
    SCHEDULED_FIELD_SERVICE: 'Visita agendada',
    RESOLVED: 'Resolvido',
    CLOSED: 'Fechado',
    CANCELED: 'Cancelado',
};

const transitionMap: Record<TicketStatus, TicketStatus[]> = {
    NEW: ['QUEUED', 'IN_PROGRESS', 'CANCELED'],
    QUEUED: ['IN_PROGRESS', 'CANCELED'],
    IN_PROGRESS: ['WAITING_CUSTOMER', 'WAITING_INTERNAL', 'SCHEDULED_FIELD_SERVICE', 'RESOLVED', 'CANCELED'],
    WAITING_CUSTOMER: ['IN_PROGRESS', 'RESOLVED', 'CANCELED'],
    WAITING_INTERNAL: ['IN_PROGRESS', 'RESOLVED', 'CANCELED'],
    SCHEDULED_FIELD_SERVICE: ['IN_PROGRESS', 'RESOLVED', 'CANCELED'],
    RESOLVED: ['CLOSED', 'IN_PROGRESS'],
    CLOSED: [],
    CANCELED: [],
};

function toDatetimeLocal(value?: string | null) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function fromDatetimeLocal(value: string) {
    return value ? new Date(value).toISOString() : null;
}

function formatDate(value?: string | null) {
    if (!value) return 'Não informado';
    return new Date(value).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

function Stars({ rating }: { rating: number }) {
    return (
        <span className="inline-flex text-warning-fg" aria-label={`Nota ${rating} de 5`}>
            {Array.from({ length: 5 }).map((_, index) => (
                <span key={index}>{index < rating ? '★' : '☆'}</span>
            ))}
        </span>
    );
}

export default function TicketDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [ticket, setTicket] = useState<TicketDetailData | null>(null);
    const [technicians, setTechnicians] = useState<UserOption[]>([]);
    const [form, setForm] = useState<TicketFormState | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const loadTicket = () => {
        if (!id) return;
        setLoading(true);
        setError(null);

        apiRequest<TicketDetailData>(`/api/tickets/${id}`)
            .then((data) => {
                setTicket(data);
                setForm({
                    title: data.title,
                    status: data.status,
                    priority: data.priority,
                    description: data.description || '',
                    notesInternal: data.notesInternal || '',
                    serviceType: data.fieldService?.serviceType || 'REMOTO',
                    equipment: data.fieldService?.equipment || '',
                    technicianId: data.fieldService?.technician?.id || data.fieldService?.technicianId || '',
                    visitAddress: data.fieldService?.visitAddress || '',
                    visitWindowStart: toDatetimeLocal(data.fieldService?.visitWindowStart),
                    visitWindowEnd: toDatetimeLocal(data.fieldService?.visitWindowEnd),
                });
            })
            .catch((err) => {
                if (!redirectOnUnauthorized(err, navigate)) {
                    setError(err instanceof Error ? err.message : 'Erro ao carregar chamado.');
                }
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadTicket();
        apiRequest<UserOption[]>('/api/users')
            .then((data) => setTechnicians(Array.isArray(data) ? data.filter((item) => item.active ?? true) : []))
            .catch((err) => {
                if (!redirectOnUnauthorized(err, navigate)) console.error(err);
            });
    }, [id, navigate]);

    const statusOptions = useMemo(() => {
        if (!ticket) return [];
        return [ticket.status, ...transitionMap[ticket.status]].filter((value, index, list) => list.indexOf(value) === index);
    }, [ticket]);

    const saveTicket = async (event: FormEvent) => {
        event.preventDefault();
        if (!id || !form) return;
        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const updated = await apiRequest<TicketDetailData>(`/api/tickets/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    title: form.title,
                    status: form.status,
                    priority: form.priority,
                    description: form.description || null,
                    notesInternal: form.notesInternal || null,
                    serviceType: form.serviceType,
                    equipment: form.equipment || null,
                    technicianId: form.technicianId || null,
                    visitAddress: form.visitAddress || null,
                    visitWindowStart: fromDatetimeLocal(form.visitWindowStart),
                    visitWindowEnd: fromDatetimeLocal(form.visitWindowEnd),
                }),
            });
            setTicket(updated);
            setSuccess('Chamado atualizado.');
            loadTicket();
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                setError(err instanceof Error ? err.message : 'Erro ao salvar chamado.');
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
            <SigmaSidebarIcon user={user} onLogout={logout} />
            <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
                <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 p-6 lg:p-10">
                    <Link to="/tickets" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-primary hover:text-primary-700">
                        ← Voltar para chamados
                    </Link>

                    {loading ? (
                        <div className="rounded-2xl border border-border bg-surface p-8 text-center text-muted-foreground">Carregando chamado...</div>
                    ) : !ticket || !form ? (
                        <div className="rounded-2xl border border-danger/20 bg-danger-soft p-8 text-center text-danger-fg">{error || 'Chamado não encontrado.'}</div>
                    ) : (
                        <>
                            <header className="rounded-2xl border border-border bg-surface p-6 shadow-card">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                        <p className="text-sm font-semibold uppercase tracking-wider text-primary">{ticket.protocol || `#${ticket.id.slice(0, 8)}`}</p>
                                        <h1 className="mt-2 text-3xl font-bold text-foreground">{ticket.title}</h1>
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            {ticket.customer?.name || ticket.contact?.name || ticket.contact.phone}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <StatusBadge status={ticket.status} />
                                        <PriorityBadge priority={ticket.priority} />
                                    </div>
                                </div>
                            </header>

                            {error && <div className="rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger-fg">{error}</div>}
                            {success && <div className="rounded-lg border border-success/20 bg-success-soft p-3 text-sm text-success-fg">{success}</div>}

                            <form onSubmit={saveTicket} className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
                                <section className="space-y-6">
                                    <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
                                        <h2 className="mb-4 text-lg font-semibold text-foreground">Dados do chamado</h2>
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <label className="md:col-span-2">
                                                <span className="mb-1 block text-sm font-medium text-foreground">Título</span>
                                                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
                                            </label>
                                            <label>
                                                <span className="mb-1 block text-sm font-medium text-foreground">Status</span>
                                                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as TicketStatus })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30">
                                                    {statusOptions.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                                                </select>
                                            </label>
                                            <label>
                                                <span className="mb-1 block text-sm font-medium text-foreground">Prioridade</span>
                                                <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as TicketPriority })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30">
                                                    <option value="LOW">Baixa</option>
                                                    <option value="MEDIUM">Média</option>
                                                    <option value="HIGH">Alta</option>
                                                    <option value="CRITICAL">Crítica</option>
                                                </select>
                                            </label>
                                            <label className="md:col-span-2">
                                                <span className="mb-1 block text-sm font-medium text-foreground">Descrição</span>
                                                <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={5} className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
                                            </label>
                                            <label className="md:col-span-2">
                                                <span className="mb-1 block text-sm font-medium text-foreground">Notas internas</span>
                                                <textarea value={form.notesInternal} onChange={(event) => setForm({ ...form, notesInternal: event.target.value })} rows={4} className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
                                            </label>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
                                        <h2 className="mb-4 text-lg font-semibold text-foreground">Field service</h2>
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <label>
                                                <span className="mb-1 block text-sm font-medium text-foreground">Tipo</span>
                                                <select value={form.serviceType} onChange={(event) => setForm({ ...form, serviceType: event.target.value as ServiceType })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30">
                                                    <option value="REMOTO">Remoto</option>
                                                    <option value="PRESENCIAL">Presencial</option>
                                                </select>
                                            </label>
                                            <label>
                                                <span className="mb-1 block text-sm font-medium text-foreground">Técnico</span>
                                                <select value={form.technicianId} onChange={(event) => setForm({ ...form, technicianId: event.target.value })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30">
                                                    <option value="">Não atribuído</option>
                                                    {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}
                                                </select>
                                            </label>
                                            <label>
                                                <span className="mb-1 block text-sm font-medium text-foreground">Equipamento</span>
                                                <input value={form.equipment} onChange={(event) => setForm({ ...form, equipment: event.target.value })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
                                            </label>
                                            <label>
                                                <span className="mb-1 block text-sm font-medium text-foreground">Endereço da visita</span>
                                                <input value={form.visitAddress} onChange={(event) => setForm({ ...form, visitAddress: event.target.value })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
                                            </label>
                                            <label>
                                                <span className="mb-1 block text-sm font-medium text-foreground">Início da janela</span>
                                                <input type="datetime-local" value={form.visitWindowStart} onChange={(event) => setForm({ ...form, visitWindowStart: event.target.value })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
                                            </label>
                                            <label>
                                                <span className="mb-1 block text-sm font-medium text-foreground">Fim da janela</span>
                                                <input type="datetime-local" value={form.visitWindowEnd} onChange={(event) => setForm({ ...form, visitWindowEnd: event.target.value })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
                                            </label>
                                        </div>
                                    </div>
                                </section>

                                <aside className="space-y-6">
                                    <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
                                        <h2 className="mb-4 text-lg font-semibold text-foreground">Resumo</h2>
                                        <dl className="space-y-3 text-sm">
                                            <div><dt className="text-muted-foreground">Contato</dt><dd className="font-medium text-foreground">{ticket.contact.name || ticket.contact.phone}</dd></div>
                                            <div><dt className="text-muted-foreground">Departamento</dt><dd className="font-medium text-foreground">{ticket.department?.name || 'Não informado'}</dd></div>
                                            <div><dt className="text-muted-foreground">Responsável</dt><dd className="font-medium text-foreground">{ticket.assignedUser?.name || 'Não atribuído'}</dd></div>
                                            <div><dt className="text-muted-foreground">Criado em</dt><dd className="font-medium text-foreground">{formatDate(ticket.createdAt)}</dd></div>
                                        </dl>
                                        <Button type="submit" loading={saving} className="mt-5 w-full">
                                            Salvar alterações
                                        </Button>
                                    </div>

                                    <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
                                        <h2 className="mb-4 text-lg font-semibold text-foreground">CSAT</h2>
                                        {ticket.evaluation ? (
                                            <div className="space-y-2 text-sm">
                                                <Stars rating={ticket.evaluation.rating} />
                                                <p className="text-muted-foreground">{ticket.evaluation.comment || 'Sem comentário.'}</p>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">Sem avaliação registrada.</p>
                                        )}
                                    </div>

                                    <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
                                        <h2 className="mb-4 text-lg font-semibold text-foreground">Timeline</h2>
                                        {ticket.timeline?.length ? (
                                            <div className="space-y-4">
                                                {ticket.timeline.map((event) => (
                                                    <div key={event.id} className="border-l-2 border-primary/30 pl-3">
                                                        <p className="text-sm font-semibold text-foreground">{event.type}</p>
                                                        <p className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</p>
                                                        {event.payload && <pre className="mt-2 overflow-auto rounded-lg bg-surface-alt p-2 text-xs text-muted-foreground">{JSON.stringify(event.payload, null, 2)}</pre>}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">Sem eventos registrados.</p>
                                        )}
                                    </div>
                                </aside>
                            </form>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
