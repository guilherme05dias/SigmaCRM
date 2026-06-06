import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SigmaTopbar } from '../components/sigma/SigmaTopbar';
import { SigmaMetricCard } from '../components/sigma/SigmaMetricCard';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { Skeleton } from '../components/ui/Skeleton';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';
import { useAuth } from '../lib/auth';

interface MetricsData {
    range: string;
    startDate: string;
    endDate: string;
    metrics: {
        totalConversationsOpened: number;
        totalMessages: number;
        totalTicketsOpened: number;
        totalTicketsResolved: number;
        conversationsByDepartment: { department: string; count: number }[];
        ticketsByTechnician: { technician: string; count: number }[];
    };
}

export default function Reports() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [range, setRange] = useState('7d');
    const [data, setData] = useState<MetricsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const ranges = [
        { value: '1d', label: 'Hoje' },
        { value: '7d', label: '7 Dias' },
        { value: '15d', label: '15 Dias' },
        { value: '30d', label: '30 Dias' },
        { value: '60d', label: '60 Dias' },
        { value: '90d', label: '90 Dias' },
    ];

    const hasOperationalData = data
        ? data.metrics.totalConversationsOpened > 0
            || data.metrics.totalMessages > 0
            || data.metrics.totalTicketsOpened > 0
            || data.metrics.totalTicketsResolved > 0
            || data.metrics.conversationsByDepartment.length > 0
            || data.metrics.ticketsByTechnician.length > 0
        : false;

    useEffect(() => {
        setLoading(true);
        setError(null);
        apiRequest<MetricsData>(`/api/reports/summary?range=${range}`)
            .then(resData => {
                setData(resData);
            })
            .catch(err => {
                if (!redirectOnUnauthorized(err, navigate)) {
                    setError(err instanceof Error ? err.message : 'Erro ao carregar relatórios.');
                    setData(null);
                }
            })
            .finally(() => setLoading(false));
    }, [range, navigate]);

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground font-sans">
            <SigmaTopbar user={user} onLogout={logout} />

            <main className="flex-1 max-w-[1440px] mx-auto w-full p-6 lg:p-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight text-foreground font-display">Relatórios</h1>
                        <p className="text-muted-foreground mt-1">Acompanhe os principais indicadores de desempenho do seu time.</p>
                    </div>

                    <div className="flex bg-surface border border-border rounded-xl p-1 shadow-card">
                        {ranges.map(r => (
                            <button
                                type="button"
                                key={r.value}
                                onClick={() => setRange(r.value)}
                                aria-pressed={range === r.value}
                                className={`px-4 py-1.5 text-sm rounded-lg transition-all font-medium cursor-pointer ${range === r.value
                                        ? 'bg-primary text-white shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-surface-alt'
                                    }`}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col gap-8" aria-label="Carregando relatórios">
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                            {Array.from({ length: 4 }).map((_, index) => (
                                <Skeleton key={index} className="h-32" />
                            ))}
                        </div>
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            <Skeleton className="h-72" />
                            <Skeleton className="h-72" />
                        </div>
                    </div>
                ) : !data ? (
                    <EmptyState icon="error" title="Erro ao carregar relatórios" description={error || 'Erro ao carregar dados.'} />
                ) : !hasOperationalData ? (
                    <EmptyState
                        icon="dashboard"
                        title="Sem dados no período"
                        description="Ainda não há conversas, mensagens ou chamados para o intervalo selecionado."
                    />
                ) : (
                    <div className="flex flex-col gap-8">

                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <SigmaMetricCard title="Novas Conversas" value={data.metrics.totalConversationsOpened} icon="chat" colorClass="primary" />
                            <SigmaMetricCard title="Mensagens" value={data.metrics.totalMessages} icon="forum" colorClass="secondary" />
                            <SigmaMetricCard title="Chamados Abertos" value={data.metrics.totalTicketsOpened} icon="build" colorClass="amber-500" />
                            <SigmaMetricCard title="Chamados Resolvidos" value={data.metrics.totalTicketsResolved} icon="check_circle" colorClass="secondary" />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Breakdown by Department */}
                            <div className="bg-surface border border-border rounded-2xl overflow-hidden p-6 shadow-card">
                                <h3 className="text-lg font-bold mb-6 text-foreground font-display flex items-center gap-2">
                                    <Icon name="groups" className="size-5 text-primary" />
                                    Conversas por Departamento
                                </h3>
                                {data.metrics.conversationsByDepartment.length > 0 ? (
                                    <div className="flex flex-col gap-4">
                                        {data.metrics.conversationsByDepartment.map((item) => (
                                            <div key={item.department} className="flex items-center justify-between p-3 rounded-lg bg-surface-alt border border-border">
                                                <span className="text-sm text-muted-foreground font-medium">
                                                    {item.department}
                                                </span>
                                                <span className="font-mono text-foreground text-base font-bold bg-surface border border-border px-3 py-1 rounded-md">{item.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState
                                        icon="groups"
                                        title="Sem departamentos"
                                        description="Nenhuma conversa foi associada a departamento neste período."
                                    />
                                )}
                            </div>

                            {/* Breakdown by Technician */}
                            <div className="bg-surface border border-border rounded-2xl overflow-hidden p-6 shadow-card">
                                <h3 className="text-lg font-bold mb-6 text-foreground font-display flex items-center gap-2">
                                    <Icon name="engineering" className="size-5 text-primary" />
                                    Chamados por Técnico
                                </h3>
                                {data.metrics.ticketsByTechnician.length > 0 ? (
                                    <div className="flex flex-col gap-4">
                                        {data.metrics.ticketsByTechnician.map((item) => (
                                            <div key={item.technician} className="flex items-center justify-between p-3 rounded-lg bg-surface-alt border border-border">
                                                <div className="flex items-center gap-3 text-sm font-medium text-foreground">
                                                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs ring-1 ring-border">
                                                        {item.technician.charAt(0)}
                                                    </div>
                                                    {item.technician}
                                                </div>
                                                <span className="font-mono text-foreground text-base font-bold bg-surface border border-border px-3 py-1 rounded-md">{item.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState
                                        icon="engineering"
                                        title="Sem técnicos"
                                        description="Nenhum chamado foi associado a técnico neste período."
                                    />
                                )}
                            </div>
                        </div>

                    </div>
                )}
            </main>
        </div>
    );
}
