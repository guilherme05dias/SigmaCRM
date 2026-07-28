import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SigmaSidebarIcon } from '../components/sigma/SigmaSidebarIcon';
import { Badge, PriorityBadge, StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { Skeleton } from '../components/ui/Skeleton';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';
import { useAuth } from '../lib/auth';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'WAITING' | 'COMPLETED' | 'DISMISSED';
type AssistantAgentId = 'REPORT_ANALYST' | 'UNIPLUS_SPECIALIST' | 'SECULLUM_SPECIALIST' | 'GENERAL_TASKS' | 'FOLLOWUP_MASCOT';

interface AssistantAgent {
    id: AssistantAgentId;
    name: string;
    shortName: string;
    description: string;
    capabilities: string[];
}

interface AssistantStatus {
    enabled: boolean;
    model: string;
    provider: 'ollama';
    localOnly: true;
    mode: 'internal_analysis_only';
    canSendCustomerMessages: false;
    agents: AssistantAgent[];
}

interface AssistantConnection {
    ok: true;
    model: string;
    provider: 'ollama';
    localOnly: true;
    latencyMs: number;
    usedSyntheticData: true;
    canSendCustomerMessages: false;
}

interface TicketContext {
    id: string;
    protocol?: string | null;
    title?: string | null;
    priority?: string;
    status?: string;
    dueAt?: string | null;
}

interface AssistantAnalysis {
    id: string;
    model: string;
    summary: string;
    createdAt: string;
    result: {
        agent?: AssistantAgent;
        analysisMode?: 'LOCAL_MODEL' | 'LOCAL_RULES';
        summary: string;
        keyRisks: string[];
        prioritizedTickets: Array<{
            ticketId: string;
            rank: number;
            reason: string;
            recommendedAction: string;
        }>;
        taskSuggestions: Array<{
            suggestionId: string;
            title: string;
            description: string;
            priority: Priority;
            dueInDays: number;
            ticketId: string | null;
        }>;
        conversationStats?: {
            periodDays: number;
            conversations: number;
            activeContacts: number;
            inboundMessages: number;
            sampledConversations: number;
        };
        topCustomers?: Array<{
            contactId: string;
            name: string;
            conversationCount: number;
            inboundMessageCount: number;
            lastContactAt: string | null;
        }>;
        mainProblems?: Array<{
            label: string;
            description: string;
            conversationCount: number;
        }>;
    };
    sourceTickets?: TicketContext[];
}

interface AssistantTask {
    id: string;
    title: string;
    description?: string | null;
    priority: Priority;
    status: TaskStatus;
    source: 'MANUAL' | 'AI' | 'CONVERSATION' | 'TICKET' | 'VISIT';
    dueAt?: string | null;
    createdAt: string;
    assignedUser?: { id: string; name: string } | null;
    ticket?: { id: string; protocol?: string | null; title: string } | null;
}

const taskSourceLabels: Record<AssistantTask['source'], string> = {
    MANUAL: 'Manual',
    AI: 'Sugestão aceita',
    CONVERSATION: 'Conversa',
    TICKET: 'Chamado',
    VISIT: 'Visita',
};

function formatDateTime(value?: string | null) {
    if (!value) return 'Sem prazo';
    return new Date(value).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

function displayCustomerName(value: string) {
    const trimmed = value.trim();
    const digits = trimmed.replace(/\D/g, '');
    const looksLikePhone = digits.length >= 8 && digits.length >= trimmed.replace(/\s/g, '').length * 0.7;
    return looksLikePhone ? `Contato final ${digits.slice(-4)}` : trimmed;
}

function suggestionDueDate(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(17, 0, 0, 0);
    return date.toISOString();
}

const agentIcon = {
    REPORT_ANALYST: 'bar_chart',
    UNIPLUS_SPECIALIST: 'local_activity',
    SECULLUM_SPECIALIST: 'schedule',
    GENERAL_TASKS: 'task_alt',
    FOLLOWUP_MASCOT: 'notifications',
} as const;

export default function Assistant() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const canAnalyze = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
    const [status, setStatus] = useState<AssistantStatus | null>(null);
    const [analysis, setAnalysis] = useState<AssistantAnalysis | null>(null);
    const [tasks, setTasks] = useState<AssistantTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    const [analysisPeriodDays, setAnalysisPeriodDays] = useState(30);
    const [showAnalysisConfirmation, setShowAnalysisConfirmation] = useState(false);
    const [analysisConsent, setAnalysisConsent] = useState(false);
    const [testingConnection, setTestingConnection] = useState(false);
    const [connection, setConnection] = useState<AssistantConnection | null>(null);
    const [connectionError, setConnectionError] = useState('');
    const [error, setError] = useState('');
    const [savingSuggestion, setSavingSuggestion] = useState<string | null>(null);
    const [acceptedSuggestions, setAcceptedSuggestions] = useState<Set<string>>(new Set());
    const [taskTitle, setTaskTitle] = useState('');
    const [taskPriority, setTaskPriority] = useState<Priority>('MEDIUM');
    const [taskDueDate, setTaskDueDate] = useState('');
    const [creatingTask, setCreatingTask] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [statusResponse, taskResponse, analysisResponse] = await Promise.all([
                apiRequest<AssistantStatus>('/api/assistant/status'),
                apiRequest<{ tasks: AssistantTask[] }>('/api/assistant/tasks'),
                canAnalyze
                    ? apiRequest<{ analysis: AssistantAnalysis | null }>('/api/assistant/analyses/latest')
                    : Promise.resolve({ analysis: null }),
            ]);
            setStatus(statusResponse);
            setTasks(taskResponse.tasks);
            setAnalysis(analysisResponse.analysis);
        } catch (requestError) {
            if (!redirectOnUnauthorized(requestError, navigate)) {
                setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar o assistente.');
            }
        } finally {
            setLoading(false);
        }
    }, [canAnalyze, navigate]);

    useEffect(() => { void loadData(); }, [loadData]);

    const ticketById = useMemo(() => new Map(
        (analysis?.sourceTickets || []).map((ticket) => [ticket.id, ticket]),
    ), [analysis]);

    const pendingTasks = tasks.filter((task) => ['PENDING', 'IN_PROGRESS', 'WAITING'].includes(task.status));
    const completedTasks = tasks.filter((task) => task.status === 'COMPLETED');
    const topCustomers = analysis?.result.topCustomers || [];
    const mainProblems = analysis?.result.mainProblems || [];

    const analyze = async () => {
        if (!analysisConsent) return;
        setShowAnalysisConfirmation(false);
        setAnalysisConsent(false);
        setAnalyzing(true);
        setError('');
        try {
            const response = await apiRequest<{ analysis: AssistantAnalysis }>('/api/assistant/analyze', {
                method: 'POST',
                body: JSON.stringify({
                    periodDays: analysisPeriodDays,
                    limit: 15,
                    confirmMinimizedDataProcessing: true,
                }),
            });
            setAnalysis(response.analysis);
            setAcceptedSuggestions(new Set());
        } catch (requestError) {
            if (!redirectOnUnauthorized(requestError, navigate)) {
                setError(requestError instanceof Error ? requestError.message : 'Não foi possível gerar a análise.');
            }
        } finally {
            setAnalyzing(false);
        }
    };

    const requestAnalysisConfirmation = () => {
        setAnalysisConsent(false);
        setShowAnalysisConfirmation(true);
    };

    const testConnection = async () => {
        setTestingConnection(true);
        setConnection(null);
        setConnectionError('');
        try {
            const response = await apiRequest<{ connection: AssistantConnection }>('/api/assistant/connection-test', {
                method: 'POST',
            });
            setConnection(response.connection);
        } catch (requestError) {
            if (!redirectOnUnauthorized(requestError, navigate)) {
                setConnectionError(requestError instanceof Error ? requestError.message : 'Não foi possível testar a conexão com o Ollama local.');
            }
        } finally {
            setTestingConnection(false);
        }
    };

    const createTask = async (payload: Record<string, unknown>) => {
        const response = await apiRequest<{ task: AssistantTask }>('/api/assistant/tasks', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        setTasks((current) => [response.task, ...current]);
        return response.task;
    };

    const acceptSuggestion = async (suggestion: AssistantAnalysis['result']['taskSuggestions'][number]) => {
        if (!analysis) return;
        setSavingSuggestion(suggestion.suggestionId);
        setError('');
        try {
            await createTask({
                title: suggestion.title,
                description: suggestion.description,
                priority: suggestion.priority,
                dueAt: suggestionDueDate(suggestion.dueInDays),
                assignedUserId: user?.id,
                ticketId: suggestion.ticketId,
                analysisId: analysis.id,
            });
            setAcceptedSuggestions((current) => new Set(current).add(suggestion.suggestionId));
        } catch (requestError) {
            if (!redirectOnUnauthorized(requestError, navigate)) {
                setError(requestError instanceof Error ? requestError.message : 'Não foi possível criar a tarefa sugerida.');
            }
        } finally {
            setSavingSuggestion(null);
        }
    };

    const submitManualTask = async (event: FormEvent) => {
        event.preventDefault();
        if (!taskTitle.trim()) return;
        setCreatingTask(true);
        setError('');
        try {
            await createTask({
                title: taskTitle.trim(),
                priority: taskPriority,
                dueAt: taskDueDate ? new Date(`${taskDueDate}T17:00:00`).toISOString() : null,
                assignedUserId: user?.id,
            });
            setTaskTitle('');
            setTaskPriority('MEDIUM');
            setTaskDueDate('');
        } catch (requestError) {
            if (!redirectOnUnauthorized(requestError, navigate)) {
                setError(requestError instanceof Error ? requestError.message : 'Não foi possível criar a tarefa.');
            }
        } finally {
            setCreatingTask(false);
        }
    };

    const updateTaskStatus = async (task: AssistantTask, nextStatus: TaskStatus) => {
        setError('');
        try {
            const response = await apiRequest<{ task: AssistantTask }>(`/api/assistant/tasks/${task.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: nextStatus }),
            });
            setTasks((current) => current.map((item) => item.id === task.id ? response.task : item));
        } catch (requestError) {
            if (!redirectOnUnauthorized(requestError, navigate)) {
                setError(requestError instanceof Error ? requestError.message : 'Não foi possível atualizar a tarefa.');
            }
        }
    };

    return (
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
            <SigmaSidebarIcon user={user} onLogout={logout} />
            <main className="min-w-0 flex-1 overflow-y-auto pb-[88px] md:pb-0">
                <div className="mx-auto box-border flex w-full max-w-[1440px] flex-col gap-6 p-4 sm:p-6 lg:p-10">
                    <header className="flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Assistente operacional</h1>
                                <Badge tone="primary" dot>Somente interno</Badge>
                            </div>
                            <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">
                                Analisa conversas, identifica clientes recorrentes, prioriza chamados e organiza lembretes. O assistente não envia respostas para clientes.
                            </p>
                        </div>
                        {canAnalyze && (
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <label className="sr-only" htmlFor="assistant-period">Período da análise</label>
                                <select
                                    id="assistant-period"
                                    value={analysisPeriodDays}
                                    onChange={(event) => setAnalysisPeriodDays(Number(event.target.value))}
                                    className="h-11 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground focus:border-primary focus:ring-2 focus:ring-primary/30"
                                >
                                    <option value={7}>Últimos 7 dias</option>
                                    <option value={30}>Últimos 30 dias</option>
                                    <option value={90}>Últimos 90 dias</option>
                                </select>
                                <Button type="button" variant="outline" onClick={testConnection} loading={testingConnection} disabled={!status?.enabled || loading}>
                                    <Icon name="verified_user" className="size-4" />
                                    Testar conexão
                                </Button>
                                <Button type="button" onClick={requestAnalysisConfirmation} loading={analyzing} disabled={!status?.enabled || loading}>
                                    <Icon name="auto_awesome" className="size-4" />
                                    Analisar operação
                                </Button>
                            </div>
                        )}
                    </header>

                    {showAnalysisConfirmation && (
                        <section id="assistant-analysis-consent" aria-labelledby="assistant-analysis-consent-title" className="rounded-xl border border-border bg-surface px-5 py-4">
                            <div className="flex items-start gap-3">
                                <Icon name="verified_user" className="mt-0.5 size-5 shrink-0 text-primary" />
                                <div className="min-w-0 flex-1">
                                    <h2 id="assistant-analysis-consent-title" className="font-semibold text-foreground">Confirmar análise interna</h2>
                                    <p className="mt-1 max-w-[75ch] text-sm leading-6 text-muted-foreground">
                                        O ranking de clientes é calculado pelo próprio Sigma. Para identificar problemas recorrentes, o Ollama processará localmente assuntos, resumos de encerramento e pequenos trechos de mensagens recebidas, após remover telefones, e-mails e documentos. Nomes, contatos, mídias, protocolos e IDs reais não são enviados ao modelo.
                                    </p>
                                    <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-foreground">
                                        <input
                                            type="checkbox"
                                            checked={analysisConsent}
                                            onChange={(event) => setAnalysisConsent(event.target.checked)}
                                            className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary/30"
                                        />
                                        <span>Li e autorizo o processamento local desses dados minimizados nesta análise.</span>
                                    </label>
                                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                                        <Button type="button" variant="outline" size="sm" onClick={() => { setShowAnalysisConfirmation(false); setAnalysisConsent(false); }}>
                                            Cancelar
                                        </Button>
                                        <Button type="button" size="sm" onClick={analyze} disabled={!analysisConsent}>
                                            <Icon name="auto_awesome" className="size-4" />
                                            Confirmar e analisar
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}

                    {connection && (
                        <div role="status" className="flex items-center gap-3 rounded-xl bg-success-soft px-4 py-3 text-sm text-success-fg">
                            <Icon name="verified_user" className="size-5 shrink-0" />
                            <span>Conexão verificada com dados fictícios · {connection.model} · {connection.latencyMs} ms</span>
                        </div>
                    )}

                    {connectionError && (
                        <div role="alert" className="flex items-start gap-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-fg">
                            <Icon name="error" className="mt-0.5 size-5 shrink-0" />
                            <span className="flex-1">{connectionError}</span>
                            <button type="button" onClick={() => setConnectionError('')} className="rounded-lg p-2 hover:bg-danger/10" aria-label="Fechar aviso do teste">
                                <Icon name="close" className="size-4" />
                            </button>
                        </div>
                    )}

                    {error && (
                        <div role="alert" className="flex items-start gap-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-fg">
                            <Icon name="error" className="mt-0.5 size-5" />
                            <span className="flex-1">{error}</span>
                            <button type="button" onClick={() => setError('')} className="rounded-lg p-2 hover:bg-danger/10" aria-label="Fechar aviso">
                                <Icon name="close" className="size-4" />
                            </button>
                        </div>
                    )}

                    {loading ? (
                        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.75fr)]" aria-label="Carregando assistente">
                            <Skeleton className="h-[540px]" />
                            <Skeleton className="h-[540px]" />
                        </div>
                    ) : (
                        <>
                            {!status?.enabled && (
                                <section className="flex flex-col gap-3 rounded-xl bg-warning-soft px-5 py-4 text-warning-fg 2xl:flex-row 2xl:items-center">
                                    <Icon name="info" className="size-5 shrink-0" />
                                    <div className="flex-1">
                                        <p className="font-semibold">Análise local por IA ainda não ativada</p>
                                        <p className="mt-1 text-sm">As tarefas e lembretes já funcionam. Para gerar análises, inicie o Ollama local e ative o assistente no servidor.</p>
                                    </div>
                                    <Badge tone="warning">Modelo: {status?.model || 'não definido'}</Badge>
                                </section>
                            )}

                            {Boolean(status?.agents?.length) && (
                                <section className="overflow-hidden rounded-xl border border-border bg-surface" aria-labelledby="assistant-agents-title">
                                    <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <h2 id="assistant-agents-title" className="text-lg font-bold text-foreground">Equipe de agentes</h2>
                                            <p className="mt-1 text-sm text-muted-foreground">O Sigma escolhe automaticamente o especialista conforme o tipo da análise ou da tarefa.</p>
                                        </div>
                                        <Badge tone="primary" dot>{status?.agents.length} agentes locais</Badge>
                                    </div>
                                    <div className="divide-y divide-border md:grid md:grid-cols-2 md:divide-x md:divide-y-0">
                                        {status?.agents.map((agent) => (
                                            <article
                                                key={agent.id}
                                                className={`flex gap-3 px-5 py-4 md:[&:nth-child(n+3)]:border-t md:[&:nth-child(odd)]:border-r-0 ${
                                                    agent.id === 'FOLLOWUP_MASCOT' ? 'bg-surface-alt/40 md:col-span-2' : ''
                                                }`}
                                            >
                                                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                                    <Icon name={agentIcon[agent.id]} className="size-5" />
                                                </span>
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h3 className="font-semibold text-foreground">{agent.name}</h3>
                                                        <Badge tone="success" dot>Ativo</Badge>
                                                    </div>
                                                    <p className="mt-1 max-w-[65ch] text-sm leading-6 text-muted-foreground">{agent.description}</p>
                                                    <p className="mt-2 text-xs font-medium text-foreground">{agent.capabilities.join(' · ')}</p>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                </section>
                            )}

                            <details className="rounded-xl border border-border bg-surface">
                                <summary className="flex min-h-11 cursor-pointer items-center gap-3 px-5 py-3 text-sm font-semibold text-foreground">
                                    <Icon name="verified_user" className="size-5 shrink-0 text-primary" />
                                    Quais dados são processados na análise local?
                                </summary>
                                <div className="grid gap-4 border-t border-border px-5 py-4 text-sm text-muted-foreground md:grid-cols-2">
                                    <div>
                                        <p className="font-semibold text-foreground">Processados localmente</p>
                                        <p className="mt-1 leading-6">Metadados dos chamados, assuntos, resumos e até dois pequenos trechos de mensagens recebidas por conversa, com telefone, e-mail e documentos removidos.</p>
                                    </div>
                                    <div>
                                        <p className="font-semibold text-foreground">Nunca processados pelo modelo</p>
                                        <p className="mt-1 leading-6">Nomes de clientes, telefones, e-mails, documentos, mídias, anexos, protocolos, IDs reais ou mensagens enviadas pela equipe.</p>
                                    </div>
                                </div>
                            </details>

                            <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.75fr)]">
                                <section className="overflow-hidden rounded-xl border border-border bg-surface">
                                    <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                                <Icon name="assistant" className="size-5" />
                                            </div>
                                            <div>
                                                <h2 className="text-lg font-bold text-foreground">Principais chamados</h2>
                                                <p className="text-sm text-muted-foreground">Leitura operacional dos últimos {analysis?.result.conversationStats?.periodDays || analysisPeriodDays} dias</p>
                                            </div>
                                        </div>
                                        {analysis && (
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Badge tone={analysis.result.analysisMode === 'LOCAL_RULES' ? 'info' : 'primary'} dot>
                                                    {analysis.result.agent?.shortName || 'Analista de relatórios'}
                                                </Badge>
                                                <span className="text-xs text-muted-foreground">Atualizada em {formatDateTime(analysis.createdAt)}</span>
                                            </div>
                                        )}
                                    </div>

                                    {!canAnalyze ? (
                                        <EmptyState icon="verified_user" title="Análise restrita à supervisão" description="Suas tarefas e lembretes continuam disponíveis ao lado." />
                                    ) : !analysis ? (
                                        <div className="p-5">
                                            <EmptyState
                                                icon="assistant"
                                                title="Nenhuma análise gerada"
                                                description={status?.enabled ? 'Gere a primeira leitura dos chamados, conversas e problemas mais recorrentes.' : 'Inicie o Ollama local para habilitar as análises.'}
                                                actionLabel={status?.enabled ? 'Analisar operação' : undefined}
                                                onAction={status?.enabled ? requestAnalysisConfirmation : undefined}
                                            />
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="border-b border-border bg-surface-alt px-5 py-4">
                                                <p className="max-w-[75ch] text-sm leading-6 text-foreground">{analysis.result.summary}</p>
                                            </div>

                                            {analysis.result.keyRisks.length > 0 && (
                                                <div className="border-b border-border px-5 py-4">
                                                    <h3 className="text-sm font-bold text-foreground">Pontos de atenção</h3>
                                                    <ul className="mt-3 space-y-2">
                                                        {analysis.result.keyRisks.map((risk, index) => (
                                                            <li key={`${risk}-${index}`} className="flex gap-3 text-sm text-muted-foreground">
                                                                <Icon name="error" className="mt-0.5 size-4 shrink-0 text-warning" />
                                                                <span>{risk}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            <div className="divide-y divide-border">
                                                {analysis.result.prioritizedTickets.map((item) => {
                                                    const ticket = ticketById.get(item.ticketId);
                                                    return (
                                                        <article key={item.ticketId} className="px-5 py-4">
                                                            <div className="flex items-start gap-4">
                                                                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-sm font-bold text-primary-700">{item.rank}</span>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <Link to={`/tickets/${item.ticketId}`} className="font-semibold text-foreground hover:text-primary">
                                                                            {ticket?.protocol || ticket?.title || `Chamado ${item.ticketId.slice(0, 8)}`}
                                                                        </Link>
                                                                        {ticket?.priority && <PriorityBadge priority={ticket.priority} />}
                                                                        {ticket?.status && <StatusBadge status={ticket.status} />}
                                                                    </div>
                                                                    <p className="mt-2 text-sm text-muted-foreground">{item.reason}</p>
                                                                    <p className="mt-2 text-sm font-medium text-foreground">Próxima ação: {item.recommendedAction}</p>
                                                                </div>
                                                            </div>
                                                        </article>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </section>

                                <section className="overflow-hidden rounded-xl border border-border bg-surface">
                                    <div className="border-b border-border px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                                <Icon name="task_list" className="size-5" />
                                            </div>
                                            <div>
                                                <h2 className="text-lg font-bold text-foreground">Tarefas e lembretes</h2>
                                                <p className="text-sm text-muted-foreground">{pendingTasks.length} pendente{pendingTasks.length === 1 ? '' : 's'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <form onSubmit={submitManualTask} className="space-y-3 border-b border-border bg-surface-alt p-4">
                                        <label className="block">
                                            <span className="text-sm font-medium text-foreground">Nova tarefa</span>
                                            <input
                                                value={taskTitle}
                                                onChange={(event) => setTaskTitle(event.target.value)}
                                                placeholder="Ex.: revisar retorno do chamado"
                                                maxLength={160}
                                                className="mt-2 h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30"
                                            />
                                        </label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <label>
                                                <span className="text-xs font-medium text-muted-foreground">Prioridade</span>
                                                <select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as Priority)} className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground">
                                                    <option value="LOW">Baixa</option>
                                                    <option value="MEDIUM">Média</option>
                                                    <option value="HIGH">Alta</option>
                                                    <option value="CRITICAL">Crítica</option>
                                                </select>
                                            </label>
                                            <label>
                                                <span className="text-xs font-medium text-muted-foreground">Prazo</span>
                                                <input type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground" />
                                            </label>
                                        </div>
                                        <Button type="submit" size="sm" className="w-full" loading={creatingTask} disabled={!taskTitle.trim()}>
                                            <Icon name="add" className="size-4" /> Criar tarefa
                                        </Button>
                                    </form>

                                    {pendingTasks.length === 0 ? (
                                        <div className="p-4">
                                        <EmptyState icon="task_alt" title="Tudo em dia" description="Crie uma tarefa manual ou aceite uma sugestão da próxima análise." />
                                        </div>
                                    ) : (
                                        <div className="max-h-[520px] divide-y divide-border overflow-y-auto scrollbar-thin">
                                            {pendingTasks.map((task) => (
                                                <article key={task.id} className="p-4">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-foreground">{task.title}</p>
                                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                                <PriorityBadge priority={task.priority} />
                                                                <Badge tone={task.source === 'AI' ? 'primary' : 'neutral'}>{taskSourceLabels[task.source]}</Badge>
                                                            </div>
                                                        </div>
                                                        <button type="button" onClick={() => updateTaskStatus(task, 'COMPLETED')} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-success-soft hover:text-success-fg" aria-label={`Concluir ${task.title}`} title="Concluir tarefa">
                                                            <Icon name="task_alt" className="size-5" />
                                                        </button>
                                                    </div>
                                                    {task.description && <p className="mt-3 text-sm text-muted-foreground">{task.description}</p>}
                                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                                        <span>{formatDateTime(task.dueAt)}</span>
                                                        {task.ticket && <Link to={`/tickets/${task.ticket.id}`} className="font-semibold text-primary hover:text-primary-700">{task.ticket.protocol || 'Abrir chamado'}</Link>}
                                                    </div>
                                                </article>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            </div>

                            {canAnalyze && analysis && (
                                <div className="grid items-start gap-6 xl:grid-cols-2">
                                    <section className="overflow-hidden rounded-xl border border-border bg-surface">
                                        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                                    <Icon name="group" className="size-5" />
                                                </div>
                                                <div>
                                                    <h2 className="text-lg font-bold text-foreground">Clientes que mais chamam</h2>
                                                    <p className="text-sm text-muted-foreground">Ordenados pela frequência de atendimentos</p>
                                                </div>
                                            </div>
                                            {analysis.result.conversationStats && (
                                                <Badge tone="neutral">{analysis.result.conversationStats.activeContacts} clientes ativos</Badge>
                                            )}
                                        </div>
                                        {topCustomers.length === 0 ? (
                                            <div className="p-5">
                                                <EmptyState icon="group" title="Sem contatos no período" description="Não houve mensagens recebidas de clientes no intervalo analisado." />
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-border">
                                                {topCustomers.map((customer, index) => (
                                                    <article key={customer.contactId} className="flex items-center gap-4 px-5 py-4">
                                                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-alt text-sm font-bold text-foreground">{index + 1}</span>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="truncate font-semibold text-foreground">{displayCustomerName(customer.name)}</p>
                                                            <p className="mt-1 text-sm text-muted-foreground">
                                                                {customer.conversationCount} atendimento{customer.conversationCount === 1 ? '' : 's'} · {customer.inboundMessageCount} {customer.inboundMessageCount === 1 ? 'mensagem recebida' : 'mensagens recebidas'}
                                                            </p>
                                                        </div>
                                                        <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(customer.lastContactAt)}</span>
                                                    </article>
                                                ))}
                                            </div>
                                        )}
                                    </section>

                                    <section className="overflow-hidden rounded-xl border border-border bg-surface">
                                        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                                    <Icon name="forum" className="size-5" />
                                                </div>
                                                <div>
                                                    <h2 className="text-lg font-bold text-foreground">Principais problemas</h2>
                                                    <p className="text-sm text-muted-foreground">Assuntos recorrentes identificados na amostra local</p>
                                                </div>
                                            </div>
                                            {analysis.result.conversationStats && (
                                                <Badge tone="neutral">
                                                    {analysis.result.conversationStats.sampledConversations} de {analysis.result.conversationStats.conversations} conversas
                                                </Badge>
                                            )}
                                        </div>
                                        {mainProblems.length === 0 ? (
                                            <div className="p-5">
                                                <EmptyState icon="forum" title="Nenhum problema recorrente" description="As conversas do período ainda não formaram grupos de assuntos suficientes." />
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-border">
                                                {mainProblems.map((problem, index) => (
                                                    <article key={`${problem.label}-${index}`} className="px-5 py-4">
                                                        <div className="flex items-start gap-4">
                                                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-sm font-bold text-primary-700">{index + 1}</span>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <p className="font-semibold text-foreground">{problem.label}</p>
                                                                    <Badge tone="primary">{problem.conversationCount} na amostra</Badge>
                                                                </div>
                                                                <p className="mt-2 text-sm leading-6 text-muted-foreground">{problem.description}</p>
                                                            </div>
                                                        </div>
                                                    </article>
                                                ))}
                                            </div>
                                        )}
                                    </section>
                                </div>
                            )}

                            {canAnalyze && analysis && analysis.result.taskSuggestions.length > 0 && (
                                <section className="overflow-hidden rounded-xl border border-border bg-surface">
                                    <div className="border-b border-border px-5 py-4">
                                        <h2 className="text-lg font-bold text-foreground">Sugestões para a equipe</h2>
                                        <p className="mt-1 text-sm text-muted-foreground">Revise cada sugestão antes de transformá-la em tarefa. Nada é criado automaticamente.</p>
                                    </div>
                                    <div className="divide-y divide-border">
                                        {analysis.result.taskSuggestions.map((suggestion) => {
                                            const accepted = acceptedSuggestions.has(suggestion.suggestionId);
                                            const ticket = suggestion.ticketId ? ticketById.get(suggestion.ticketId) : null;
                                            return (
                                                <div key={suggestion.suggestionId} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <p className="font-semibold text-foreground">{suggestion.title}</p>
                                                            <PriorityBadge priority={suggestion.priority} />
                                                            <Badge tone="neutral">Prazo sugerido: {suggestion.dueInDays === 0 ? 'hoje' : `${suggestion.dueInDays} dia${suggestion.dueInDays === 1 ? '' : 's'}`}</Badge>
                                                        </div>
                                                        <p className="mt-2 text-sm text-muted-foreground">{suggestion.description}</p>
                                                        {ticket && <Link to={`/tickets/${ticket.id}`} className="mt-2 inline-block text-sm font-semibold text-primary">{ticket.protocol || ticket.title}</Link>}
                                                    </div>
                                                    <Button type="button" variant={accepted ? 'secondary' : 'outline'} size="sm" loading={savingSuggestion === suggestion.suggestionId} disabled={accepted} onClick={() => acceptSuggestion(suggestion)}>
                                                        <Icon name={accepted ? 'task_alt' : 'add'} className="size-4" />
                                                        {accepted ? 'Tarefa criada' : 'Criar tarefa'}
                                                    </Button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}

                            {completedTasks.length > 0 && (
                                <details className="rounded-xl border border-border bg-surface">
                                    <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-foreground">Concluídas recentemente ({completedTasks.length})</summary>
                                    <div className="divide-y divide-border border-t border-border">
                                        {completedTasks.slice(0, 20).map((task) => (
                                            <div key={task.id} className="flex items-center gap-3 px-5 py-3 text-sm text-muted-foreground">
                                                <Icon name="task_alt" className="size-4 text-success" />
                                                <span className="flex-1 line-through">{task.title}</span>
                                                <button type="button" onClick={() => updateTaskStatus(task, 'PENDING')} className="min-h-11 rounded-lg px-3 font-semibold text-primary hover:bg-primary/10">Reabrir</button>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
