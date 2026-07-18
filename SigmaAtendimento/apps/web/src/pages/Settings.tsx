import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SigmaTopbar } from '../components/sigma/SigmaTopbar';
import { SigmaSettingsCard } from '../components/sigma/SigmaSettingsCard';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { Skeleton, TableSkeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';
import { useAuth } from '../lib/auth';

interface WhatsAppSession {
    name: string;
    status: string;
    provider?: string;
}

interface WhatsAppHistorySyncSummary {
    ok: boolean;
    scannedChats: number;
    importedContacts: number;
    importedConversations: number;
    importedMessages: number;
    historyRequests?: number;
}

interface WhatsAppOutboxSummary {
    pending: number;
    failed: number;
    sent: number;
    total: number;
}

interface WhatsAppOutboxItem {
    id: string;
    provider: string;
    toPhone: string;
    bodyPreview: string | null;
    status: 'PENDING' | 'FAILED' | 'SENT';
    attempts: number;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
}

interface WhatsAppOutboxResponse {
    summary: WhatsAppOutboxSummary;
    items: WhatsAppOutboxItem[];
}

interface WhatsAppOutboxRetryResponse {
    ok: boolean;
    scanned: number;
    sent: number;
    failed: number;
}

interface WhatsAppGroup {
    id: string;
    name: string;
    participantCount?: number | null;
    unreadCount?: number;
    lastMessageAt?: number | null;
}

const WHATSAPP_SESSION_ID = 'default';
type SettingsSection = 'business-hours' | 'auto-messages' | 'whatsapp';
type BusinessHourStatus = 'OPEN' | 'SPECIAL' | 'CLOSED';

interface BusinessHour {
    day: string;
    startTime: string;
    endTime: string;
    status: BusinessHourStatus;
}

interface SystemSettings {
    businessHours: BusinessHour[];
    welcomeMessage?: string | null;
    awayMessage?: string | null;
    closingMessage?: string | null;
    externalServiceGroupId?: string | null;
    externalServiceGroupName?: string | null;
}

const defaultBusinessHours: BusinessHour[] = [
    { day: 'Segunda-feira', startTime: '08:00', endTime: '18:00', status: 'OPEN' },
    { day: 'Terça-feira', startTime: '08:00', endTime: '18:00', status: 'OPEN' },
    { day: 'Quarta-feira', startTime: '08:00', endTime: '18:00', status: 'OPEN' },
    { day: 'Quinta-feira', startTime: '08:00', endTime: '18:00', status: 'OPEN' },
    { day: 'Sexta-feira', startTime: '08:00', endTime: '18:00', status: 'OPEN' },
    { day: 'Sábado', startTime: '09:00', endTime: '13:00', status: 'SPECIAL' },
    { day: 'Domingo', startTime: '', endTime: '', status: 'CLOSED' },
];

const defaultSettings: SystemSettings = {
    businessHours: defaultBusinessHours,
    welcomeMessage: 'Olá! Seja bem-vindo à Sigma Atendimento. Em instantes um de nossos consultores irá falar com você.',
    awayMessage: 'No momento estamos fora do nosso horário de atendimento. Deixe sua mensagem e retornaremos assim que possível. Nosso horário é das 08:00 às 18:00.',
    closingMessage: 'Atendimento encerrado. Se precisar de algo, envie uma nova mensagem.',
};

function normalizeBusinessHours(value: unknown): BusinessHour[] {
    if (!Array.isArray(value)) return defaultBusinessHours;

    return defaultBusinessHours.map((fallback, index) => {
        const item = value[index] as Partial<BusinessHour> | undefined;
        return {
            day: item?.day || fallback.day,
            startTime: item?.startTime ?? fallback.startTime,
            endTime: item?.endTime ?? fallback.endTime,
            status: item?.status ?? fallback.status,
        };
    });
}

function formatWhatsAppStatus(status: string) {
    const labels: Record<string, string> = {
        QR: 'QR pendente',
        QR_AVAILABLE_OR_AUTH_PENDING: 'QR pendente',
        STARTING: 'Iniciando',
        AUTHENTICATED: 'Autenticado',
        READY: 'Conectado',
        CONNECTED: 'Conectado',
        WORKING: 'Conectado',
        NAO_INICIADO: 'Nao iniciado',
        NOT_CONFIGURED: 'Não configurado',
    };

    return labels[status] || status;
}

function formatOutboxStatus(status: WhatsAppOutboxItem['status']) {
    const labels: Record<WhatsAppOutboxItem['status'], string> = {
        PENDING: 'Pendente',
        FAILED: 'Falha',
        SENT: 'Enviado',
    };

    return labels[status];
}

function formatDateTime(value: string) {
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}

export default function Settings() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { showToast } = useToast();
    const [activeSection, setActiveSection] = useState<SettingsSection>('business-hours');
    const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
    const [whatsAppLoading, setWhatsAppLoading] = useState(false);
    const [whatsAppDisconnecting, setWhatsAppDisconnecting] = useState(false);
    const [whatsAppSyncing, setWhatsAppSyncing] = useState(false);
    const [whatsAppSyncSummary, setWhatsAppSyncSummary] = useState<WhatsAppHistorySyncSummary | null>(null);
    const [whatsAppError, setWhatsAppError] = useState<string | null>(null);
    const [whatsAppOutbox, setWhatsAppOutbox] = useState<WhatsAppOutboxResponse | null>(null);
    const [whatsAppOutboxLoading, setWhatsAppOutboxLoading] = useState(false);
    const [whatsAppOutboxRetrying, setWhatsAppOutboxRetrying] = useState(false);
    const [whatsAppOutboxError, setWhatsAppOutboxError] = useState<string | null>(null);
    const [whatsAppGroups, setWhatsAppGroups] = useState<WhatsAppGroup[]>([]);
    const [whatsAppGroupsLoading, setWhatsAppGroupsLoading] = useState(false);
    const [whatsAppGroupsError, setWhatsAppGroupsError] = useState<string | null>(null);
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
    const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
    const [settingsLoading, setSettingsLoading] = useState(true);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [settingsError, setSettingsError] = useState<string | null>(null);

    const loadSettings = () => {
        setSettingsLoading(true);
        setSettingsError(null);

        apiRequest<SystemSettings>('/api/settings')
            .then((data) => {
                setSettings({
                    businessHours: normalizeBusinessHours(data.businessHours),
                    welcomeMessage: data.welcomeMessage ?? defaultSettings.welcomeMessage,
                    awayMessage: data.awayMessage ?? defaultSettings.awayMessage,
                    closingMessage: data.closingMessage ?? defaultSettings.closingMessage,
                    externalServiceGroupId: data.externalServiceGroupId ?? null,
                    externalServiceGroupName: data.externalServiceGroupName ?? null,
                });
            })
            .catch((err) => {
                if (!redirectOnUnauthorized(err, navigate)) {
                    setSettingsError(err instanceof Error ? err.message : 'Erro ao carregar configurações.');
                }
            })
            .finally(() => setSettingsLoading(false));
    };

    const saveSettings = async () => {
        setSettingsSaving(true);
        setSettingsError(null);

        try {
            const data = await apiRequest<SystemSettings>('/api/settings', {
                method: 'PUT',
                body: JSON.stringify({ ...settings, businessHours: normalizeBusinessHours(settings.businessHours) }),
            });
            setSettings({
                businessHours: normalizeBusinessHours(data.businessHours),
                welcomeMessage: data.welcomeMessage ?? defaultSettings.welcomeMessage,
                awayMessage: data.awayMessage ?? defaultSettings.awayMessage,
                closingMessage: data.closingMessage ?? defaultSettings.closingMessage,
                externalServiceGroupId: data.externalServiceGroupId ?? null,
                externalServiceGroupName: data.externalServiceGroupName ?? null,
            });
            showToast({ title: 'Configurações salvas', description: 'As alterações foram aplicadas ao sistema.', variant: 'success' });
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Erro ao salvar configurações.';
                setSettingsError(message);
                showToast({ title: 'Erro ao salvar configurações', description: message, variant: 'error' });
            }
        } finally {
            setSettingsSaving(false);
        }
    };

    const updateBusinessHour = (index: number, patch: Partial<BusinessHour>) => {
        setSettings((current) => ({
            ...current,
            businessHours: current.businessHours.map((item, itemIndex) => (
                itemIndex === index ? { ...item, ...patch } : item
            )),
        }));
    };

    const loadWhatsAppQrCode = () => {
        apiRequest<{ qrCodeDataUrl?: string }>(`/api/whatsapp/sessions/${WHATSAPP_SESSION_ID}/qrcode-image`)
            .then((data) => setQrCodeDataUrl(data.qrCodeDataUrl || null))
            .catch(() => setQrCodeDataUrl(null));
    };

    const loadWhatsAppSessions = async () => {
        try {
            const data = await apiRequest<WhatsAppSession[]>('/api/whatsapp/sessions');
            setSessions(data);
            const session = data.find((item) => item.name === WHATSAPP_SESSION_ID) || data[0];
            const sessionStatus = session?.status?.toUpperCase();
            if (session && ['QR', 'QR_AVAILABLE_OR_AUTH_PENDING', 'STARTING', 'CONNECTING', 'AUTHENTICATED'].includes(sessionStatus)) {
                loadWhatsAppQrCode();
            }
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                setWhatsAppError(err instanceof Error ? err.message : 'Erro ao consultar sessão WhatsApp.');
            }
        }
    };

    const loadWhatsAppOutbox = async () => {
        setWhatsAppOutboxLoading(true);
        setWhatsAppOutboxError(null);

        try {
            const data = await apiRequest<WhatsAppOutboxResponse>('/api/whatsapp/outbox?limit=25');
            setWhatsAppOutbox(data);
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                setWhatsAppOutboxError(err instanceof Error ? err.message : 'Erro ao carregar fila de envio WhatsApp.');
            }
        } finally {
            setWhatsAppOutboxLoading(false);
        }
    };

    const loadWhatsAppGroups = async () => {
        setWhatsAppGroupsLoading(true);
        setWhatsAppGroupsError(null);

        try {
            const data = await apiRequest<WhatsAppGroup[]>('/api/whatsapp/groups?limit=500');
            const groups = Array.isArray(data) ? data : [];
            setWhatsAppGroups(groups);
            showToast({
                title: 'Grupos carregados',
                description: `${groups.length} grupos encontrados na sessao conectada.`,
                variant: 'success',
            });
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Erro ao buscar grupos do WhatsApp.';
                setWhatsAppGroupsError(message);
                showToast({ title: 'Erro ao buscar grupos', description: message, variant: 'error' });
            }
        } finally {
            setWhatsAppGroupsLoading(false);
        }
    };

    useEffect(() => {
        loadSettings();
        loadWhatsAppSessions();
        loadWhatsAppOutbox();
    }, []);

    useEffect(() => {
        const hash = window.location.hash.replace('#', '') as SettingsSection;
        if (['business-hours', 'auto-messages', 'whatsapp'].includes(hash)) {
            setActiveSection(hash);
            window.setTimeout(() => {
                document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    }, []);

    // For meta-cloud the session name is 'meta-cloud', not 'default'
    const currentWhatsAppSession = sessions.find((session) => session.name === WHATSAPP_SESSION_ID) || sessions[0] || null;
    const providerName = currentWhatsAppSession?.provider || (currentWhatsAppSession?.name === 'meta-cloud' ? 'meta-cloud' : 'murilo-api');
    const isMetaCloud = providerName === 'meta-cloud';
    const isUazApi = providerName === 'uazapi';
    const whatsAppStatus = (currentWhatsAppSession?.status || 'NAO_INICIADO').toUpperCase();
    const hasQrCode = !isMetaCloud && (['QR', 'QR_AVAILABLE_OR_AUTH_PENDING'].includes(whatsAppStatus) || (isUazApi && whatsAppStatus === 'CONNECTING'));
    const isAuthenticated = !isMetaCloud && whatsAppStatus === 'AUTHENTICATED';
    const isStarting = !isMetaCloud && whatsAppStatus === 'STARTING';
    const isConnected = ['READY', 'CONNECTED', 'WORKING'].includes(whatsAppStatus);
    const canDisconnect = !isMetaCloud && ['READY', 'CONNECTED', 'WORKING', 'AUTHENTICATED', 'STARTING', 'CONNECTING', 'QR', 'QR_AVAILABLE_OR_AUTH_PENDING'].includes(whatsAppStatus);
    const statusText = isMetaCloud
        ? (isConnected ? 'API ativa e configurada' : 'API não configurada')
        : isConnected
            ? 'Conectado'
            : isAuthenticated
                ? 'Autenticado, finalizando conexão'
                : isStarting
                    ? 'Iniciando sessão'
                    : hasQrCode
                        ? 'Aguardando leitura do QR Code'
                        : 'Não conectado';

    const selectedExternalGroup = whatsAppGroups.find((group) => group.id === settings.externalServiceGroupId) || null;

    const startWhatsAppSession = async () => {
        setWhatsAppLoading(true);
        setWhatsAppError(null);

        try {
            await apiRequest(`/api/whatsapp/sessions/${WHATSAPP_SESSION_ID}/start`, { method: 'POST' });
            await new Promise((resolve) => window.setTimeout(resolve, 5000));
            loadWhatsAppSessions();
            loadWhatsAppQrCode();
            showToast({ title: 'Conexão WhatsApp iniciada', description: 'Aguarde o QR Code ou a confirmação da sessão.', variant: 'success' });
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Erro ao conectar WhatsApp.';
                setWhatsAppError(message);
                showToast({ title: 'Erro ao conectar WhatsApp', description: message, variant: 'error' });
            }
        } finally {
            setWhatsAppLoading(false);
        }
    };

    const disconnectWhatsAppSession = async () => {
        setWhatsAppDisconnecting(true);
        setWhatsAppError(null);

        try {
            await apiRequest(`/api/whatsapp/sessions/${WHATSAPP_SESSION_ID}/disconnect`, { method: 'POST' });
            setQrCodeDataUrl(null);
            await loadWhatsAppSessions();
            showToast({ title: 'WhatsApp desconectado', description: 'A sessão foi encerrada com sucesso.', variant: 'success' });
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Erro ao desconectar WhatsApp.';
                setWhatsAppError(message);
                showToast({ title: 'Erro ao desconectar WhatsApp', description: message, variant: 'error' });
            }
        } finally {
            setWhatsAppDisconnecting(false);
        }
    };

    const syncWhatsAppHistory = async () => {
        setWhatsAppSyncing(true);
        setWhatsAppError(null);
        setWhatsAppSyncSummary(null);

        try {
            const summary = await apiRequest<WhatsAppHistorySyncSummary>(`/api/whatsapp/sessions/${WHATSAPP_SESSION_ID}/sync-history`, {
                method: 'POST',
                body: JSON.stringify({ chatLimit: 500, messageLimit: 1000 }),
            });
            setWhatsAppSyncSummary(summary);
            showToast({
                title: 'Histórico sincronizado',
                description: `${summary.importedMessages} mensagens importadas de ${summary.scannedChats} conversas verificadas.`,
                variant: 'success',
            });
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Erro ao sincronizar histórico do WhatsApp.';
                setWhatsAppError(message);
                showToast({ title: 'Erro ao sincronizar WhatsApp', description: message, variant: 'error' });
            }
        } finally {
            setWhatsAppSyncing(false);
        }
    };

    const retryWhatsAppOutbox = async () => {
        setWhatsAppOutboxRetrying(true);
        setWhatsAppOutboxError(null);

        try {
            const result = await apiRequest<WhatsAppOutboxRetryResponse>('/api/whatsapp/outbox/retry', {
                method: 'POST',
                body: JSON.stringify({ limit: 25 }),
            });
            showToast({
                title: 'Reenvio concluído',
                description: `${result.scanned} avaliadas, ${result.sent} enviadas e ${result.failed} ainda com falha.`,
                variant: result.failed > 0 ? 'warning' : 'success',
            });
            await loadWhatsAppOutbox();
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Erro ao reprocessar fila de envio WhatsApp.';
                setWhatsAppOutboxError(message);
                showToast({ title: 'Erro ao reenviar mensagens', description: message, variant: 'error' });
            }
        } finally {
            setWhatsAppOutboxRetrying(false);
        }
    };

    const settingsNavClass = (section: SettingsSection) => {
        const isActive = activeSection === section;
        return `flex w-full items-center gap-3 px-4 py-3 rounded-xl transition-all text-left cursor-pointer ${isActive
            ? 'bg-primary/10 text-primary font-semibold border border-primary/20'
            : 'text-muted-foreground hover:bg-surface-alt hover:text-foreground'
            }`;
    };

    const goToSection = (section: SettingsSection) => {
        setActiveSection(section);
        window.history.replaceState(null, '', `/settings#${section}`);
        document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="relative flex flex-col w-full h-full min-h-screen overflow-x-hidden bg-background font-sans text-foreground">
            <SigmaTopbar user={user} onLogout={logout} />

            <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 p-4 pb-24 md:flex-row md:p-8">
                {/* Left Sidebar Navigation */}
                <aside className="w-full md:w-72 flex flex-col gap-6">
                    <div className="bg-surface p-4 rounded-xl shadow-card border border-border">
                        <div className="mb-6 px-2">
                            <h1 className="text-primary font-bold text-xl">Sigma Atendimento</h1>
                            <p className="text-muted-foreground text-sm">Configurações do sistema</p>
                        </div>
                        <nav className="flex flex-col gap-2">
                            <button type="button" onClick={() => goToSection('business-hours')} className={settingsNavClass('business-hours')} aria-current={activeSection === 'business-hours' ? 'page' : undefined} aria-controls="business-hours">
                                <Icon name="schedule" className="size-5" />
                                <span className="text-sm">Horário de atendimento</span>
                            </button>
                            <button type="button" onClick={() => goToSection('auto-messages')} className={settingsNavClass('auto-messages')} aria-current={activeSection === 'auto-messages' ? 'page' : undefined} aria-controls="auto-messages">
                                <Icon name="chat_bubble" className="size-5" />
                                <span className="text-sm">Mensagens automáticas</span>
                            </button>
                            <button type="button" onClick={() => goToSection('whatsapp')} className={settingsNavClass('whatsapp')} aria-current={activeSection === 'whatsapp' ? 'page' : undefined} aria-controls="whatsapp">
                                <Icon name="phonelink_setup" className="size-5" />
                                <span className="text-sm">Integração WhatsApp</span>
                            </button>
                        </nav>
                    </div>

                    <div className="bg-surface p-4 rounded-xl border border-border shadow-card">
                        <p className="text-xs font-bold uppercase tracking-wider text-primary mb-2">Status do Servidor</p>
                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-success animate-pulse"></span>
                            <span className="text-sm text-muted-foreground">Sistemas Operacionais</span>
                        </div>
                    </div>
                </aside>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col gap-8">
                    {settingsError && (
                        <div className="rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger-fg">
                            {settingsError}
                        </div>
                    )}
                    {/* Business Hours Section */}
                    <div id="business-hours" className="scroll-mt-24">
                        <SigmaSettingsCard
                            title="Horário de Funcionamento"
                            description="Defina os intervalos de disponibilidade da sua equipe."
                            actionButton={
                                <button
                                    type="button"
                                    onClick={saveSettings}
                                    disabled={settingsSaving || settingsLoading}
                                    className="min-h-11 rounded-lg bg-primary-solid px-4 py-2 text-sm font-semibold text-primary-solid-fg transition-colors hover:bg-primary-solid-hover disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                                >
                                    {settingsSaving ? 'Salvando...' : 'Salvar Alterações'}
                                </button>
                            }
                        >
                            <div className="overflow-x-auto">
                                {settingsLoading ? (
                                    <div className="p-6">
                                        <TableSkeleton rows={7} columns={4} />
                                    </div>
                                ) : (
                                <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="bg-surface-alt text-muted-foreground uppercase text-[10px] font-bold tracking-widest">
                                        <th className="px-6 py-4">Dia da Semana</th>
                                        <th className="px-6 py-4 text-center">Início</th>
                                        <th className="px-6 py-4 text-center">Fim</th>
                                        <th className="px-6 py-4 text-right">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {settings.businessHours.map((item, index) => (
                                        <tr key={item.day} className="hover:bg-surface-alt transition-colors">
                                            <td className="px-6 py-4 font-medium">{item.day}</td>
                                            <td className="px-6 py-4 text-center">
                                                <input
                                                    type="time"
                                                    value={item.startTime}
                                                    disabled={item.status === 'CLOSED'}
                                                    onChange={(event) => updateBusinessHour(index, { startTime: event.target.value })}
                                                    className="bg-surface border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
                                                />
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <input
                                                    type="time"
                                                    value={item.endTime}
                                                    disabled={item.status === 'CLOSED'}
                                                    onChange={(event) => updateBusinessHour(index, { endTime: event.target.value })}
                                                    className="bg-surface border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
                                                />
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <select
                                                    value={item.status}
                                                    onChange={(event) => updateBusinessHour(index, { status: event.target.value as BusinessHourStatus })}
                                                    className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                                                >
                                                    <option value="OPEN">Aberto</option>
                                                    <option value="SPECIAL">Especial</option>
                                                    <option value="CLOSED">Fechado</option>
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                </table>
                                )}
                            </div>
                        </SigmaSettingsCard>
                    </div>

                    {/* Automatic Messages Section */}
                    <div id="auto-messages" className="scroll-mt-24">
                        <SigmaSettingsCard
                            title="Mensagens Automáticas"
                            description="Respostas instantâneas para diferentes situações."
                            actionButton={
                                <button
                                    type="button"
                                    onClick={saveSettings}
                                    disabled={settingsSaving || settingsLoading}
                                    className="min-h-11 rounded-lg bg-primary-solid px-4 py-2 text-sm font-semibold text-primary-solid-fg transition-colors hover:bg-primary-solid-hover disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                                >
                                    {settingsSaving ? 'Salvando...' : 'Salvar Mensagens'}
                                </button>
                            }
                        >
                            {settingsLoading ? (
                                <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
                                    <Skeleton className="h-40" />
                                    <Skeleton className="h-40" />
                                </div>
                            ) : (
                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-bold text-foreground">Mensagem de Saudação</label>
                                <textarea
                                    className="w-full bg-surface border border-border rounded-xl p-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all min-h-[120px] resize-none"
                                    value={settings.welcomeMessage || ''}
                                    onChange={(event) => setSettings((current) => ({ ...current, welcomeMessage: event.target.value }))}
                                />
                                <p className="text-[10px] text-muted-foreground">Enviada no primeiro contato do dia de cada cliente.</p>
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-bold text-foreground">Mensagem de Ausência</label>
                                <textarea
                                    className="w-full bg-surface border border-border rounded-xl p-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all min-h-[120px] resize-none"
                                    value={settings.awayMessage || ''}
                                    onChange={(event) => setSettings((current) => ({ ...current, awayMessage: event.target.value }))}
                                />
                                <p className="text-[10px] text-muted-foreground">Enviada automaticamente fora do horário configurado.</p>
                            </div>
                            </div>
                            )}
                        </SigmaSettingsCard>
                    </div>

                    {/* WhatsApp Integration Card */}
                    <div id="whatsapp" className="scroll-mt-24">
                        <SigmaSettingsCard
                            title={isMetaCloud ? 'WhatsApp Business (Cloud API)' : 'Conexão WhatsApp'}
                            description={isMetaCloud ? 'API oficial da Meta — sem QR Code, sem sessão no celular.' : 'Conecte o canal WhatsApp Web usado no atendimento.'}
                            actionButton={
                                !isMetaCloud ? (
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                        {isConnected && (
                                            <button
                                                type="button"
                                                onClick={syncWhatsAppHistory}
                                                disabled={whatsAppLoading || whatsAppDisconnecting || whatsAppSyncing}
                                                aria-label="Sincronizar histórico do WhatsApp"
                                                className="px-4 py-2 bg-surface text-foreground rounded-pill text-sm font-semibold border border-border hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60 transition-colors cursor-pointer"
                                            >
                                                {whatsAppSyncing ? 'Sincronizando...' : 'Sincronizar histórico'}
                                            </button>
                                        )}
                                        {canDisconnect && (
                                            <button
                                                type="button"
                                                onClick={disconnectWhatsAppSession}
                                                disabled={whatsAppLoading || whatsAppDisconnecting || whatsAppSyncing}
                                                aria-label="Desconectar sessão do WhatsApp"
                                                className="px-4 py-2 bg-surface text-danger rounded-pill text-sm font-semibold border border-danger/30 hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-60 transition-colors cursor-pointer"
                                            >
                                                {whatsAppDisconnecting ? 'Desconectando...' : 'Desconectar'}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={startWhatsAppSession}
                                            disabled={whatsAppLoading || whatsAppDisconnecting || whatsAppSyncing}
                                            aria-label={isConnected ? 'Reconectar WhatsApp' : 'Conectar WhatsApp'}
                                            className="min-h-11 rounded-lg bg-primary-solid px-4 py-2 text-sm font-semibold text-primary-solid-fg transition-colors hover:bg-primary-solid-hover disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                                        >
                                            {whatsAppLoading ? 'Conectando...' : isConnected ? 'Reconectar' : 'Conectar WhatsApp'}
                                        </button>
                                    </div>
                                ) : undefined
                            }
                        >
                            <div className="p-6">
                            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                                <div className="flex gap-4 items-start">
                                    <div className="bg-[#25D366]/10 text-[#25D366] p-3 rounded-xl flex items-center justify-center">
                                        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"></path>
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">
                                            Status:{' '}
                                            <span className={`font-bold uppercase text-xs tracking-wider ${isConnected ? 'text-success' : (hasQrCode || isAuthenticated || isStarting) ? 'text-warning' : 'text-muted-foreground'}`}>
                                                {statusText}
                                            </span>
                                        </p>
                                        {!isMetaCloud && <p className="mt-1 text-xs text-muted-foreground">Sessão: {WHATSAPP_SESSION_ID}</p>}
                                        <p className="mt-1 text-xs text-muted-foreground">Provider: {isMetaCloud ? 'meta-cloud (API oficial)' : isUazApi ? 'uazapi (WhatsApp Web)' : `${providerName} (WhatsApp Web)`}</p>
                                        {whatsAppError && (
                                            <div className="mt-4 rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger-fg">
                                                {whatsAppError}
                                            </div>
                                        )}
                                        {whatsAppSyncSummary && (
                                            <div className="mt-4 rounded-lg border border-success/20 bg-success-soft p-3 text-sm text-success-fg">
                                                Histórico sincronizado: {whatsAppSyncSummary.scannedChats} conversas verificadas, {whatsAppSyncSummary.importedContacts} contatos novos, {whatsAppSyncSummary.importedConversations} conversas novas e {whatsAppSyncSummary.importedMessages} mensagens importadas.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="w-full lg:w-[360px]">
                                    {isMetaCloud ? (
                                        <div className="rounded-xl border border-border bg-surface-alt p-5">
                                            <p className="mb-3 text-sm font-semibold text-foreground">Configuração do Webhook</p>
                                            <p className="text-xs text-muted-foreground mb-2">Configure esta URL no Meta for Developers → WhatsApp → Configuration:</p>
                                            <div className="rounded-lg bg-surface border border-border px-3 py-2 text-xs font-mono text-primary break-all select-all">
                                                {(import.meta.env.VITE_API_URL || 'http://localhost:3334')}/api/whatsapp/webhooks/meta
                                            </div>
                                            <p className="mt-3 text-xs text-muted-foreground mb-1">Assinar o campo: <span className="font-semibold text-foreground">messages</span></p>
                                            <p className="text-xs text-muted-foreground">Verify Token: defina <span className="font-semibold text-foreground">META_WHATSAPP_VERIFY_TOKEN</span> no .env do servidor.</p>
                                        </div>
                                    ) : hasQrCode && !isConnected && qrCodeDataUrl ? (
                                        <div className="rounded-xl border border-border bg-surface-alt p-5 text-center">
                                            <p className="mb-4 text-sm font-semibold text-foreground">Escaneie para conectar</p>
                                            <img src={qrCodeDataUrl} alt="QR Code do WhatsApp" className="mx-auto w-full max-w-[320px] rounded-lg bg-white p-3" />
                                            <a
                                                href={qrCodeDataUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="mt-4 inline-flex text-xs font-semibold text-primary hover:text-primary-700"
                                            >
                                                Abrir imagem do QR
                                            </a>
                                        </div>
                                    ) : (
                                        <div className="flex h-[260px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-alt p-6 text-center">
                                            <Icon name="qr_code_2" className="mb-3 size-10 text-muted-foreground" />
                                            <p className="text-sm font-semibold text-foreground">{hasQrCode ? 'Carregando QR Code' : 'QR Code indisponível'}</p>
                                            <p className="mt-2 text-xs text-muted-foreground">Clique em Conectar WhatsApp para iniciar ou atualizar a sessão.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="bg-surface-alt p-4 rounded-xl border border-border text-center">
                                    <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest mb-1">{isMetaCloud ? 'Tipo' : 'Sessões'}</p>
                                    <p className="text-base font-bold text-primary">{isMetaCloud ? 'Cloud API' : sessions.length}</p>
                                </div>
                                <div className="bg-surface-alt p-4 rounded-xl border border-border text-center">
                                    <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest mb-1">Status</p>
                                    <p className="text-base font-bold text-primary">{formatWhatsAppStatus(whatsAppStatus)}</p>
                                </div>
                                <div className="bg-surface-alt p-4 rounded-xl border border-border text-center">
                                    <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest mb-1">Webhook</p>
                                    <p className="text-base font-bold text-primary">Ativo</p>
                                </div>
                            </div>

                            <div className="mt-8 rounded-xl border border-border bg-surface-alt p-5">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-foreground">Grupo de avisos de atendimento externo</p>
                                        <p className="mt-1 text-xs text-muted-foreground">Busque os grupos da sessao conectada e selecione onde os avisos de visita serao enviados.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={loadWhatsAppGroups}
                                        disabled={whatsAppGroupsLoading || !isUazApi}
                                        aria-label="Buscar grupos do WhatsApp"
                                        className="min-h-11 rounded-lg bg-primary-solid px-4 py-2 text-sm font-semibold text-primary-solid-fg transition-colors hover:bg-primary-solid-hover disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {whatsAppGroupsLoading ? 'Buscando...' : 'Buscar grupos'}
                                    </button>
                                </div>

                                {whatsAppGroupsError && (
                                    <div className="mt-4 rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger-fg">
                                        {whatsAppGroupsError}
                                    </div>
                                )}

                                <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
                                    <label>
                                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Grupo selecionado</span>
                                        <select
                                            value={settings.externalServiceGroupId || ''}
                                            onChange={(event) => {
                                                const group = whatsAppGroups.find((item) => item.id === event.target.value);
                                                setSettings((current) => ({
                                                    ...current,
                                                    externalServiceGroupId: group?.id || null,
                                                    externalServiceGroupName: group?.name || null,
                                                }));
                                            }}
                                            disabled={settingsLoading || settingsSaving || whatsAppGroupsLoading}
                                            className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            <option value="">Nenhum grupo selecionado</option>
                                            {settings.externalServiceGroupId && !selectedExternalGroup && (
                                                <option value={settings.externalServiceGroupId}>
                                                    {settings.externalServiceGroupName || settings.externalServiceGroupId}
                                                </option>
                                            )}
                                            {whatsAppGroups.map((group) => (
                                                <option key={group.id} value={group.id}>
                                                    {group.name}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="mt-2 text-xs text-muted-foreground">Depois de escolher, clique em Salvar configuracoes.</p>
                                    </label>

                                    <div className="rounded-lg border border-border bg-surface p-4">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">ID do grupo</p>
                                        <p className="mt-2 break-all font-mono text-xs text-foreground">
                                            {settings.externalServiceGroupId || 'Nao definido'}
                                        </p>
                                        {settings.externalServiceGroupName && (
                                            <p className="mt-2 text-sm font-semibold text-foreground">{settings.externalServiceGroupName}</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 rounded-xl border border-border bg-surface-alt p-5">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-foreground">Fila de envio WhatsApp</p>
                                        <p className="mt-1 text-xs text-muted-foreground">Monitore mensagens pendentes ou com falha e reenvie quando o provider voltar.</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={loadWhatsAppOutbox}
                                            disabled={whatsAppOutboxLoading || whatsAppOutboxRetrying}
                                            aria-label="Atualizar fila de envio WhatsApp"
                                            className="rounded-pill border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {whatsAppOutboxLoading ? 'Atualizando...' : 'Atualizar'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={retryWhatsAppOutbox}
                                            disabled={whatsAppOutboxRetrying || whatsAppOutboxLoading || !whatsAppOutbox?.summary.failed}
                                            aria-label="Reenviar mensagens com falha do WhatsApp"
                                            className="min-h-11 rounded-lg bg-primary-solid px-4 py-2 text-sm font-semibold text-primary-solid-fg transition-colors hover:bg-primary-solid-hover disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {whatsAppOutboxRetrying ? 'Reenviando...' : 'Reenviar falhas'}
                                        </button>
                                    </div>
                                </div>

                                {whatsAppOutboxError && (
                                    <div className="mt-4 rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger-fg">
                                        {whatsAppOutboxError}
                                    </div>
                                )}
                                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    <div className="rounded-lg border border-border bg-surface p-3">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pendentes</p>
                                        <p className="mt-1 text-2xl font-bold text-warning">{whatsAppOutbox?.summary.pending ?? 0}</p>
                                    </div>
                                    <div className="rounded-lg border border-border bg-surface p-3">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Falhas</p>
                                        <p className="mt-1 text-2xl font-bold text-danger">{whatsAppOutbox?.summary.failed ?? 0}</p>
                                    </div>
                                    <div className="rounded-lg border border-border bg-surface p-3">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Enviadas</p>
                                        <p className="mt-1 text-2xl font-bold text-success">{whatsAppOutbox?.summary.sent ?? 0}</p>
                                    </div>
                                    <div className="rounded-lg border border-border bg-surface p-3">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total</p>
                                        <p className="mt-1 text-2xl font-bold text-primary">{whatsAppOutbox?.summary.total ?? 0}</p>
                                    </div>
                                </div>

                                <div className="mt-5 overflow-x-auto">
                                    <table className="w-full min-w-[680px] text-left text-sm">
                                        <thead>
                                            <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                                <th className="px-3 py-2">Status</th>
                                                <th className="px-3 py-2">Destino</th>
                                                <th className="px-3 py-2">Mensagem</th>
                                                <th className="px-3 py-2 text-center">Tentativas</th>
                                                <th className="px-3 py-2">Atualizado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {whatsAppOutbox?.items.map((item) => (
                                                <tr key={item.id}>
                                                    <td className="px-3 py-3">
                                                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === 'FAILED' ? 'bg-danger-soft text-danger-fg' : 'bg-warning/10 text-warning'}`}>
                                                            {formatOutboxStatus(item.status)}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3 font-mono text-xs text-foreground">{item.toPhone}</td>
                                                    <td className="max-w-[260px] px-3 py-3 text-muted-foreground">
                                                        <div className="truncate">{item.bodyPreview || item.lastError || 'Sem prévia disponível'}</div>
                                                        {item.lastError && (
                                                            <div className="mt-1 truncate text-xs text-danger">{item.lastError}</div>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3 text-center text-muted-foreground">{item.attempts}</td>
                                                    <td className="px-3 py-3 text-xs text-muted-foreground">{formatDateTime(item.updatedAt)}</td>
                                                </tr>
                                            ))}
                                            {!whatsAppOutboxLoading && whatsAppOutbox?.items.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="px-3 py-6">
                                                        <EmptyState
                                                            icon="check_circle"
                                                            title="Nenhuma mensagem pendente"
                                                            description="A fila de envio do WhatsApp não tem falhas ou pendências no momento."
                                                        />
                                                    </td>
                                                </tr>
                                            )}
                                            {whatsAppOutboxLoading && (
                                                <tr>
                                                    <td colSpan={5} className="px-3 py-6">
                                                        <TableSkeleton rows={3} columns={5} />
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            </div>
                        </SigmaSettingsCard>
                    </div>

                    <div className="flex justify-end gap-3 pb-8">
                        <button
                            type="button"
                            onClick={loadSettings}
                            disabled={settingsLoading || settingsSaving}
                            className="bg-surface text-foreground px-6 py-2.5 rounded-pill text-sm font-bold border border-border hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60 transition-colors cursor-pointer"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={saveSettings}
                            disabled={settingsLoading || settingsSaving}
                                    className="min-h-11 rounded-lg bg-primary-solid px-8 py-2.5 text-sm font-bold text-primary-solid-fg shadow-none transition-colors hover:bg-primary-solid-hover disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                        >
                            {settingsSaving ? 'Salvando...' : 'Salvar Todas as Configurações'}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}
