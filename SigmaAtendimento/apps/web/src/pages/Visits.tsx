import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SigmaSidebarIcon } from '../components/sigma/SigmaSidebarIcon';
import { Badge, PriorityBadge, StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';
import { useAuth } from '../lib/auth';

type FieldVisitStatus = 'PENDING' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';

interface UserOption {
    id: string;
    name: string;
    role: string;
    active?: boolean;
}

interface VisitTicket {
    id: string;
    protocol?: string | null;
    title: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    status: string;
    contact: { name?: string | null; phone: string };
    customer?: { name: string } | null;
    fieldService?: {
        status?: FieldVisitStatus;
        scheduledAt?: string | null;
        visitWindowStart?: string | null;
        visitWindowEnd?: string | null;
        visitAddress?: string | null;
        technician?: { id: string; name?: string | null } | null;
    } | null;
    createdAt: string;
}

const visitStatusLabels: Record<FieldVisitStatus, string> = {
    PENDING: 'Pendente',
    SCHEDULED: 'Agendada',
    IN_PROGRESS: 'Em atendimento',
    COMPLETED: 'Concluída',
    CANCELED: 'Cancelada',
};

const visitStatusTone: Record<FieldVisitStatus, 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
    PENDING: 'warning',
    SCHEDULED: 'primary',
    IN_PROGRESS: 'info',
    COMPLETED: 'success',
    CANCELED: 'danger',
};

function startOfWeek(date: Date) {
    const next = new Date(date);
    const day = next.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    next.setDate(next.getDate() + diff);
    next.setHours(0, 0, 0, 0);
    return next;
}

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function isSameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

