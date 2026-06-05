import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SigmaTopbar } from '../components/sigma/SigmaTopbar';
import { SigmaSettingsCard } from '../components/sigma/SigmaSettingsCard';
import { Icon } from '../components/ui/Icon';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';

interface WhatsAppSession {
    name: string;
    status: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3334';
const WHATSAPP_SESSION_ID = 'default';
type SettingsSection = 'business-hours' | 'auto-messages' | 'whatsapp';

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
    };

    return labels[status] || status;
}

export default function Settings() {
    const navigate = useNavigate();
    const [activeSection, setActiveSection] = useState<SettingsSection>('business-hours');
    const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
    const [whatsAppLoading, setWhatsAppLoading] = useState(false);
    const [whatsAppError, setWhatsAppError] = useState<string | null>(null);
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

    const loadWhatsAppQrCode = () => {
        apiRequest<{ qrCodeDataUrl?: string }>(`/api/whatsapp/sessions/${WHATSAPP_SESSION_ID}/qrcode-image`)
            .then((data) => setQrCodeDataUrl(data.qrCodeDataUrl || null))
            .catch(() => setQrCodeDataUrl(null));
    };

    const loadWhatsAppSessions = () => {
        apiRequest<WhatsAppSession[]>('/api/whatsapp/sessions')
            .then((data) => {
                setSessions(data);
                const session = data.find((item) => item.name === WHATSAPP_SESSION_ID);
                if (session && ['QR', 'QR_AVAILABLE_OR_AUTH_PENDING', 'STARTING', 'AUTHENTICATED'].includes(session.status)) {
                    loadWhatsAppQrCode();
                }
            })
            .catch((err) => {
                if (!redirectOnUnauthorized(err, navigate)) {
                    setWhatsAppError(err instanceof Error ? err.message : 'Erro ao consultar sessão WhatsApp.');
                }
            });
    };

    useEffect(() => {
        loadWhatsAppSessions();
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

    const currentWhatsAppSession = sessions.find((session) => session.name === WHATSAPP_SESSION_ID);
    const whatsAppStatus = currentWhatsAppSession?.status || 'NAO_INICIADO';
    const hasQrCode = ['QR', 'QR_AVAILABLE_OR_AUTH_PENDING', 'STARTING', 'AUTHENTICATED'].includes(whatsAppStatus);
    const isConnected = ['READY', 'CONNECTED', 'WORKING'].includes(whatsAppStatus);

    const startWhatsAppSession = async () => {
        setWhatsAppLoading(true);
        setWhatsAppError(null);

        try {
            await apiRequest(`/api/whatsapp/sessions/${WHATSAPP_SESSION_ID}/start`, { method: 'POST' });
            await new Promise((resolve) => window.setTimeout(resolve, 5000));
            loadWhatsAppSessions();
            loadWhatsAppQrCode();
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                setWhatsAppError(err instanceof Error ? err.message : 'Erro ao conectar WhatsApp.');
            }
        } finally {
            setWhatsAppLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('sigma-token');
        navigate('/login');
    };

    const mockUser = { nome: 'Admin', role: 'Administrador' };

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
            <SigmaTopbar user={mockUser} onLogout={handleLogout} />

            <main className="flex flex-1 flex-col md:flex-row max-w-7xl mx-auto w-full p-4 md:p-8 gap-8">
                {/* Left Sidebar Navigation */}
                <aside className="w-full md:w-72 flex flex-col gap-6">
                    <div className="bg-surface p-4 rounded-xl shadow-card border border-border">
                        <div className="mb-6 px-2">
                            <h1 className="text-primary font-bold text-xl">Sigma Atendimento</h1>
                            <p className="text-muted-foreground text-sm">Configurações do sistema</p>
                        </div>
                        <nav className="flex flex-col gap-2">
                            <button type="button" onClick={() => goToSection('business-hours')} className={settingsNavClass('business-hours')}>
                                <Icon name="schedule" className="size-5" />
                                <span className="text-sm">Horário de atendimento</span>
                            </button>
                            <button type="button" onClick={() => goToSection('auto-messages')} className={settingsNavClass('auto-messages')}>
                                <Icon name="chat_bubble" className="size-5" />
                                <span className="text-sm">Mensagens automáticas</span>
                            </button>
                            <button type="button" onClick={() => goToSection('whatsapp')} className={settingsNavClass('whatsapp')}>
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
                    {/* Business Hours Section */}
                    <div id="business-hours" className="scroll-mt-24">
                        <SigmaSettingsCard
                            title="Horário de Funcionamento"
                            description="Defina os intervalos de disponibilidade da sua equipe."
                            actionButton={<button className="bg-primary text-white px-4 py-2 rounded-pill text-sm font-semibold hover:bg-primary-700 transition-colors cursor-pointer">Salvar Alterações</button>}
                        >
                            <div className="overflow-x-auto">
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
                                    {['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'].map(day => (
                                        <tr key={day} className="hover:bg-surface-alt transition-colors">
                                            <td className="px-6 py-4 font-medium">{day}</td>
                                            <td className="px-6 py-4 text-center">
                                                <input type="time" defaultValue="08:00" className="bg-surface border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <input type="time" defaultValue="18:00" className="bg-surface border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-soft text-success-fg">Aberto</span>
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="bg-surface-alt transition-colors">
                                        <td className="px-6 py-4 font-medium">Sábado</td>
                                        <td className="px-6 py-4 text-center">
                                            <input type="time" defaultValue="09:00" className="bg-surface border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <input type="time" defaultValue="13:00" className="bg-surface border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-alt text-muted-foreground border border-border">Especial</span>
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-surface-alt transition-colors">
                                        <td className="px-6 py-4 font-medium">Domingo</td>
                                        <td className="px-6 py-4 text-center text-muted-foreground">-</td>
                                        <td className="px-6 py-4 text-center text-muted-foreground">-</td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-danger-soft text-danger-fg border border-danger/20">Fechado</span>
                                        </td>
                                    </tr>
                                </tbody>
                                </table>
                            </div>
                        </SigmaSettingsCard>
                    </div>

                    {/* Automatic Messages Section */}
                    <div id="auto-messages" className="scroll-mt-24">
                        <SigmaSettingsCard
                            title="Mensagens Automáticas"
                            description="Respostas instantâneas para diferentes situações."
                        >
                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-bold text-foreground">Mensagem de Saudação</label>
                                <textarea
                                    className="w-full bg-surface border border-border rounded-xl p-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all min-h-[120px] resize-none"
                                    defaultValue="Olá! Seja bem-vindo à Sigma Atendimento. Em instantes um de nossos consultores irá falar com você."
                                />
                                <p className="text-[10px] text-muted-foreground">Enviada no primeiro contato do dia de cada cliente.</p>
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-bold text-foreground">Mensagem de Ausência</label>
                                <textarea
                                    className="w-full bg-surface border border-border rounded-xl p-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all min-h-[120px] resize-none"
                                    defaultValue="No momento estamos fora do nosso horário de atendimento. Deixe sua mensagem e retornaremos assim que possível. Nosso horário é das 08:00 às 18:00."
                                />
                                <p className="text-[10px] text-muted-foreground">Enviada automaticamente fora do horário configurado.</p>
                            </div>
                            </div>
                        </SigmaSettingsCard>
                    </div>

                    {/* WhatsApp Integration Card */}
                    <div id="whatsapp" className="scroll-mt-24">
                        <SigmaSettingsCard
                            title="Conexão WhatsApp"
                            description="Conecte o canal WhatsApp Web usado no atendimento."
                            actionButton={
                                <button
                                    onClick={startWhatsAppSession}
                                    disabled={whatsAppLoading}
                                    className="px-4 py-2 bg-primary text-white rounded-pill text-sm font-semibold hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60 transition-colors cursor-pointer"
                                >
                                    {whatsAppLoading ? 'Conectando...' : isConnected ? 'Reconectar' : 'Conectar WhatsApp'}
                                </button>
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
                                            <span className={`font-bold uppercase text-xs tracking-wider ${isConnected ? 'text-success' : hasQrCode ? 'text-warning' : 'text-muted-foreground'}`}>
                                                {isConnected ? 'Conectado' : hasQrCode ? 'Aguardando leitura do QR Code' : 'Não conectado'}
                                            </span>
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">Sessão: {WHATSAPP_SESSION_ID}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">Provider: murilo-api</p>
                                        {whatsAppError && (
                                            <div className="mt-4 rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger-fg">
                                                {whatsAppError}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="w-full lg:w-[360px]">
                                    {hasQrCode && !isConnected && qrCodeDataUrl ? (
                                        <div className="rounded-xl border border-border bg-surface-alt p-5 text-center">
                                            <p className="mb-4 text-sm font-semibold text-foreground">Escaneie para conectar</p>
                                            <img src={qrCodeDataUrl} alt="QR Code do WhatsApp" className="mx-auto w-full max-w-[320px] rounded-lg bg-white p-3" />
                                            <a
                                                href={`${API_BASE_URL}/api/whatsapp/sessions/${WHATSAPP_SESSION_ID}/qrcode-page`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="mt-4 inline-flex text-xs font-semibold text-primary hover:text-primary-700"
                                            >
                                                Abrir QR em tela cheia
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
                                    <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest mb-1">Sessões</p>
                                    <p className="text-2xl font-bold text-primary">{sessions.length}</p>
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
                            </div>
                        </SigmaSettingsCard>
                    </div>

                    <div className="flex justify-end gap-3 pb-8">
                        <button className="bg-surface text-foreground px-6 py-2.5 rounded-pill text-sm font-bold border border-border hover:bg-surface-alt transition-colors cursor-pointer">Cancelar</button>
                        <button className="bg-primary text-white px-8 py-2.5 rounded-pill text-sm font-bold shadow-primary-glow hover:bg-primary-700 transition-colors cursor-pointer">Salvar Todas as Configurações</button>
                    </div>
                </div>
            </main>
        </div>
    );
}
