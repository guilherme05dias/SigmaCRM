import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { SigmaSidebarIcon } from '../components/sigma/SigmaSidebarIcon';
import { Badge, PriorityBadge, StatusBadge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon, type IconName } from '../components/ui/Icon';
import { Skeleton } from '../components/ui/Skeleton';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';
import { useAuth } from '../lib/auth';

interface DashboardData {
    range: string;
    startDate: string;
    endDate: string;
    metrics: {
        queueCount: number;
        activeConversations: number;
        visitsToday: number;
        pendingVisits: number;
        totalConversationsOpened: number;
        totalMessages: number;
        totalTicketsOpened: number;
        totalTicketsResolved: number;
        conversationsByDepartment: { department: string; count: number }[];
        ticketsByTechnician: { technician: string; count: number }[];
        csat?: { average: number | null; count: number };
        recentConversations: Array<{
            id: string;
            status: 'OPEN' | 'ASSIGNED' | 'CLOSED';
            contactName?: string | null;
            contactPhone: string;
            assignedUserName?: string | null;
            departmentName?: string | null;
            serviceTopicName?: string | null;
            lastMessageAt?: string | null;
            createdAt: string;
        }>;
        recentVisits: Array<{
            id: string;
            ticketId: string;
            protocol?: string | null;
            title: string;
            status: 'PENDING' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';
            ticketStatus: string;
            priority: string;
            scheduledAt?: string | null;
            visitWindowStart?: string | null;
            technicianName?: string | null;
            customerName?: string | null;
            contactPhone: string;
        }>;
    };
}

function Kpi({ title, value, detail, icon, tone }: { title: string; value: string | number; detail: string; icon: IconName; tone: string }) {
    return (
        <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
                    <p className="mt-3 text-3xl font-bold text-foreground">{value}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
                </div>
                <div className={`flex size-11 items-center justify-center rounded-lg ${tone}`}>
                    <Icon name={icon} className="size-5" />
                </div>
            </div>
        </div>
    );
}

const conversationStatusLabels: Record<string, { label: string; tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' }> = {
    OPEN: { label: 'Na fila', tone: 'warning' },
    ASSIGNED: { label: 'Em atendimento', tone: 'primary' },
    CLOSED: { label: 'Encerrado', tone: 'neutral' },
};

const visitStatusLabels: Record<string, { label: string; tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' }> = {
    PENDING: { label: 'Pendente', tone: 'warning' },
    SCHEDULED: { label: 'Agendada', tone: 'primary' },
    IN_PROGRESS: { label: 'Em atendimento', tone: 'info' },
    COMPLETED: { label: 'Concluída', tone: 'success' },
    CANCELED: { label: 'Cancelada', tone: 'danger' },
};

