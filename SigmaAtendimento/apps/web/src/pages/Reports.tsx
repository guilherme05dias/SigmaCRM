import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type {
    AttendanceReportRow,
    CursorPage,
    ReportFilters,
    ReportsSummaryResponse,
    ReportType,
    TicketReportRow,
} from '@sigma/shared';
import { SigmaSidebarIcon } from '../components/sigma/SigmaSidebarIcon';
import { SigmaMetricCard } from '../components/sigma/SigmaMetricCard';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { Skeleton } from '../components/ui/Skeleton';
import { apiBlobRequest, apiRequest, redirectOnUnauthorized } from '../lib/api';
import { useAuth } from '../lib/auth';
import { currentMonthReportDates, rollingReportDates } from '../lib/reportPresets';

type Option = { id: string; name: string; role?: string; active?: boolean };

const attendanceStatusLabels: Record<string, string> = { OPEN: 'Na fila', ASSIGNED: 'Em atendimento', CLOSED: 'Encerrado' };
const ticketStatusLabels: Record<string, string> = {
    NEW: 'Novo', QUEUED: 'Na fila', IN_PROGRESS: 'Em andamento', WAITING_CUSTOMER: 'Aguardando cliente',
    WAITING_INTERNAL: 'Aguardando interno', SCHEDULED_FIELD_SERVICE: 'Agendado', RESOLVED: 'Resolvido',
    CLOSED: 'Fechado', CANCELED: 'Cancelado', PENDING: 'Pendente', SCHEDULED: 'Agendado', COMPLETED: 'Concluído',
};

function initialDates() {
    return currentMonthReportDates();
}

