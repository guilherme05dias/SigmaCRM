import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SigmaTopbar } from '../components/sigma/SigmaTopbar';
import { SigmaMetricCard } from '../components/sigma/SigmaMetricCard';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { Skeleton } from '../components/ui/Skeleton';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';
import { useAuth } from '../lib/auth';
import { contactDisplayName } from '../components/inbox/contactDisplayName';

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
        csat: { average: number | null; count: number };
        attendantRatings: {
            userId: string;
            userName: string;
            average: number;
            count: number;
        }[];
    };
}

interface ConversationReportRecord {
    id: string;
    customerName: string;
    businessName: string | null;
    businessCnpj: string | null;
    systemName: string;
    summary: string;
    rating: number | null;
    observation: string | null;
    closedAt: string;
}

function formatRating(value: number | null) {
    if (value === null) return '—';
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatCnpj(value: string | null) {
    if (!value) return null;
    return value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export default function Reports() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [data, setData] = useState<MetricsData | null>(null);
    const [records, setRecords] = useState<ConversationReportRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const hasOperationalData = data
        ? data.metrics.totalConversationsOpened > 0
            || data.metrics.totalMessages > 0
            || data.metrics.totalTicketsOpened > 0
            || data.metrics.totalTicketsResolved > 0
            || data.metrics.conversationsByDepartment.length > 0
            || data.metrics.ticketsByTechnician.length > 0
            || data.metrics.attendantRatings.length > 0
            || records.length > 0
        : false;

    useEffect(() => {
        setLoading(true);
        setError(null);
        Promise.all([
            apiRequest<MetricsData>('/api/reports/summary'),
            apiRequest<{ records: ConversationReportRecord[] }>('/api/reports/records'),
        ])
            .then(([resData, recordsData]) => {
                setData(resData);
                setRecords(recordsData.records);
            })
            .catch(err => {
                if (!redirectOnUnauthorized(err, navigate)) {
                    setError(err instanceof Error ? err.message : 'Erro ao carregar relatórios.');
                    setData(null);
                    setRecords([]);
                }
            })
            .finally(() => setLoading(false));
    }, [navigate]);

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground font-sans">
            <SigmaTopbar user={user} onLogout={logout} />

            <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 pb-24 sm:p-6 sm:pb-24 md:pb-6 lg:p-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight text-foreground font-display">Relatórios</h1>
                        <p className="text-muted-foreground mt-1">Acompanhe os principais indicadores de desempenho do seu time.</p>
                    </div>

                    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Icon name="schedule" className="size-5" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Período do relatório</p>
                            <p className="text-sm font-semibold text-foreground">Desde 14/07/2026 às 08:00</p>
                        </div>
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
                        title="Sem dados desde o início"
                        description="Ainda não há conversas, mensagens ou chamados registrados desde 14/07/2026 às 08:00."
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

                        <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
                            <div className="border-b border-border px-5 py-4 sm:px-6">
                                <h2 className="flex items-center gap-2 text-lg font-bold text-foreground font-display">
                                    <Icon name="bar_chart" className="size-5 text-primary" />
                                    Relatórios de atendimento
                                </h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Registros mínimos preservados após a remoção das conversas.
                                </p>
                            </div>

                            {records.length === 0 ? (
                                <div className="p-6">
                                    <EmptyState
                                        icon="bar_chart"
                                        title="Nenhum relatório finalizado"
                                        description="Os registros aparecerão aqui depois que um atendimento for encerrado."
                                    />
                                </div>
                            ) : (
                                <>
                                    <div className="divide-y divide-border md:hidden">
                                        {records.map((record) => (
                                            <article key={record.id} className="space-y-3 px-5 py-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <h3 className="truncate text-sm font-semibold text-foreground">
                                                            {contactDisplayName({ name: record.customerName }, record.businessName)}
                                                        </h3>
                                                        <p className="text-xs text-muted-foreground">
                                                            {record.businessName || 'Sem empresa'}
                                                            {record.businessCnpj ? ` · ${formatCnpj(record.businessCnpj)}` : ''}
                                                        </p>
                                                    </div>
                                                    <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                                                        {record.rating === null ? 'Sem nota' : `${record.rating}/10`}
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{record.systemName}</p>
                                                    <p className="mt-1 text-sm text-foreground">{record.summary}</p>
                                                </div>
                                                {record.observation && <p className="text-sm text-muted-foreground">Obs.: {record.observation}</p>}
                                                <time className="block text-xs text-muted-foreground" dateTime={record.closedAt}>
                                                    {new Date(record.closedAt).toLocaleString('pt-BR')}
                                                </time>
                                            </article>
                                        ))}
                                    </div>

                                    <div className="hidden overflow-x-auto md:block">
                                        <table className="w-full min-w-[980px] text-left text-sm">
                                            <thead className="bg-surface-alt text-xs uppercase tracking-wider text-muted-foreground">
                                                <tr>
                                                    <th className="px-5 py-3 font-semibold">Nome</th>
                                                    <th className="px-5 py-3 font-semibold">Empresa / CNPJ</th>
                                                    <th className="px-5 py-3 font-semibold">Sistema</th>
                                                    <th className="px-5 py-3 font-semibold">Relatório</th>
                                                    <th className="px-5 py-3 font-semibold">Avaliação</th>
                                                    <th className="px-5 py-3 font-semibold">Observação</th>
                                                    <th className="px-5 py-3 font-semibold">Encerrado em</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {records.map((record) => (
                                                    <tr key={record.id} className="align-top transition-colors hover:bg-surface-alt/60">
                                                        <td className="px-5 py-4 font-semibold text-foreground">
                                                            {contactDisplayName({ name: record.customerName }, record.businessName)}
                                                        </td>
                                                        <td className="px-5 py-4 text-muted-foreground">
                                                            <span className="block text-foreground">{record.businessName || 'Sem empresa'}</span>
                                                            {record.businessCnpj && <span className="text-xs">{formatCnpj(record.businessCnpj)}</span>}
                                                        </td>
                                                        <td className="px-5 py-4 text-foreground">{record.systemName}</td>
                                                        <td className="max-w-xs px-5 py-4 text-foreground">{record.summary}</td>
                                                        <td className="px-5 py-4 font-mono font-bold text-foreground">
                                                            {record.rating === null ? '—' : `${record.rating}/10`}
                                                        </td>
                                                        <td className="max-w-xs px-5 py-4 text-muted-foreground">{record.observation || '—'}</td>
                                                        <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
                                                            {new Date(record.closedAt).toLocaleString('pt-BR')}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </section>

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

                        <section className="overflow-hidden rounded-2xl border border-border bg-surface">
                            <div className="flex flex-col gap-3 border-b border-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h3 className="flex items-center gap-2 text-lg font-bold text-foreground font-display">
                                        <Icon name="sentiment_satisfied" className="size-5 text-primary" />
                                        Avaliação por atendente
                                    </h3>
                                    <p className="mt-1 text-sm text-muted-foreground">Média das notas de 1 a 10 recebidas após o encerramento no WhatsApp.</p>
                                </div>
                                {data.metrics.csat.count > 0 && (
                                    <div className="shrink-0 rounded-lg bg-surface-alt px-3 py-2 text-right">
                                        <p className="text-xs text-muted-foreground">Média geral</p>
                                        <p className="font-mono text-lg font-bold text-foreground">
                                            {formatRating(data.metrics.csat.average)}<span className="text-sm font-medium text-muted-foreground">/10</span>
                                        </p>
                                    </div>
                                )}
                            </div>

                            {data.metrics.attendantRatings.length > 0 ? (
                                <div className="divide-y divide-border">
                                    {data.metrics.attendantRatings.map((item) => (
                                        <div key={item.userId} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center">
                                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                                                    {item.userName.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-foreground">{item.userName}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {item.count} {item.count === 1 ? 'avaliação' : 'avaliações'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex w-full items-center gap-3 sm:w-72">
                                                <div
                                                    className="h-2 flex-1 overflow-hidden rounded-full bg-surface-alt"
                                                    role="progressbar"
                                                    aria-label={`Média de ${item.userName}`}
                                                    aria-valuemin={0}
                                                    aria-valuemax={10}
                                                    aria-valuenow={Number(item.average.toFixed(1))}
                                                >
                                                    <div className="h-full rounded-full bg-primary-solid" style={{ width: `${Math.max(0, Math.min(item.average * 10, 100))}%` }} />
                                                </div>
                                                <p className="w-16 text-right font-mono text-base font-bold text-foreground">
                                                    {formatRating(item.average)}<span className="text-xs font-medium text-muted-foreground">/10</span>
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-6">
                                    <EmptyState
                                        icon="sentiment_satisfied"
                                        title="Sem avaliações no período"
                                        description="As médias aparecerão quando os clientes responderem à pesquisa enviada após o atendimento."
                                    />
                                </div>
                            )}
                        </section>

                    </div>
                )}
            </main>
        </div>
    );
}
