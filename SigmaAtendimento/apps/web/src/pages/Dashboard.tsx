import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SigmaSidebarIcon } from '../components/sigma/SigmaSidebarIcon';
import { Icon, type IconName } from '../components/ui/Icon';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';

type ReportRange = '1d' | '7d' | '15d' | '30d' | '60d' | '90d';

interface DashboardData {
    range: ReportRange;
    startDate: string;
    endDate: string;
    metrics: {
        totalConversationsOpened: number;
        totalMessages: number;
        totalTicketsOpened: number;
        totalTicketsResolved: number;
        conversationsByDepartment: { department: string; count: number }[];
        ticketsByTechnician: { technician: string; count: number }[];
        csat?: { average: number | null; count: number };
    };
}

const ranges: Array<{ value: ReportRange; label: string }> = [
    { value: '1d', label: 'Hoje' },
    { value: '7d', label: '7 dias' },
    { value: '15d', label: '15 dias' },
    { value: '30d', label: '30 dias' },
    { value: '60d', label: '60 dias' },
    { value: '90d', label: '90 dias' },
];

const mockUser = { nome: 'Admin', role: 'Administrador' };

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

function RankedList({ title, icon, items, labelKey }: { title: string; icon: IconName; items: Array<Record<string, string | number>>; labelKey: string }) {
    const max = Math.max(...items.map((item) => Number(item.count)), 1);

    return (
        <section className="rounded-xl border border-border bg-surface p-6 shadow-card">
            <div className="mb-5 flex items-center gap-2">
                <Icon name={icon} className="size-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">{title}</h2>
            </div>

            {items.length === 0 ? (
                <p className="py-8 text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
                <div className="space-y-4">
                    {items.map((item, index) => (
                        <div key={`${item[labelKey]}-${index}`} className="space-y-2">
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
    const [range, setRange] = useState<ReportRange>('7d');
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        setError(null);

        apiRequest<DashboardData>(`/api/reports/summary?range=${range}`)
            .then(setData)
            .catch((err) => {
                if (!redirectOnUnauthorized(err, navigate)) {
                    setError(err instanceof Error ? err.message : 'Erro ao carregar dashboard.');
                }
            })
            .finally(() => setLoading(false));
    }, [navigate, range]);

    const resolutionRate = useMemo(() => {
        if (!data || data.metrics.totalTicketsOpened === 0) return 0;
        return Math.round((data.metrics.totalTicketsResolved / data.metrics.totalTicketsOpened) * 100);
    }, [data]);

    const handleLogout = () => {
        localStorage.removeItem('sigma-token');
        navigate('/login');
    };

    return (
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
            <SigmaSidebarIcon user={mockUser} onLogout={handleLogout} />
            <main className="flex-1 overflow-y-auto">
                <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 p-6 lg:p-10">
                    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Operação</p>
                            <h1 className="mt-2 text-3xl font-bold text-foreground">Dashboard</h1>
                            <p className="mt-2 max-w-2xl text-muted-foreground">Visão executiva de atendimento, chamados técnicos e satisfação.</p>
                        </div>

                        <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-surface p-1 shadow-card">
                            {ranges.map((item) => (
                                <button
                                    key={item.value}
                                    onClick={() => setRange(item.value)}
                                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors cursor-pointer ${range === item.value
                                        ? 'bg-primary text-white'
                                        : 'text-muted-foreground hover:bg-surface-alt hover:text-foreground'
                                        }`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-border bg-surface shadow-card">
                            <div className="size-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                        </div>
                    ) : error ? (
                        <div className="rounded-xl border border-danger/20 bg-danger-soft p-5 text-sm text-danger-fg">{error}</div>
                    ) : data ? (
                        <>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                                <Kpi title="Conversas" value={data.metrics.totalConversationsOpened} detail="Novas conversas abertas" icon="forum" tone="bg-primary/10 text-primary" />
                                <Kpi title="Mensagens" value={data.metrics.totalMessages} detail="Mensagens trafegadas" icon="chat" tone="bg-sky-500/10 text-sky-600" />
                                <Kpi title="Chamados" value={data.metrics.totalTicketsOpened} detail="Tickets criados" icon="confirmation_number" tone="bg-amber-500/10 text-amber-600" />
                                <Kpi title="Resolucao" value={`${resolutionRate}%`} detail={`${data.metrics.totalTicketsResolved} resolvidos`} icon="task_alt" tone="bg-emerald-500/10 text-emerald-600" />
                                <Kpi title="CSAT" value={data.metrics.csat?.average ? data.metrics.csat.average.toFixed(1) : '-'} detail={`${data.metrics.csat?.count || 0} avaliacao(oes)`} icon="sentiment_satisfied" tone="bg-violet-500/10 text-violet-600" />
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