function formatDuration(seconds: number | null) {
    if (seconds === null) return '—';
    if (seconds < 60) return `${seconds}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours ? `${hours}h ${minutes}min` : `${minutes}min`;
}

function formatAverage(metric: { value: number | null; sampleSize: number }, suffix = '') {
    if (metric.value === null) return '—';
    return `${metric.value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${suffix}`;
}

function queryFor(filters: ReportFilters) {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
    return query;
}

function Breakdown({ title, values }: { title: string; values: Array<{ id: string | null; label: string; count: number }> }) {
    return (
        <section className="rounded-2xl border border-border bg-surface p-5">
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            {values.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">Sem dados no período.</p> : (
                <div className="mt-4 space-y-2">
                    {values.slice(0, 8).map((item) => (
                        <div key={item.id ?? item.label} className="flex items-center justify-between gap-3 rounded-lg bg-surface-alt px-3 py-2">
                            <span className="truncate text-sm text-foreground">{ticketStatusLabels[item.label] ?? item.label}</span>
                            <span className="font-mono text-sm font-semibold text-foreground">{item.count}</span>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

function CsatBreakdown({ values }: { values: ReportsSummaryResponse['attendance']['csatByAttendant'] }) {
    return (
        <section className="rounded-2xl border border-border bg-surface p-5">
            <h3 className="text-base font-semibold text-foreground">CSAT por atendente</h3>
            {values.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">Sem avaliações no período.</p> : (
                <div className="mt-4 space-y-2">
                    {values.slice(0, 8).map((item) => (
                        <div key={item.id ?? item.label} className="flex items-center justify-between gap-3 rounded-lg bg-surface-alt px-3 py-2">
                            <span className="truncate text-sm text-foreground">{item.label}</span>
                            <span className="font-mono text-sm font-semibold text-foreground">{item.average.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/10 <span className="font-sans text-xs font-normal text-muted-foreground">({item.count})</span></span>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

export default function Reports() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const canViewAll = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
    const isTechnician = user?.role === 'TECHNICIAN';
    const defaults = useMemo(initialDates, []);
    const [searchParams, setSearchParams] = useSearchParams();
    const filters = useMemo<ReportFilters>(() => ({
        from: searchParams.get('from') || defaults.from,
        to: searchParams.get('to') || defaults.to,
        type: (searchParams.get('type') as ReportType) || 'all',
        departmentId: searchParams.get('departmentId') || undefined,
        responsibleUserId: searchParams.get('responsibleUserId') || undefined,
        attendanceStatus: (searchParams.get('attendanceStatus') as ReportFilters['attendanceStatus']) || undefined,
        ticketStatus: searchParams.get('ticketStatus') || undefined,
        origin: (searchParams.get('origin') as ReportFilters['origin']) || undefined,
    }), [defaults, searchParams]);

    const [summary, setSummary] = useState<ReportsSummaryResponse | null>(null);
    const [attendances, setAttendances] = useState<AttendanceReportRow[]>([]);
    const [tickets, setTickets] = useState<TicketReportRow[]>([]);
    const [attendanceCursor, setAttendanceCursor] = useState<string | null>(null);
    const [ticketCursor, setTicketCursor] = useState<string | null>(null);
    const [departments, setDepartments] = useState<Option[]>([]);
    const [users, setUsers] = useState<Option[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [exporting, setExporting] = useState<'xlsx' | 'csv' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const updateFilters = useCallback((changes: Partial<ReportFilters>) => {
        const next = { ...filters, ...changes };
        if (changes.type === 'attendance') {
            next.ticketStatus = undefined;
            next.origin = undefined;
        } else if (changes.type === 'ticket') next.attendanceStatus = undefined;
        setSearchParams(queryFor(next), { replace: true });
    }, [filters, setSearchParams]);

    useEffect(() => {
        Promise.all([apiRequest<Option[]>('/api/departments'), apiRequest<Option[]>('/api/users')])
            .then(([departmentData, userData]) => {
                setDepartments(departmentData.filter((item: Option & { active?: boolean }) => item.active !== false));
                setUsers(userData.filter((item) => item.active !== false));
            })
            .catch((err) => { if (!redirectOnUnauthorized(err, navigate)) console.error(err); });
    }, [navigate]);

    useEffect(() => {
        let active = true;
        const query = queryFor(filters);
        setLoading(true);
        setError(null);
        const requests: Promise<unknown>[] = [apiRequest<ReportsSummaryResponse>(`/api/reports/summary?${query}`)];
        if (filters.type !== 'ticket') {
            const attendanceQuery = new URLSearchParams(query);
            attendanceQuery.set('type', 'attendance'); attendanceQuery.set('take', '25');
            requests.push(apiRequest<CursorPage<AttendanceReportRow>>(`/api/reports/records?${attendanceQuery}`));
        }
        if (filters.type !== 'attendance') {
            const ticketQuery = new URLSearchParams(query);
            ticketQuery.set('type', 'ticket'); ticketQuery.set('take', '25');
            requests.push(apiRequest<CursorPage<TicketReportRow>>(`/api/reports/records?${ticketQuery}`));
        }

        Promise.all(requests).then((responses) => {
            if (!active) return;
            setSummary(responses[0] as ReportsSummaryResponse);
            let index = 1;
            if (filters.type !== 'ticket') {
                const page = responses[index++] as CursorPage<AttendanceReportRow>;
                setAttendances(page.records); setAttendanceCursor(page.nextCursor);
            } else { setAttendances([]); setAttendanceCursor(null); }
            if (filters.type !== 'attendance') {
                const page = responses[index] as CursorPage<TicketReportRow>;
                setTickets(page.records); setTicketCursor(page.nextCursor);
            } else { setTickets([]); setTicketCursor(null); }
        }).catch((err) => {
            if (!active || redirectOnUnauthorized(err, navigate)) return;
            setError(err instanceof Error ? err.message : 'Erro ao carregar relatórios.');
            setSummary(null); setAttendances([]); setTickets([]);
        }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [filters, navigate]);

    const loadMore = async (type: 'attendance' | 'ticket') => {
        const cursor = type === 'attendance' ? attendanceCursor : ticketCursor;
        if (!cursor) return;
        setLoadingMore(true);
        try {
            const query = queryFor(filters);
            query.set('type', type);
            query.set('take', '25');
            query.set('cursor', cursor);
            if (type === 'attendance') {
                const page = await apiRequest<CursorPage<AttendanceReportRow>>(`/api/reports/records?${query}`);
                setAttendances((current) => [...current, ...page.records]); setAttendanceCursor(page.nextCursor);
            } else {
                const page = await apiRequest<CursorPage<TicketReportRow>>(`/api/reports/records?${query}`);
                setTickets((current) => [...current, ...page.records]); setTicketCursor(page.nextCursor);
            }
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) setError(err instanceof Error ? err.message : 'Erro ao carregar mais registros.');
        } finally { setLoadingMore(false); }
    };

    const exportReport = async (format: 'xlsx' | 'csv') => {
        setExporting(format);
        try {
            const blob = await apiBlobRequest(`/api/reports/export.${format}?${queryFor(filters)}`);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `relatorio-tecnico-${filters.type}-${filters.from}-a-${filters.to}.${format}`;
            document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) setError(err instanceof Error ? err.message : `Erro ao exportar ${format.toUpperCase()}.`);
        } finally { setExporting(null); }
    };

    const preset = (days?: number) => {
        updateFilters(days === undefined ? currentMonthReportDates() : rollingReportDates(days));
    };

    const cards = summary ? filters.type === 'attendance' ? [
        ['Iniciados', summary.attendance.initiated, 'chat', 'primary'],
        ['Encerrados', summary.attendance.closed, 'check_circle', 'emerald-500'],
        ['Espera média', formatDuration(summary.attendance.averageWaitSeconds.value), 'schedule', 'amber-500'],
        ['CSAT', formatAverage(summary.attendance.csat, '/10'), 'sentiment_satisfied', 'violet-500'],
    ] : filters.type === 'ticket' ? [
        ['Criados', summary.tickets.created, 'local_activity', 'primary'],
        ['Agendados', summary.tickets.scheduled, 'schedule', 'amber-500'],
        ['Concluídos', summary.tickets.completed, 'check_circle', 'emerald-500'],
        ['Duração média', formatDuration(summary.tickets.averageExecutionSeconds.value), 'engineering', 'violet-500'],
    ] : [
        ['Atendimentos', summary.attendance.initiated, 'chat', 'primary'],
        ['Resolvidos remotamente', summary.attendance.remotelyResolved, 'check_circle', 'emerald-500'],
        ['Chamados', summary.tickets.created, 'local_activity', 'amber-500'],
        ['Conversão', `${summary.attendance.conversionRate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`, 'swap_horiz', 'violet-500'],
    ] : [];

    return (
        <div className="flex min-h-screen bg-background text-foreground">
            <SigmaSidebarIcon user={user} onLogout={logout} />
            <main className="min-w-0 flex-1 pb-28 md:pb-8">
                <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))] md:gap-6 md:p-8">
                    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <h1 className="text-2xl font-bold sm:text-3xl">{isTechnician ? 'Meu desempenho' : 'Relatórios'}</h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {isTechnician ? 'Seus atendimentos e chamados no período selecionado.' : 'Indicadores históricos de Atendimentos no WhatsApp e Chamados técnicos.'}
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                            <Button variant="outline" className="px-3" onClick={() => exportReport('csv')} loading={exporting === 'csv'} disabled={loading || exporting !== null}>
                                Exportar CSV
                            </Button>
                            <Button className="px-3" onClick={() => exportReport('xlsx')} loading={exporting === 'xlsx'} disabled={loading || exporting !== null}>
                                <Icon name="bar_chart" className="size-4" /> Exportar Excel
                            </Button>
                        </div>
                    </header>

                    <section aria-label="Filtros do relatório" className="rounded-2xl border border-border bg-surface p-4">
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de relatório">
                            {([['all', 'Todos'], ['attendance', 'Atendimentos'], ['ticket', 'Chamados']] as const).map(([value, label]) => (
                                <Button key={value} variant={filters.type === value ? 'primary' : 'outline'} size="sm" onClick={() => updateFilters({ type: value })} aria-pressed={filters.type === value}>{label}</Button>
                            ))}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <Button variant="ghost" size="sm" onClick={() => preset(1)}>Hoje</Button>
                            <Button variant="ghost" size="sm" onClick={() => preset(7)}>7 dias</Button>
                            <Button variant="ghost" size="sm" onClick={() => preset(30)}>30 dias</Button>
                            <Button variant="ghost" size="sm" onClick={() => preset()}>Mês atual</Button>
                        </div>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <label className="text-sm font-medium">De<input type="date" value={filters.from} onChange={(event) => updateFilters({ from: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" /></label>
                            <label className="text-sm font-medium">Até<input type="date" value={filters.to} onChange={(event) => updateFilters({ to: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" /></label>
                            {!isTechnician && <label className="text-sm font-medium">Departamento<select value={filters.departmentId ?? ''} onChange={(event) => updateFilters({ departmentId: event.target.value || undefined })} className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"><option value="">Todos</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
                            {canViewAll && <label className="text-sm font-medium">Responsável<select value={filters.responsibleUserId ?? ''} onChange={(event) => updateFilters({ responsibleUserId: event.target.value || undefined })} className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"><option value="">Todos</option>{users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
                            {filters.type !== 'ticket' && <label className="text-sm font-medium">Status do Atendimento<select value={filters.attendanceStatus ?? ''} onChange={(event) => updateFilters({ attendanceStatus: (event.target.value || undefined) as ReportFilters['attendanceStatus'] })} className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3 text-foreground"><option value="">Todos</option>{Object.entries(attendanceStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
                            {filters.type !== 'attendance' && <label className="text-sm font-medium">Status do Chamado<select value={filters.ticketStatus ?? ''} onChange={(event) => updateFilters({ ticketStatus: event.target.value || undefined })} className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3 text-foreground"><option value="">Todos</option>{Object.entries(ticketStatusLabels).filter(([value]) => !['PENDING', 'SCHEDULED', 'COMPLETED'].includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
                            {filters.type !== 'attendance' && <label className="text-sm font-medium">Origem<select value={filters.origin ?? ''} onChange={(event) => updateFilters({ origin: (event.target.value || undefined) as ReportFilters['origin'] })} className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3 text-foreground"><option value="">Todas</option><option value="WHATSAPP">WhatsApp</option><option value="MANUAL">Manual</option></select></label>}
                        </div>
                    </section>

                    {error && <div role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger-fg">{error}</div>}
                    {loading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Carregando relatórios">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24" />)}</div> : summary && <>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([title, value, icon, tone]) => <SigmaMetricCard key={String(title)} title={String(title)} value={value as string | number} icon={icon as any} colorClass={tone as any} />)}</div>

                        <section className="overflow-hidden rounded-2xl border border-border bg-surface">
                            <div className="border-b border-border px-5 py-4">
                                <h2 className="text-lg font-semibold">{isTechnician ? 'Minha atividade' : 'Resumo por técnico'}</h2>
                                <p className="text-sm text-muted-foreground">{isTechnician ? 'Totais registrados no período selecionado.' : 'Atendimentos no WhatsApp e Chamados/visitas realizados por cada técnico no período.'}</p>
                            </div>
                            {summary.technicians.length === 0 ? <div className="p-5"><EmptyState icon="engineering" title="Sem atividade técnica" description="Nenhum técnico possui Atendimentos ou Chamados nos filtros selecionados." /></div> : (
                                isTechnician ? (
                                    <div className="grid grid-cols-3 divide-x divide-border p-4 text-center">
                                        <div><p className="text-xl font-bold text-foreground">{summary.technicians[0]?.attendanceCount ?? 0}</p><p className="mt-1 text-xs text-muted-foreground">Atendimentos</p></div>
                                        <div><p className="text-xl font-bold text-foreground">{summary.technicians[0]?.ticketCount ?? 0}</p><p className="mt-1 text-xs text-muted-foreground">Chamados</p></div>
                                        <div><p className="text-xl font-bold text-primary">{summary.technicians[0]?.totalCount ?? 0}</p><p className="mt-1 text-xs text-muted-foreground">Total</p></div>
                                    </div>
                                ) : <div className="overflow-x-auto">
                                    <table className="w-full min-w-[640px] text-left text-sm">
                                        <thead className="bg-surface-alt text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Técnico</th><th className="px-4 py-3">Atendimentos</th><th className="px-4 py-3">Chamados / Visitas</th><th className="px-4 py-3">Total</th>{canViewAll && <th className="px-4 py-3 text-right">Detalhes</th>}</tr></thead>
                                        <tbody className="divide-y divide-border">{summary.technicians.map((item) => <tr key={item.userId} className="hover:bg-surface-alt/60"><td className="px-4 py-3 font-semibold">{item.userName}</td><td className="px-4 py-3 font-mono">{item.attendanceCount}</td><td className="px-4 py-3 font-mono">{item.ticketCount}</td><td className="px-4 py-3 font-mono font-bold text-primary">{item.totalCount}</td>{canViewAll && <td className="px-4 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => updateFilters({ responsibleUserId: item.userId })}>Ver clientes</Button></td>}</tr>)}</tbody>
                                    </table>
                                </div>
                            )}
                        </section>

                        {filters.type !== 'ticket' && <section className="overflow-hidden rounded-2xl border border-border bg-surface">
                            <div className="border-b border-border px-5 py-4"><h2 className="text-lg font-semibold">Atendimentos</h2><p className="text-sm text-muted-foreground">{summary.attendance.messagesInbound} recebidas · {summary.attendance.messagesOutbound} enviadas · espera: {summary.attendance.averageWaitSeconds.sampleSize} registros · duração: {summary.attendance.averageHandleSeconds.sampleSize} registros</p></div>
                            <div className="divide-y divide-border md:hidden">
                                {attendances.map((item) => (
                                    <article key={item.id} className="p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-foreground">{item.contactName}</h3><p className="mt-1 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString('pt-BR')}</p></div>
                                            <Badge tone={item.status === 'CLOSED' ? 'success' : item.status === 'ASSIGNED' ? 'primary' : 'warning'}>{attendanceStatusLabels[item.status] ?? item.status}</Badge>
                                        </div>
                                        <p className="mt-3 text-sm text-foreground">{item.systemProduct ?? 'Sistema não informado'}</p>
                                        {item.observation && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{item.observation}</p>}
                                        <p className="mt-3 text-xs text-muted-foreground">Duração: {formatDuration(item.durationSeconds)}</p>
                                    </article>
                                ))}
                            </div>
                            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1280px] text-left text-sm"><thead className="bg-surface-alt text-xs uppercase tracking-wider text-muted-foreground"><tr>{['Cliente / Contato', 'Empresa', 'Técnico / Atendente', 'Data', 'Sistema / Produto', 'Observação', 'Departamento', 'Status', 'Duração', 'Avaliação'].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{attendances.map((item) => <tr key={item.id} className="align-top hover:bg-surface-alt/60"><td className="px-4 py-3 font-medium">{item.contactName}</td><td className="px-4 py-3 text-muted-foreground">{item.companyName ?? '—'}</td><td className="px-4 py-3">{item.attendantName ?? 'Não definido'}</td><td className="px-4 py-3 whitespace-nowrap">{new Date(item.createdAt).toLocaleString('pt-BR')}</td><td className="px-4 py-3">{item.systemProduct ?? 'Não definido'}</td><td className="max-w-sm whitespace-pre-wrap px-4 py-3 text-muted-foreground">{item.observation ?? '—'}</td><td className="px-4 py-3">{item.departmentName ?? '—'}</td><td className="px-4 py-3"><Badge tone={item.status === 'CLOSED' ? 'success' : item.status === 'ASSIGNED' ? 'primary' : 'warning'}>{attendanceStatusLabels[item.status] ?? item.status}</Badge></td><td className="px-4 py-3">{formatDuration(item.durationSeconds)}</td><td className="px-4 py-3">{item.rating === null ? '—' : `${item.rating}/10`}</td></tr>)}</tbody></table></div>
                            {attendances.length === 0 ? <div className="p-5"><EmptyState icon="chat" title="Nenhum Atendimento" description="Não há Atendimentos que correspondam aos filtros atuais." /></div> : attendanceCursor && <div className="border-t border-border p-4 text-center"><Button variant="outline" loading={loadingMore} onClick={() => loadMore('attendance')}>Carregar mais Atendimentos</Button></div>}
                        </section>}

                        {filters.type !== 'attendance' && <section className="overflow-hidden rounded-2xl border border-border bg-surface">
                            <div className="border-b border-border px-5 py-4"><h2 className="text-lg font-semibold">Chamados</h2><p className="text-sm text-muted-foreground">{summary.tickets.whatsappOrigin} via WhatsApp · {summary.tickets.manualOrigin} manuais · {summary.tickets.withoutTechnician} sem técnico · {summary.tickets.withoutSchedule} sem data · duração: {summary.tickets.averageExecutionSeconds.sampleSize} registros</p></div>
                            <div className="divide-y divide-border md:hidden">
                                {tickets.map((item) => (
                                    <article key={item.id} className="p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0"><p className="text-xs font-semibold text-primary">{item.protocol ?? item.id.slice(0, 8)}</p><h3 className="mt-1 truncate text-sm font-semibold text-foreground">{item.customerName}</h3></div>
                                            <Badge tone={item.status === 'CANCELED' ? 'danger' : item.status === 'CLOSED' || item.status === 'RESOLVED' ? 'success' : 'primary'}>{ticketStatusLabels[item.status] ?? item.status}</Badge>
                                        </div>
                                        <p className="mt-3 text-sm text-foreground">{item.systemProduct ?? 'Sistema não informado'}</p>
                                        {item.observation && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{item.observation}</p>}
                                        <div className="mt-3 flex justify-between gap-3 text-xs text-muted-foreground"><span>{new Date(item.reportDate).toLocaleDateString('pt-BR')}</span><span>{formatDuration(item.durationSeconds)}</span></div>
                                    </article>
                                ))}
                            </div>
                            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1200px] text-left text-sm"><thead className="bg-surface-alt text-xs uppercase tracking-wider text-muted-foreground"><tr>{['Protocolo', 'Cliente', 'Origem', 'Técnico', 'Data', 'Sistema / Produto', 'Observação', 'Departamento', 'Status', 'Duração'].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{tickets.map((item) => <tr key={item.id} className="align-top hover:bg-surface-alt/60"><td className="px-4 py-3 font-medium">{item.protocol ?? item.id.slice(0, 8)}</td><td className="px-4 py-3">{item.customerName}</td><td className="px-4 py-3">{item.origin === 'WHATSAPP' ? 'WhatsApp' : 'Manual'}</td><td className="px-4 py-3">{item.technicianName ?? 'Não definido'}</td><td className="px-4 py-3 whitespace-nowrap">{new Date(item.reportDate).toLocaleString('pt-BR')}</td><td className="px-4 py-3">{item.systemProduct ?? 'Não definido'}</td><td className="max-w-sm whitespace-pre-wrap px-4 py-3 text-muted-foreground">{item.observation ?? '—'}</td><td className="px-4 py-3">{item.departmentName ?? '—'}</td><td className="px-4 py-3"><Badge tone={item.status === 'CANCELED' ? 'danger' : item.status === 'CLOSED' || item.status === 'RESOLVED' ? 'success' : 'primary'}>{ticketStatusLabels[item.status] ?? item.status}</Badge></td><td className="px-4 py-3">{formatDuration(item.durationSeconds)}</td></tr>)}</tbody></table></div>
                            {tickets.length === 0 ? <div className="p-5"><EmptyState icon="local_activity" title="Nenhum Chamado" description="Não há Chamados que correspondam aos filtros atuais." /></div> : ticketCursor && <div className="border-t border-border p-4 text-center"><Button variant="outline" loading={loadingMore} onClick={() => loadMore('ticket')}>Carregar mais Chamados</Button></div>}
                        </section>}

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {filters.type !== 'ticket' && <><Breakdown title="Atendimentos por atendente" values={summary.attendance.byAttendant} /><Breakdown title="Atendimentos por departamento" values={summary.attendance.byDepartment} /><Breakdown title="Atendimentos por assunto" values={summary.attendance.byTopic} /><CsatBreakdown values={summary.attendance.csatByAttendant} /></>}
                            {filters.type !== 'attendance' && <><Breakdown title="Chamados por técnico" values={summary.tickets.byTechnician} /><Breakdown title="Chamados por status" values={summary.tickets.byStatus} /><Breakdown title="Chamados por departamento" values={summary.tickets.byDepartment} /></>}
                        </div>
                    </>}
                </div>
            </main>
        </div>
    );
}
