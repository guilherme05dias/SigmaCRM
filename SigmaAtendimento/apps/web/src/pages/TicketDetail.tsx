import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SigmaSidebarIcon } from '../components/sigma/SigmaSidebarIcon';
import { PriorityBadge, StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';
import { useAuth } from '../lib/auth';

type TicketStatus =
    | 'NEW' | 'QUEUED' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'WAITING_INTERNAL'
    | 'SCHEDULED_FIELD_SERVICE' | 'RESOLVED' | 'CLOSED' | 'CANCELED';
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type ServiceType = 'PRESENCIAL' | 'REMOTO' | 'HIBRIDO';
type FieldVisitStatus = 'PENDING' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';

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

interface ScheduleChange {
    id: string;
    previousScheduledAt?: string | null;
    newScheduledAt?: string | null;
    reason: string;
    createdAt: string;
    changedByUser?: { name: string } | null;
}

interface TicketDetailData {
    id: string;
    protocol?: string | null;
    title: string;
    description?: string | null;
    priority: TicketPriority;
    status: TicketStatus;
    notesInternal?: string | null;
    contact: {
        id: string;
        name?: string | null;
        phone: string;
        email?: string | null;
        customerId?: string | null;
        businessId?: string | null;
        business?: { id: string; name: string; cnpj: string } | null;
    };
    customer?: { id: string; name: string; document?: string | null; businesses?: Array<{ id: string; name: string; cnpj: string }> } | null;
    assignedUser?: { id: string; name: string } | null;
    department?: { name: string } | null;
    serviceTopicId?: string | null;
    serviceTopic?: { id: string; name: string } | null;
    fieldService?: {
        id?: string;
        serviceType?: ServiceType;
        status?: FieldVisitStatus;
        equipment?: string | null;
        scheduledAt?: string | null;
        visitAddress?: string | null;
        visitWindowStart?: string | null;
        visitWindowEnd?: string | null;
        technicianId?: string | null;
        technician?: { id: string; name: string } | null;
        resolution?: string | null;
        result?: string | null;
        serviceDescription?: string | null;
        materialsUsed?: string | null;
        photos?: string[] | null;
        hoursSpent?: number | null;
        scheduleChanges?: ScheduleChange[];
    } | null;
    evaluation?: { rating: number; comment?: string | null } | null;
    timeline?: TimelineEvent[];
    createdAt: string;
    updatedAt: string;
}

export interface TicketFormState {
    title: string;
    status: TicketStatus;
    priority: TicketPriority;
    description: string;
    notesInternal: string;
    serviceType: ServiceType;
    fieldVisitStatus: FieldVisitStatus;
    equipment: string;
    technicianId: string;
    scheduledAt: string;
    scheduleChangeReason: string;
    visitAddress: string;
    visitWindowStart: string;
    visitWindowEnd: string;
    result: string;
    serviceDescription: string;
    materialsUsed: string;
    photos: string;
    hoursSpent: string;
}

interface CustomerFormState {
    customerName: string;
    customerDocument: string;
    contactName: string;
    contactPhone: string;
    businessName: string;
    businessCnpj: string;
}

const statusLabels: Record<TicketStatus, string> = {
    NEW: 'Novo',
    QUEUED: 'Na fila',
    IN_PROGRESS: 'Em andamento',
    WAITING_CUSTOMER: 'Aguardando cliente',
    WAITING_INTERNAL: 'Aguardando interno',
    SCHEDULED_FIELD_SERVICE: 'Chamado agendado',
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

const fieldVisitStatusLabels: Record<FieldVisitStatus, string> = {
    PENDING: 'Pendente',
    SCHEDULED: 'Agendada',
    IN_PROGRESS: 'Em atendimento',
    COMPLETED: 'Concluída',
    CANCELED: 'Cancelada',
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

export function buildTicketUpdatePayload(form: TicketFormState, role?: string | null) {
    const photos = form.photos
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
    const sharedCore = {
        status: form.status,
        notesInternal: form.notesInternal || null,
    };

    if (role === 'ATTENDANT') {
        return {
            ...sharedCore,
            title: form.title,
            description: form.description || null,
        };
    }

    const fieldService = {
        fieldVisitStatus: form.fieldVisitStatus,
        equipment: form.equipment || null,
        scheduledAt: fromDatetimeLocal(form.scheduledAt),
        scheduleChangeReason: form.scheduleChangeReason || null,
        visitAddress: form.visitAddress || null,
        visitWindowStart: fromDatetimeLocal(form.visitWindowStart),
        visitWindowEnd: fromDatetimeLocal(form.visitWindowEnd),
        result: form.result || null,
        resolution: form.result || null,
        serviceDescription: form.serviceDescription || null,
        materialsUsed: form.materialsUsed || null,
        photos,
        hoursSpent: form.hoursSpent ? Number(form.hoursSpent) : null,
    };

    if (role === 'TECHNICIAN') {
        return { ...sharedCore, ...fieldService };
    }

    return {
        ...sharedCore,
        ...fieldService,
        title: form.title,
        priority: form.priority,
        description: form.description || null,
        serviceType: form.serviceType,
        technicianId: form.technicianId || null,
    };
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

function CustomerEditModal({
    open,
    form,
    loading,
    onChange,
    onClose,
    onSubmit,
}: {
    open: boolean;
    form: CustomerFormState;
    loading: boolean;
    onChange: (next: CustomerFormState) => void;
    onClose: () => void;
    onSubmit: () => Promise<void>;
}) {
    const dialogRef = useDialogFocus<HTMLDivElement>(open, onClose);
    if (!open) return null;

    return (
        <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="customer-edit-title">
            <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-lifted">
                <div className="mb-5">
                    <h2 id="customer-edit-title" className="text-xl font-semibold text-foreground">Editar cliente do chamado</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Atualize os dados do cliente e do contato sem sair do chamado.
                    </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <label className="block space-y-1.5">
                        <span className="block text-sm font-medium text-foreground">Cliente / empresa</span>
                        <input
                            value={form.customerName}
                            onChange={(event) => onChange({ ...form, customerName: event.target.value })}
                            className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                        />
                    </label>
                    <label className="block space-y-1.5">
                        <span className="block text-sm font-medium text-foreground">Nome do contato</span>
                        <input
                            value={form.contactName}
                            onChange={(event) => onChange({ ...form, contactName: event.target.value })}
                            className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                        />
                    </label>
                    <label className="block space-y-1.5">
                        <span className="block text-sm font-medium text-foreground">Documento do cliente</span>
                        <input
                            value={form.customerDocument}
                            onChange={(event) => onChange({ ...form, customerDocument: event.target.value })}
                            placeholder="CPF ou CNPJ opcional"
                            className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                        />
                    </label>
                    <label className="block space-y-1.5">
                        <span className="block text-sm font-medium text-foreground">Telefone / WhatsApp</span>
                        <input
                            value={form.contactPhone}
                            onChange={(event) => onChange({ ...form, contactPhone: event.target.value })}
                            placeholder="DDD + numero"
                            className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                        />
                    </label>
                    <label className="block space-y-1.5">
                        <span className="block text-sm font-medium text-foreground">Empresa vinculada</span>
                        <input
                            value={form.businessName}
                            onChange={(event) => onChange({ ...form, businessName: event.target.value })}
                            placeholder="Opcional"
                            className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                        />
                    </label>
                    <label className="block space-y-1.5 md:col-span-2">
                        <span className="block text-sm font-medium text-foreground">CNPJ da empresa</span>
                        <input
                            value={form.businessCnpj}
                            onChange={(event) => onChange({ ...form, businessCnpj: event.target.value })}
                            placeholder="Opcional, somente quando houver empresa/CNPJ"
                            className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                        />
                        <span className="text-xs text-muted-foreground">Para pessoa fisica, deixe empresa e CNPJ em branco e use o campo Documento do cliente se quiser informar CPF.</span>
                    </label>
                </div>

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                        Cancelar
                    </Button>
                    <Button type="button" loading={loading} onClick={onSubmit}>
                        Salvar cliente
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default function TicketDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { showToast } = useToast();
    const [ticket, setTicket] = useState<TicketDetailData | null>(null);
    const [technicians, setTechnicians] = useState<UserOption[]>([]);
    const [form, setForm] = useState<TicketFormState | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingCustomer, setSavingCustomer] = useState(false);
    const [notifyingGroup, setNotifyingGroup] = useState(false);
    const [customerEditorOpen, setCustomerEditorOpen] = useState(false);
    const [customerForm, setCustomerForm] = useState<CustomerFormState>({
        customerName: '',
        customerDocument: '',
        contactName: '',
        contactPhone: '',
        businessName: '',
        businessCnpj: '',
    });
    const [error, setError] = useState<string | null>(null);
    const isManager = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
    const isTechnician = user?.role === 'TECHNICIAN';
    const assignedTechnicianId = ticket?.fieldService?.technician?.id || ticket?.fieldService?.technicianId || null;
    const isAssignedTechnician = Boolean(isTechnician && user?.id && assignedTechnicianId === user.id);
    const canEditTicketCore = Boolean(isManager || user?.role === 'ATTENDANT' || isAssignedTechnician);
    const canEditFieldService = Boolean(isManager || isAssignedTechnician);
    const canSaveTicket = Boolean(canEditTicketCore || canEditFieldService);

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
                    fieldVisitStatus: data.fieldService?.status || 'PENDING',
                    equipment: data.fieldService?.equipment || '',
                    technicianId: data.fieldService?.technician?.id || data.fieldService?.technicianId || '',
                    scheduledAt: toDatetimeLocal(data.fieldService?.scheduledAt),
                    scheduleChangeReason: '',
                    visitAddress: data.fieldService?.visitAddress || '',
                    visitWindowStart: toDatetimeLocal(data.fieldService?.visitWindowStart),
                    visitWindowEnd: toDatetimeLocal(data.fieldService?.visitWindowEnd),
                    result: data.fieldService?.result || data.fieldService?.resolution || '',
                    serviceDescription: data.fieldService?.serviceDescription || '',
                    materialsUsed: data.fieldService?.materialsUsed || '',
                    photos: Array.isArray(data.fieldService?.photos) ? data.fieldService.photos.join('\n') : '',
                    hoursSpent: data.fieldService?.hoursSpent?.toString() || '',
                });
            })
            .catch((err) => {
                if (!redirectOnUnauthorized(err, navigate)) {
                    const message = err instanceof Error ? err.message : 'Erro ao carregar chamado.';
                    setError(message);
                    showToast({ title: 'Erro ao carregar chamado', description: message, variant: 'error' });
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

    const openCustomerEditor = () => {
        if (!ticket) return;
        const business = ticket.contact.business || ticket.customer?.businesses?.[0] || null;
        setCustomerForm({
            customerName: ticket.customer?.name || ticket.contact.name || '',
            customerDocument: ticket.customer?.document || '',
            contactName: ticket.contact.name || '',
            contactPhone: ticket.contact.phone || '',
            businessName: business?.name || '',
            businessCnpj: business?.cnpj || '',
        });
        setCustomerEditorOpen(true);
    };

    const saveCustomerInfo = async () => {
        if (!id) return;
        setSavingCustomer(true);
        setError(null);

        try {
            const updated = await apiRequest<TicketDetailData>(`/api/tickets/${id}/customer-info`, {
                method: 'PATCH',
                body: JSON.stringify({
                    customerName: customerForm.customerName.trim() || null,
                    customerDocument: customerForm.customerDocument.trim() || null,
                    contactName: customerForm.contactName.trim() || null,
                    contactPhone: customerForm.contactPhone.trim() || null,
                    businessName: customerForm.businessName.trim() || null,
                    businessCnpj: customerForm.businessCnpj.trim() || null,
                }),
            });
            setTicket(updated);
            setCustomerEditorOpen(false);
            showToast({ title: 'Cliente atualizado', description: 'Os dados do cliente foram salvos no chamado.', variant: 'success' });
            loadTicket();
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Erro ao atualizar cliente.';
                setError(message);
                showToast({ title: 'Erro ao atualizar cliente', description: message, variant: 'error' });
            }
        } finally {
            setSavingCustomer(false);
        }
    };

    const saveTicket = async (event: FormEvent) => {
        event.preventDefault();
        if (!id || !form) return;
        setSaving(true);
        setError(null);

        try {
            const updated = await apiRequest<TicketDetailData>(`/api/tickets/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(buildTicketUpdatePayload(form, user?.role)),
            });
            setTicket(updated);
            showToast({ title: 'Chamado atualizado', description: 'As alterações foram salvas com sucesso.', variant: 'success' });
            loadTicket();
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Erro ao salvar chamado.';
                setError(message);
                showToast({ title: 'Erro ao salvar chamado', description: message, variant: 'error' });
            }
        } finally {
            setSaving(false);
        }
    };

    const sendTicketGroupNotification = async () => {
        if (!id) return;
        setNotifyingGroup(true);
        setError(null);

        try {
            const result = await apiRequest<{ ok: boolean; groupName?: string | null; groupId?: string }>(`/api/tickets/${id}/notify-group`, {
                method: 'POST',
            });
            showToast({
                title: 'Enviado para o grupo',
                description: result.groupName ? `Aviso enviado para ${result.groupName}.` : 'Aviso enviado para o grupo configurado.',
                variant: 'success',
            });
            loadTicket();
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Erro ao enviar aviso para o grupo.';
                setError(message);
                showToast({ title: 'Erro ao enviar para o grupo', description: message, variant: 'error' });
            }
        } finally {
            setNotifyingGroup(false);
        }
    };

    return (
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
            <SigmaSidebarIcon user={user} onLogout={logout} />
            <main className="flex-1 overflow-y-auto pb-28 md:pb-0">
                <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))] sm:gap-6 sm:p-6 lg:p-10">
                    <Link to="/tickets" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-semibold text-primary hover:text-primary-700">
                        ← Voltar para chamados
                    </Link>

                    {loading ? (
                        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]" aria-label="Carregando chamado">
                            <section className="space-y-6">
                                <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
                                    <Skeleton className="h-4 w-32" />
                                    <Skeleton className="mt-4 h-8 w-3/4" />
                                    <Skeleton className="mt-3 h-4 w-48" />
                                </div>
                                <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
                                    <Skeleton className="h-5 w-40" />
                                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                                        <Skeleton className="h-11 md:col-span-2" />
                                        <Skeleton className="h-11" />
                                        <Skeleton className="h-11" />
                                        <Skeleton className="h-28 md:col-span-2" />
                                    </div>
                                </div>
                            </section>
                            <aside className="space-y-6">
                                <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
                                    <Skeleton className="h-5 w-24" />
                                    <Skeleton className="mt-5 h-4 w-full" />
                                    <Skeleton className="mt-3 h-4 w-5/6" />
                                    <Skeleton className="mt-6 h-11 w-full" />
                                </div>
                            </aside>
                        </div>
                    ) : !ticket || !form ? (
                        <EmptyState
                            icon="confirmation_number"
                            title="Chamado não encontrado"
                            description={error || 'Não foi possível localizar os dados deste chamado.'}
                            actionLabel="Voltar para chamados"
                            onAction={() => navigate('/tickets')}
                        />
                    ) : (
                        <>
                            <header className="rounded-xl border border-border bg-surface p-4 sm:rounded-2xl sm:p-6">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-primary sm:text-sm">{ticket.protocol || `#${ticket.id.slice(0, 8)}`}</p>
                                        <h1 className="mt-1 break-words text-2xl font-bold text-foreground sm:mt-2 sm:text-3xl">{ticket.title}</h1>
                                        <p className="mt-1 text-sm text-muted-foreground sm:mt-2">
                                            {ticket.customer?.name || ticket.contact?.name || ticket.contact.phone}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {!isTechnician && <Link
                                            to={`/tasks?new=1&ticketId=${ticket.id}&contactId=${ticket.contact.id}${ticket.customer?.id ? `&customerId=${ticket.customer.id}` : ''}${ticket.serviceTopicId ? `&serviceTopicId=${ticket.serviceTopicId}` : ''}${ticket.fieldService?.id ? `&fieldServiceId=${ticket.fieldService.id}` : ''}`}
                                            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-foreground transition-colors hover:bg-surface-alt"
                                        >
                                            Criar tarefa
                                        </Link>}
                                        <StatusBadge status={ticket.status} />
                                        <PriorityBadge priority={ticket.priority} />
                                    </div>
                                </div>
                            </header>

                            {error && <div className="rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger-fg">{error}</div>}
                            {isTechnician && !isAssignedTechnician && (
                                <div
                                    role="status"
                                    className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning-fg"
                                >
                                    Este chamado está disponível somente para consulta porque está atribuído a outro técnico.
                                </div>
                            )}

                            <form onSubmit={saveTicket} className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
                                <section className="space-y-6">
                                    <div className="rounded-xl border border-border bg-surface p-4 sm:rounded-2xl sm:p-6">
                                        <h2 className="text-lg font-semibold text-foreground">{isTechnician ? 'Atualizar chamado' : 'Dados do chamado'}</h2>
                                        {isTechnician && <p className="mb-4 mt-1 text-sm text-muted-foreground">Altere o andamento e registre as observações da visita.</p>}
                                        <div className="grid gap-4 md:grid-cols-2">
                                            {!isTechnician && <label className="md:col-span-2">
                                                <span className="mb-1 block text-sm font-medium text-foreground">Título</span>
                                                <input disabled={!isManager && user?.role !== 'ATTENDANT'} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-muted-foreground" />
                                            </label>}
                                            <label className={isTechnician ? 'md:col-span-2' : undefined}>
                                                <span className="mb-1 block text-sm font-medium text-foreground">Status</span>
                                                <select disabled={!canEditTicketCore} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as TicketStatus })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-muted-foreground">
                                                    {statusOptions.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                                                </select>
                                            </label>
                                            {!isTechnician && <label>
                                                <span className="mb-1 block text-sm font-medium text-foreground">Prioridade</span>
                                                <select disabled={!isManager} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as TicketPriority })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-muted-foreground">
                                                    <option value="LOW">Baixa</option>
                                                    <option value="MEDIUM">Média</option>
                                                    <option value="HIGH">Alta</option>
                                                    <option value="CRITICAL">Crítica</option>
                                                </select>
                                            </label>}
                                            {!isTechnician && <label className="md:col-span-2">
                                                <span className="mb-1 block text-sm font-medium text-foreground">Descrição</span>
                                                <textarea disabled={!isManager && user?.role !== 'ATTENDANT'} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={5} className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-muted-foreground" />
                                            </label>}
                                            <label className="md:col-span-2">
                                                <span className="mb-1 block text-sm font-medium text-foreground">Observações internas</span>
                                                <textarea disabled={!canEditTicketCore} value={form.notesInternal} onChange={(event) => setForm({ ...form, notesInternal: event.target.value })} rows={4} placeholder="Registre o que foi verificado, realizado ou ficou pendente." className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-muted-foreground" />
                                            </label>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-border bg-surface p-4 sm:rounded-2xl sm:p-6">
                                        <h2 className="mb-4 text-lg font-semibold text-foreground">{isTechnician ? 'Agenda da visita' : 'Agenda técnica'}</h2>
                                        <fieldset disabled={!canEditFieldService} className="grid gap-4 md:grid-cols-2">
                                            {!isTechnician && <label>
                                                <span className="mb-1 block text-sm font-medium text-foreground">Tipo</span>
                                                <select disabled={!isManager} value={form.serviceType} onChange={(event) => setForm({ ...form, serviceType: event.target.value as ServiceType })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-muted-foreground">
                                                    <option value="REMOTO">Remoto</option>
                                                    <option value="PRESENCIAL">Presencial</option>
                                                    <option value="HIBRIDO">Híbrido</option>
                                                </select>
                                            </label>}
                                            <label>
                                                <span className="mb-1 block text-sm font-medium text-foreground">Status do chamado</span>
                                                <select disabled={!canEditFieldService} value={form.fieldVisitStatus} onChange={(event) => setForm({ ...form, fieldVisitStatus: event.target.value as FieldVisitStatus })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-muted-foreground">
                                                    {Object.entries(fieldVisitStatusLabels).map(([value, label]) => (
                                                        <option key={value} value={value}>{label}</option>
                                                    ))}
                                                </select>
                                            </label>
                                            {!isTechnician && <label>
                                                <span className="mb-1 block text-sm font-medium text-foreground">Técnico</span>
                                                <select disabled={!isManager} value={form.technicianId} onChange={(event) => setForm({ ...form, technicianId: event.target.value })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-muted-foreground">
                                                    <option value="">Não atribuído</option>
                                                    {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}
                                                </select>
                                            </label>}
                                            <label>
                                                <span className="mb-1 block text-sm font-medium text-foreground">Equipamento</span>
                                                <input value={form.equipment} onChange={(event) => setForm({ ...form, equipment: event.target.value })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
                                            </label>
                                            <label>
                                                <span className="mb-1 block text-sm font-medium text-foreground">Data combinada</span>
                                                <input type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
                                            </label>
                                            <label>
                                                <span className="mb-1 block text-sm font-medium text-foreground">Endereço do chamado</span>
                                                <input value={form.visitAddress} onChange={(event) => setForm({ ...form, visitAddress: event.target.value })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
                                            </label>
                                            {!isTechnician && <label>
                                                <span className="mb-1 block text-sm font-medium text-foreground">Início da janela</span>
                                                <input type="datetime-local" value={form.visitWindowStart} onChange={(event) => setForm({ ...form, visitWindowStart: event.target.value })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
                                            </label>}
                                            {!isTechnician && <label>
                                                <span className="mb-1 block text-sm font-medium text-foreground">Fim da janela</span>
                                                <input type="datetime-local" value={form.visitWindowEnd} onChange={(event) => setForm({ ...form, visitWindowEnd: event.target.value })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
                                            </label>}
                                            {form.scheduledAt !== toDatetimeLocal(ticket.fieldService?.scheduledAt) && (
                                                <label className="md:col-span-2">
                                                    <span className="mb-1 block text-sm font-medium text-foreground">Motivo da alteração de agenda</span>
                                                    <textarea
                                                        value={form.scheduleChangeReason}
                                                        onChange={(event) => setForm({ ...form, scheduleChangeReason: event.target.value })}
                                                        rows={3}
                                                        required
                                                        placeholder="Explique por que a data combinada foi alterada."
                                                        className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                                                    />
                                                </label>
                                            )}
                                        </fieldset>
                                    </div>

                                    <div className="rounded-xl border border-border bg-surface p-4 sm:rounded-2xl sm:p-6">
                                        <h2 className="mb-4 text-lg font-semibold text-foreground">Execução do chamado</h2>
                                        <fieldset disabled={!canEditFieldService} className="grid gap-4 md:grid-cols-2">
                                            <label>
                                                <span className="mb-1 block text-sm font-medium text-foreground">Tempo gasto (horas)</span>
                                                <input type="number" min="0" step="0.25" value={form.hoursSpent} onChange={(event) => setForm({ ...form, hoursSpent: event.target.value })} className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
                                            </label>
                                            <label>
                                                <span className="mb-1 block text-sm font-medium text-foreground">Resultado</span>
                                                <input value={form.result} onChange={(event) => setForm({ ...form, result: event.target.value })} placeholder="Ex.: resolvido, aguardando peça..." className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
                                            </label>
                                            <label className="md:col-span-2">
                                                <span className="mb-1 block text-sm font-medium text-foreground">Serviço executado</span>
                                                <textarea value={form.serviceDescription} onChange={(event) => setForm({ ...form, serviceDescription: event.target.value })} rows={4} className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
                                            </label>
                                            <label className="md:col-span-2">
                                                <span className="mb-1 block text-sm font-medium text-foreground">Materiais utilizados</span>
                                                <textarea value={form.materialsUsed} onChange={(event) => setForm({ ...form, materialsUsed: event.target.value })} rows={3} placeholder="Opcional" className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
                                            </label>
                                            <label className="md:col-span-2">
                                                <span className="mb-1 block text-sm font-medium text-foreground">Fotos / anexos</span>
                                                <textarea value={form.photos} onChange={(event) => setForm({ ...form, photos: event.target.value })} rows={3} placeholder="Cole uma URL por linha. Upload de arquivos pode entrar em uma próxima etapa." className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
                                            </label>
                                        </fieldset>
                                    </div>
                                    {isTechnician && (
                                        <Button type="submit" loading={saving} disabled={!canSaveTicket} className="w-full">
                                            Salvar chamado
                                        </Button>
                                    )}
                                </section>

                                <aside className="space-y-6">
                                    <div className="rounded-xl border border-border bg-surface p-4 sm:rounded-2xl sm:p-6">
                                        <h2 className="mb-4 text-lg font-semibold text-foreground">{isTechnician ? 'Cliente' : 'Resumo'}</h2>
                                        <dl className="space-y-3 text-sm">
                                            <div><dt className="text-muted-foreground">Contato</dt><dd className="font-medium text-foreground">{ticket.contact.name || ticket.contact.phone}</dd></div>
                                            {!isTechnician && <div><dt className="text-muted-foreground">Departamento</dt><dd className="font-medium text-foreground">{ticket.department?.name || 'Não informado'}</dd></div>}
                                            {!isTechnician && <div><dt className="text-muted-foreground">Responsável</dt><dd className="font-medium text-foreground">{ticket.assignedUser?.name || 'Não atribuído'}</dd></div>}
                                            <div><dt className="text-muted-foreground">Criado em</dt><dd className="font-medium text-foreground">{formatDate(ticket.createdAt)}</dd></div>
                                        </dl>
                                        {!isTechnician && <Button
                                            type="button"
                                            variant="outline"
                                            onClick={openCustomerEditor}
                                            className="mt-5 w-full"
                                        >
                                            Editar cliente
                                        </Button>}
                                        {!isTechnician && <Button type="submit" loading={saving} disabled={!canSaveTicket} className="mt-3 w-full">
                                            Salvar alterações
                                        </Button>}
                                        {!isTechnician && <Button
                                            type="button"
                                            variant="secondary"
                                            loading={notifyingGroup}
                                            onClick={sendTicketGroupNotification}
                                            className="mt-3 w-full"
                                        >
                                            Enviar para grupo
                                        </Button>}
                                    </div>

                                    {!isTechnician && <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
                                        <h2 className="mb-4 text-lg font-semibold text-foreground">CSAT</h2>
                                        {ticket.evaluation ? (
                                            <div className="space-y-2 text-sm">
                                                <Stars rating={ticket.evaluation.rating} />
                                                <p className="text-muted-foreground">{ticket.evaluation.comment || 'Sem comentário.'}</p>
                                            </div>
                                        ) : (
                                            <EmptyState
                                                icon="sentiment_satisfied"
                                                title="Sem avaliação registrada"
                                                description="O CSAT aparecerá aqui quando o cliente avaliar o atendimento."
                                            />
                                        )}
                                    </div>}

                                    {!isTechnician && <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
                                        <h2 className="mb-4 text-lg font-semibold text-foreground">Alterações de agenda</h2>
                                        {ticket.fieldService?.scheduleChanges?.length ? (
                                            <div className="space-y-4">
                                                {ticket.fieldService.scheduleChanges.map((change) => (
                                                    <div key={change.id} className="rounded-xl border border-border bg-surface-alt p-3 text-sm">
                                                        <p className="font-semibold text-foreground">
                                                            {formatDate(change.previousScheduledAt)} → {formatDate(change.newScheduledAt)}
                                                        </p>
                                                        <p className="mt-1 text-muted-foreground">{change.reason}</p>
                                                        <p className="mt-2 text-xs text-muted-foreground">
                                                            {change.changedByUser?.name || 'Sistema'} em {formatDate(change.createdAt)}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <EmptyState
                                                icon="schedule"
                                                title="Sem alterações"
                                                description="Quando a data combinada mudar, o motivo ficará registrado aqui."
                                            />
                                        )}
                                    </div>}

                                    {!isTechnician && <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
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
                                            <EmptyState
                                                icon="schedule"
                                                title="Sem eventos registrados"
                                                description="As mudanças de status e atualizações do chamado aparecerão nesta timeline."
                                            />
                                        )}
                                    </div>}
                                </aside>
                            </form>
                        </>
                    )}
                </div>
            </main>
            <CustomerEditModal
                open={customerEditorOpen}
                form={customerForm}
                loading={savingCustomer}
                onChange={setCustomerForm}
                onClose={() => setCustomerEditorOpen(false)}
                onSubmit={saveCustomerInfo}
            />
        </div>
    );
}