function getVisitDate(ticket: VisitTicket) {
    const value = ticket.fieldService?.scheduledAt || ticket.fieldService?.visitWindowStart || null;
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value?: string | null) {
    if (!value) return 'Não definido';
    return new Date(value).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function customerLabel(ticket: VisitTicket) {
    return ticket.customer?.name || ticket.contact.name || ticket.contact.phone;
}

export default function Visits() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { showToast } = useToast();
    const [tickets, setTickets] = useState<VisitTicket[]>([]);
    const [technicians, setTechnicians] = useState<Array<{ id: string; name: string }>>([]);
    const [statusFilter, setStatusFilter] = useState('');
    const [technicianFilter, setTechnicianFilter] = useState('');
    const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date()));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekAnchor, index)), [weekAnchor]);
    const scheduledVisits = useMemo(() => tickets.filter((ticket) => getVisitDate(ticket)), [tickets]);
    const unscheduledVisits = useMemo(() => tickets.filter((ticket) => !getVisitDate(ticket)), [tickets]);
    const todayVisits = useMemo(() => {
        const today = new Date();
        return scheduledVisits.filter((ticket) => {
            const date = getVisitDate(ticket);
            return date ? isSameDay(date, today) : false;
        });
    }, [scheduledVisits]);

    const loadVisits = () => {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({ visitOnly: 'true' });
        if (statusFilter) params.set('fieldVisitStatus', statusFilter);
        if (technicianFilter) params.set('technicianId', technicianFilter);

        apiRequest<VisitTicket[]>(`/api/tickets?${params.toString()}`)
            .then((data) => setTickets(Array.isArray(data) ? data : []))
            .catch((err) => {
                if (!redirectOnUnauthorized(err, navigate)) {
                    const message = err instanceof Error ? err.message : 'Erro ao carregar Chamados.';
                    setError(message);
                    showToast({ title: 'Erro ao carregar Chamados', description: message, variant: 'error' });
                }
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadVisits();
    }, [statusFilter, technicianFilter]);

    useEffect(() => {
        apiRequest<UserOption[]>('/api/users')
            .then((data) => {
                const activeTechnicians = Array.isArray(data)
                    ? data
                        .filter((item) => item.role === 'TECHNICIAN' && (item.active ?? true))
                        .map((item) => ({ id: item.id, name: item.name }))
                    : [];
                setTechnicians(activeTechnicians);
            })
            .catch((err) => {
                if (!redirectOnUnauthorized(err, navigate)) console.error(err);
            });
    }, [navigate]);

    return (
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
            <SigmaSidebarIcon user={user} onLogout={logout} />
            <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
                <div className="mx-auto flex w-full max-w-container flex-col gap-6 p-4 md:p-8">
                    <header className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-card lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <div className="mb-3 inline-flex items-center gap-2 rounded-pill border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                                <Icon name="engineering" className="size-4" />
                                Painel de campo
                            </div>
                            <h1 className="text-3xl font-bold tracking-tight text-foreground">Agenda técnica</h1>
                            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                                Acompanhe Chamados pendentes, agendas da semana e atendimentos em campo por técnico e status.
                            </p>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-sm">
                            <div className="rounded-xl border border-border bg-surface-alt px-4 py-3">
                                <p className="text-xs text-muted-foreground">Hoje</p>
                                <p className="mt-1 text-2xl font-bold text-foreground">{todayVisits.length}</p>
                            </div>
                            <div className="rounded-xl border border-border bg-surface-alt px-4 py-3">
                                <p className="text-xs text-muted-foreground">Agendadas</p>
                                <p className="mt-1 text-2xl font-bold text-foreground">{scheduledVisits.length}</p>
                            </div>
                            <div className="rounded-xl border border-border bg-surface-alt px-4 py-3">
                                <p className="text-xs text-muted-foreground">Sem data</p>
                                <p className="mt-1 text-2xl font-bold text-foreground">{unscheduledVisits.length}</p>
                            </div>
                        </div>
                    </header>

                    <section className="grid gap-4 rounded-2xl border border-border bg-surface p-4 shadow-card md:grid-cols-[1fr_1fr_auto]">
                        <label>
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Técnico</span>
                            <select
                                value={technicianFilter}
                                onChange={(event) => setTechnicianFilter(event.target.value)}
                                className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                            >
                                <option value="">Todos os técnicos</option>
                                {technicians.map((technician) => (
                                    <option key={technician.id} value={technician.id}>{technician.name}</option>
                                ))}
                            </select>
                        </label>
                        <label>
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status do chamado</span>
                            <select
                                value={statusFilter}
                                onChange={(event) => setStatusFilter(event.target.value)}
                                className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                            >
                                <option value="">Todos os status</option>
                                {Object.entries(visitStatusLabels).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </select>
                        </label>
                        <div className="flex items-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}>
                                Semana anterior
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setWeekAnchor(startOfWeek(new Date()))}>
                                Hoje
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}>
                                Próxima
                            </Button>
                        </div>
                    </section>

                    {error && (
                        <div className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger-fg">
                            {error}
                        </div>
                    )}

                    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
                        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-semibold text-foreground">Calendário semanal</h2>
                                    <p className="text-sm text-muted-foreground">
                                        {weekDays[0].toLocaleDateString('pt-BR')} até {weekDays[6].toLocaleDateString('pt-BR')}
                                    </p>
                                </div>
                            </div>

                            {loading ? (
                                <div className="grid gap-3 md:grid-cols-7">
                                    {weekDays.map((day) => (
                                        <div key={day.toISOString()} className="rounded-xl border border-border bg-surface-alt p-3">
                                            <Skeleton className="h-4 w-16" />
                                            <Skeleton className="mt-4 h-16 w-full" />
                                            <Skeleton className="mt-3 h-12 w-full" />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="grid gap-3 md:grid-cols-7">
                                    {weekDays.map((day) => {
                                        const items = scheduledVisits.filter((ticket) => {
                                            const date = getVisitDate(ticket);
                                            return date ? isSameDay(date, day) : false;
                                        });

                                        return (
                                            <div key={day.toISOString()} className="min-h-[220px] rounded-xl border border-border bg-surface-alt p-3">
                                                <div className="mb-3">
                                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                        {day.toLocaleDateString('pt-BR', { weekday: 'short' })}
                                                    </p>
                                                    <p className="text-lg font-bold text-foreground">{day.getDate()}</p>
                                                </div>
                                                <div className="space-y-2">
                                                    {items.length === 0 ? (
                                                        <p className="rounded-lg border border-dashed border-border px-2 py-3 text-center text-xs text-muted-foreground">
                                                            Sem Chamados
                                                        </p>
                                                    ) : items.map((ticket) => {
                                                        const fieldStatus = ticket.fieldService?.status || 'PENDING';
                                                        return (
                                                            <Link
                                                                key={ticket.id}
                                                                to={`/tickets/${ticket.id}`}
                                                                className="block rounded-lg border border-border bg-surface p-2 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
                                                            >
                                                                <p className="font-semibold text-foreground">{ticket.protocol || ticket.title}</p>
                                                                <p className="mt-1 truncate text-muted-foreground">{customerLabel(ticket)}</p>
                                                                <Badge tone={visitStatusTone[fieldStatus]} dot className="mt-2">
                                                                    {visitStatusLabels[fieldStatus]}
                                                                </Badge>
                                                            </Link>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <aside className="space-y-6">
                            <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
                                <h2 className="mb-4 text-lg font-semibold text-foreground">Próximos Chamados</h2>
                                {loading ? (
                                    <div className="space-y-3">
                                        {Array.from({ length: 4 }).map((_, index) => (
                                            <div key={index} className="rounded-xl border border-border p-3">
                                                <Skeleton className="h-4 w-32" />
                                                <Skeleton className="mt-3 h-4 w-48" />
                                                <Skeleton className="mt-3 h-6 w-24" />
                                            </div>
                                        ))}
                                    </div>
                                ) : tickets.length === 0 ? (
                                    <EmptyState
                                        icon="engineering"
                                        title="Nenhum Chamado encontrado"
                                        description="Ajuste os filtros ou crie um Chamado a partir de um Atendimento do WhatsApp."
                                    />
                                ) : (
                                    <div className="space-y-3">
                                        {[...tickets]
                                            .sort((a, b) => (getVisitDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (getVisitDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER))
                                            .slice(0, 10)
                                            .map((ticket) => {
                                                const fieldStatus = ticket.fieldService?.status || 'PENDING';
                                                return (
                                                    <Link key={ticket.id} to={`/tickets/${ticket.id}`} className="block rounded-xl border border-border p-3 transition-colors hover:border-primary/40 hover:bg-surface-alt">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="truncate font-semibold text-foreground">{ticket.protocol || ticket.title}</p>
                                                                <p className="mt-1 truncate text-sm text-muted-foreground">{customerLabel(ticket)}</p>
                                                            </div>
                                                            <Badge tone={visitStatusTone[fieldStatus]} dot>
                                                                {visitStatusLabels[fieldStatus]}
                                                            </Badge>
                                                        </div>
                                                        <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                                                            <span>{formatDateTime(ticket.fieldService?.scheduledAt || ticket.fieldService?.visitWindowStart)}</span>
                                                            <span>{ticket.fieldService?.technician?.name || 'Técnico não definido'}</span>
                                                            {ticket.fieldService?.visitAddress && <span className="truncate">{ticket.fieldService.visitAddress}</span>}
                                                        </div>
                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                            <PriorityBadge priority={ticket.priority} />
                                                            <StatusBadge status={ticket.status} />
                                                        </div>
                                                    </Link>
                                                );
                                            })}
                                    </div>
                                )}
                            </div>
                        </aside>
                    </section>
                </div>
            </main>
        </div>
    );
}