function formatDateTime(value?: string | null) {
    if (!value) return 'Não definido';
    return new Date(value).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function RankedList({ title, icon, items, labelKey }: { title: string; icon: IconName; items: Array<Record<string, string | number>>; labelKey: string }) {
    const max = Math.max(...items.map((item) => Number(item.count)), 1);

    return (
        <section className="rounded-xl border border-border bg-surface p-6 shadow-card">
            <div className="mb-5 flex items-center gap-2">
                <Icon name={icon} className="size-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">{title}</h2>
            </div>

            {items.length === 0 ? (
                <EmptyState
                    icon={icon}
                    title="Sem dados desde o início"
                    description="Aguarde novos registros da operação iniciada em 14/07/2026 às 08:00."
                />
            ) : (
                <div className="space-y-4">
                    {items.map((item) => (
                        <div key={String(item[labelKey])} className="space-y-2">
                            <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="truncate font-medium text-foreground">{item[labelKey]}</span>
                                <span className="font-mono text-muted-foreground">{item.count}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-surface-alt">
                                <div className="h-full rounded-full bg-primary" style={{ width: `${(Number(item.count) / max) * 100}%` }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

export default function Dashboard() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        let timedOut = false;
        const timeout = window.setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, 15000);
        setLoading(true);
        setError(null);

        apiRequest<DashboardData>('/api/reports/summary', { signal: controller.signal })
            .then((nextData) => {
                if (active) setData(nextData);
            })
            .catch((err) => {
                if (controller.signal.aborted) {
                    if (active && timedOut) setError('A solicitação demorou mais que o esperado. Verifique sua conexão e tente novamente.');
                    return;
                }
                if (active && !redirectOnUnauthorized(err, navigate)) {
                    setError(err instanceof Error ? err.message : 'Erro ao carregar dashboard.');
                }
            })
            .finally(() => {
                window.clearTimeout(timeout);
                if (active) setLoading(false);
            });

        return () => {
            active = false;
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [navigate, reloadKey]);

    const resolutionRate = useMemo(() => {
        if (!data || data.metrics.totalTicketsOpened === 0) return 0;
        return Math.round((data.metrics.totalTicketsResolved / data.metrics.totalTicketsOpened) * 100);
    }, [data]);

    const hasOperationalData = useMemo(() => {
        if (!data) return false;
        const { metrics } = data;
        return metrics.totalConversationsOpened > 0
            || metrics.queueCount > 0
            || metrics.activeConversations > 0
            || metrics.visitsToday > 0
            || metrics.pendingVisits > 0
            || metrics.totalMessages > 0
            || metrics.totalTicketsOpened > 0
            || metrics.totalTicketsResolved > 0
            || metrics.conversationsByDepartment.length > 0
            || metrics.ticketsByTechnician.length > 0
            || metrics.recentConversations.length > 0
            || metrics.recentVisits.length > 0
            || Boolean(metrics.csat?.count);
    }, [data]);

    return (
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
            <SigmaSidebarIcon user={user} onLogout={logout} />
            <main className="flex-1 overflow-y-auto pb-[88px] md:pb-0">
                <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 p-4 sm:p-6 lg:p-10">
                    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Visão operacional</h1>
                            <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">Atendimentos, chamados e visitas que precisam de atenção.</p>
                        </div>

                        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Icon name="schedule" className="size-5" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Período dos indicadores</p>
                                <p className="text-sm font-semibold text-foreground">Desde 14/07/2026 às 08:00</p>
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex flex-col gap-6" aria-label="Carregando dashboard">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                {Array.from({ length: 4 }).map((_, index) => (
                                    <Skeleton key={index} className="h-36" />
                                ))}
                            </div>
                            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                                <Skeleton className="h-80" />
                                <Skeleton className="h-80" />
                                <Skeleton className="h-80" />
                                <Skeleton className="h-80" />
                            </div>
                        </div>
                    ) : error ? (
                        <EmptyState icon="error" title="Não foi possível carregar o dashboard" description={error} actionLabel="Tentar novamente" onAction={() => setReloadKey((value) => value + 1)} />
                    ) : data && !hasOperationalData ? (
                        <EmptyState
                            icon="dashboard"
                            title="Sem dados operacionais"
                            description="Ainda não há conversas, mensagens ou chamados registrados hoje desde 08:00."
                        />
                    ) : data ? (
                        <>
                            <section aria-labelledby="operacao-agora" className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <h2 id="operacao-agora" className="text-lg font-bold text-foreground">Operação agora</h2>
                                    <span className="text-xs text-muted-foreground">Desde 14/07/2026 às 08:00</span>
                                </div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                    <Kpi title="Fila atual" value={data.metrics.queueCount} detail="Clientes aguardando atendimento" icon="forum" tone="bg-warning-soft text-warning-fg" />
                                    <Kpi title="Ativos" value={data.metrics.activeConversations} detail="Atendimentos em andamento" icon="chat" tone="bg-primary/10 text-primary" />
                                    <Kpi title="Visitas hoje" value={data.metrics.visitsToday} detail="Agendadas para hoje" icon="engineering" tone="bg-info-soft text-info-fg" />
                                    <Kpi title="Visitas abertas" value={data.metrics.pendingVisits} detail="Pendentes, agendadas ou em campo" icon="schedule" tone="bg-surface-alt text-muted-foreground" />
                                </div>
                            </section>

                            <section aria-label="Resumo do período" className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-surface sm:grid-cols-4">
                                {[
                                    ['Conversas', data.metrics.totalConversationsOpened],
                                    ['Mensagens', data.metrics.totalMessages],
                                    ['Chamados', data.metrics.totalTicketsOpened],
                                    ['Resolução', `${resolutionRate}%`],
                                ].map(([label, value], index) => (
                                    <div key={label} className={`px-4 py-4 sm:px-5 ${index % 2 ? 'border-l border-border' : ''} ${index >= 2 ? 'border-t border-border sm:border-t-0' : ''} ${index > 0 ? 'sm:border-l sm:border-border' : ''}`}>
                                        <p className="text-xs font-medium text-muted-foreground">{label}</p>
                                        <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
                                    </div>
                                ))}
                            </section>

                            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                                <section className="rounded-xl border border-border bg-surface p-6 shadow-card">
                                    <div className="mb-5 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <Icon name="chat" className="size-5 text-primary" />
                                            <h2 className="text-lg font-bold text-foreground">Últimos atendimentos</h2>
                                        </div>
                                        <Link to="/inbox" className="text-sm font-semibold text-primary hover:text-primary-700">Ver inbox</Link>
                                    </div>

                                    {data.metrics.recentConversations.length === 0 ? (
                                        <EmptyState icon="forum" title="Sem atendimentos recentes" description="As últimas conversas do WhatsApp aparecerão aqui." />
                                    ) : (
                                        <div className="space-y-3">
                                            {data.metrics.recentConversations.map((conversation) => {
                                                const status = conversationStatusLabels[conversation.status] || { label: conversation.status, tone: 'neutral' as const };
                                                return (
                                                    <Link key={conversation.id} to="/inbox" className="block rounded-xl border border-border p-3 transition-colors hover:border-primary/40 hover:bg-surface-alt">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="truncate font-semibold text-foreground">{conversation.contactName || conversation.contactPhone}</p>
                                                                <p className="mt-1 truncate text-sm text-muted-foreground">
                                                                    {conversation.departmentName || 'Sem setor'}{conversation.assignedUserName ? ` • ${conversation.assignedUserName}` : ''}
                                                                </p>
                                                            </div>
                                                            <Badge tone={status.tone} dot>{status.label}</Badge>
                                                        </div>
                                                        <p className="mt-3 text-xs text-muted-foreground">
                                                            {conversation.serviceTopicName || 'Assunto não definido'} • {formatDateTime(conversation.lastMessageAt || conversation.createdAt)}
                                                        </p>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>

                                <section className="rounded-xl border border-border bg-surface p-6 shadow-card">
                                    <div className="mb-5 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <Icon name="engineering" className="size-5 text-primary" />
                                            <h2 className="text-lg font-bold text-foreground">Últimas visitas</h2>
                                        </div>
                                        <Link to="/visits" className="text-sm font-semibold text-primary hover:text-primary-700">Ver painel</Link>
                                    </div>

                                    {data.metrics.recentVisits.length === 0 ? (
                                        <EmptyState icon="engineering" title="Sem visitas recentes" description="As visitas abertas a partir dos atendimentos aparecerão aqui." />
                                    ) : (
                                        <div className="space-y-3">
                                            {data.metrics.recentVisits.map((visit) => {
                                                const status = visitStatusLabels[visit.status] || { label: visit.status, tone: 'neutral' as const };
                                                return (
                                                    <Link key={visit.id} to={`/tickets/${visit.ticketId}`} className="block rounded-xl border border-border p-3 transition-colors hover:border-primary/40 hover:bg-surface-alt">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="truncate font-semibold text-foreground">{visit.protocol || visit.title}</p>
                                                                <p className="mt-1 truncate text-sm text-muted-foreground">{visit.customerName || visit.contactPhone}</p>
                                                            </div>
                                                            <Badge tone={status.tone} dot>{status.label}</Badge>
                                                        </div>
                                                        <p className="mt-3 text-xs text-muted-foreground">
                                                            {formatDateTime(visit.scheduledAt || visit.visitWindowStart)} • {visit.technicianName || 'Técnico não definido'}
                                                        </p>
                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                            <PriorityBadge priority={visit.priority} />
                                                            <StatusBadge status={visit.ticketStatus} />
                                                        </div>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>
                            </div>

                            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                                <RankedList title="Conversas por departamento" icon="groups" items={data.metrics.conversationsByDepartment} labelKey="department" />
                                <RankedList title="Chamados por tecnico" icon="engineering" items={data.metrics.ticketsByTechnician} labelKey="technician" />
                            </div>
                        </>
                    ) : null}
                </div>
            </main>
        </div>
    );
}
