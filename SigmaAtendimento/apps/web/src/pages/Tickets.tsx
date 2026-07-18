import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SigmaSidebarIcon } from '../components/sigma/SigmaSidebarIcon';
import { StatusBadge, PriorityBadge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { TableSkeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';
import { useAuth } from '../lib/auth';

type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type TicketChannel = 'WHATSAPP' | 'PHONE' | 'EMAIL' | 'PRESENCIAL' | 'OTHER';
type ServiceType = 'REMOTO' | 'PRESENCIAL' | 'HIBRIDO';

export interface Ticket {
    id: string;
    protocol?: string;
    title: string;
    description: string;
    priority: TicketPriority;
    status: 'NEW' | 'QUEUED' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'WAITING_INTERNAL' | 'SCHEDULED_FIELD_SERVICE' | 'RESOLVED' | 'CLOSED' | 'CANCELED';
    contact: { name?: string | null; phone: string };
    customer?: { name: string } | null;
    assignedUser?: { name?: string; nome?: string };
    department?: { name?: string; nome?: string };
    fieldService?: {
        onSiteRequired?: boolean;
        status?: 'PENDING' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';
        scheduledAt?: string | null;
        visitAddress?: string | null;
        visitWindowStart?: string | null;
        visitWindowEnd?: string | null;
        technician?: { name?: string; nome?: string } | null;
    } | null;
    createdAt: string;
}

interface UserOption {
    id: string;
    name: string;
    role: string;
    active?: boolean;
}

interface DepartmentOption {
    id: string;
    name: string;
    active?: boolean;
}

interface ContactOption {
    id: string;
    name?: string | null;
    phone: string;
    customerId?: string | null;
    businessId?: string | null;
    customer?: { name?: string | null } | null;
    business?: { name?: string | null; cnpj?: string | null } | null;
}

interface CustomerCreateResult {
    id: string;
    name: string;
    businesses?: Array<{ id: string; name: string; cnpj: string }>;
}

type ManualTicketPayload = {
    contactId?: string;
    customerId?: string | null;
    newCustomer?: {
        customerName: string;
        document?: string | null;
        contactName: string;
        phone: string;
        email?: string | null;
        businessName?: string | null;
        cnpj?: string | null;
    };
    title: string;
    priority: TicketPriority;
    channel: TicketChannel;
    description?: string | null;
    category?: string | null;
    assignedUserId?: string | null;
    departmentId?: string | null;
    technicianId?: string | null;
    scheduledAt?: string | null;
    visitAddress?: string | null;
    equipment?: string | null;
    notesInternal?: string | null;
    serviceType?: ServiceType;
    onSiteRequired?: boolean;
    fieldVisitStatus?: 'PENDING' | 'SCHEDULED';
};

const fieldVisitStatusLabels: Record<string, string> = {
    PENDING: 'Pendente',
    SCHEDULED: 'Agendada',
    IN_PROGRESS: 'Em atendimento',
    COMPLETED: 'Concluída',
    CANCELED: 'Cancelada',
};

const priorityLabels: Record<TicketPriority, string> = {
    LOW: 'Baixa',
    MEDIUM: 'Media',
    HIGH: 'Alta',
    CRITICAL: 'Critica',
};

const channelLabels: Record<TicketChannel, string> = {
    WHATSAPP: 'WhatsApp',
    PHONE: 'Telefone',
    EMAIL: 'E-mail',
    PRESENCIAL: 'Presencial',
    OTHER: 'Outro',
};

const serviceTypeLabels: Record<ServiceType, string> = {
    REMOTO: 'Remoto',
    PRESENCIAL: 'Presencial',
    HIBRIDO: 'Hibrido',
};

function contactLabel(contact: ContactOption) {
    const person = contact.name || contact.phone;
    const company = contact.business?.name || contact.customer?.name;
    const cnpj = contact.business?.cnpj;
    return [person, company ? `| ${company}` : null, cnpj ? `(${cnpj})` : null].filter(Boolean).join(' ');
}

function formatVisitDate(ticket: Ticket) {
    const fieldService = ticket.fieldService;
    if (!fieldService?.onSiteRequired) return 'N/A (Remoto)';

    if (fieldService.scheduledAt) {
        return new Date(fieldService.scheduledAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    if (fieldService.visitWindowStart && fieldService.visitWindowEnd) {
        const start = new Date(fieldService.visitWindowStart);
        const end = new Date(fieldService.visitWindowEnd);
        return `${start.toLocaleDateString('pt-BR')} ${start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}-${end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }

    return 'Não definido';
}

interface ManualTicketModalProps {
    open: boolean;
    contacts: ContactOption[];
    contactsLoading: boolean;
    contactQuery: string;
    technicians: Array<{ id: string; name: string; active?: boolean }>;
    users: UserOption[];
    departments: DepartmentOption[];
    loading: boolean;
    error: string | null;
    onContactQueryChange: (query: string) => void;
    onClose: () => void;
    onSubmit: (payload: ManualTicketPayload) => Promise<void>;
}

function ManualTicketModal({
    open,
    contacts,
    contactsLoading,
    contactQuery,
    technicians,
    users,
    departments,
    loading,
    error,
    onContactQueryChange,
    onClose,
    onSubmit,
}: ManualTicketModalProps) {
    const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('existing');
    const [contactId, setContactId] = useState('');
    const [newCustomerName, setNewCustomerName] = useState('');
    const [newCustomerDocument, setNewCustomerDocument] = useState('');
    const [newContactName, setNewContactName] = useState('');
    const [newContactPhone, setNewContactPhone] = useState('');
    const [newContactEmail, setNewContactEmail] = useState('');
    const [newBusinessName, setNewBusinessName] = useState('');
    const [newBusinessCnpj, setNewBusinessCnpj] = useState('');
    const [title, setTitle] = useState('');
    const [priority, setPriority] = useState<TicketPriority>('MEDIUM');
    const [channel, setChannel] = useState<TicketChannel>('PHONE');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [assignedUserId, setAssignedUserId] = useState('');
    const [departmentId, setDepartmentId] = useState('');
    const [externalService, setExternalService] = useState(true);
    const [serviceType, setServiceType] = useState<ServiceType>('PRESENCIAL');
    const [technicianId, setTechnicianId] = useState('');
    const [scheduledAt, setScheduledAt] = useState('');
    const [visitAddress, setVisitAddress] = useState('');
    const [equipment, setEquipment] = useState('');
    const [notesInternal, setNotesInternal] = useState('');
    const titleInputRef = useRef<HTMLInputElement>(null);
    const dialogRef = useDialogFocus<HTMLDivElement>(open, onClose);

    useEffect(() => {
        if (!open) return;
        setCustomerMode('existing');
        setContactId('');
        setNewCustomerName('');
        setNewCustomerDocument('');
        setNewContactName('');
        setNewContactPhone('');
        setNewContactEmail('');
        setNewBusinessName('');
        setNewBusinessCnpj('');
        setTitle('');
        setPriority('MEDIUM');
        setChannel('PHONE');
        setDescription('');
        setCategory('');
        setAssignedUserId('');
        setDepartmentId('');
        setExternalService(true);
        setServiceType('PRESENCIAL');
        setTechnicianId(technicians[0]?.id || '');
        setScheduledAt('');
        setVisitAddress('');
        setEquipment('');
        setNotesInternal('');
        onContactQueryChange('');
        window.setTimeout(() => titleInputRef.current?.focus(), 0);
    }, [open, technicians, onContactQueryChange]);

    useEffect(() => {
        if (!open) return;
        if (contacts.length === 0) {
            setContactId('');
            return;
        }
        if (!contactId || !contacts.some((contact) => contact.id === contactId)) {
            setContactId(contacts[0].id);
        }
    }, [open, contactId, contacts]);

    const selectedContact = contacts.find((contact) => contact.id === contactId) || null;
    const canSubmitCustomer = customerMode === 'existing'
        ? Boolean(contactId)
        : Boolean(newCustomerName.trim() && newContactPhone.trim());
    const newCustomerBusinessName = newBusinessName.trim();

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!canSubmitCustomer || !title.trim()) return;
        await onSubmit({
            ...(customerMode === 'existing'
                ? {
                    contactId,
                    customerId: selectedContact?.customerId || null,
                }
                : {
                    newCustomer: {
                        customerName: newCustomerName.trim(),
                        document: newCustomerDocument.trim() || null,
                        contactName: newContactName.trim() || newCustomerName.trim(),
                        phone: newContactPhone.trim(),
                        email: newContactEmail.trim() || null,
                        businessName: newCustomerBusinessName || null,
                        cnpj: newBusinessCnpj.replace(/\D/g, '') || null,
                    },
                }),
            title: title.trim(),
            priority,
            channel,
            description: description.trim() || null,
            category: category.trim() || null,
            assignedUserId: assignedUserId || (externalService && technicianId ? technicianId : null),
            departmentId: departmentId || null,
            notesInternal: notesInternal.trim() || null,
            ...(externalService ? {
                serviceType,
                onSiteRequired: serviceType !== 'REMOTO',
                technicianId: technicianId || null,
                scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
                visitAddress: visitAddress.trim() || null,
                equipment: equipment.trim() || null,
                fieldVisitStatus: scheduledAt ? 'SCHEDULED' : 'PENDING',
            } : {}),
        });
    };

    if (!open) return null;

    return (
        <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="manual-ticket-title">
            <form onSubmit={submit} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-lifted">
                <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                        <h2 id="manual-ticket-title" className="text-xl font-semibold text-foreground">Criar chamado manual</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Para atendimentos abertos fora do WhatsApp ou antes do cliente chamar no suporte.
                        </p>
                    </div>
                    <span className="inline-flex w-fit rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
                        Sem conversa vinculada
                    </span>
                </div>

                <div className="space-y-5">
                    <div className="rounded-xl border border-border bg-surface-alt p-4">
                        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-sm font-semibold text-foreground">Cliente</p>
                                <p className="mt-1 text-xs text-muted-foreground">Use um contato existente ou cadastre o cliente sem sair do chamado.</p>
                            </div>
                            <div className="inline-flex rounded-xl border border-border bg-surface p-1">
                                <button
                                    type="button"
                                    onClick={() => setCustomerMode('existing')}
                                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${customerMode === 'existing' ? 'bg-primary-solid text-primary-solid-fg' : 'text-muted-foreground hover:bg-surface-alt hover:text-foreground'}`}
                                >
                                    Contato existente
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCustomerMode('new')}
                                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${customerMode === 'new' ? 'bg-primary-solid text-primary-solid-fg' : 'text-muted-foreground hover:bg-surface-alt hover:text-foreground'}`}
                                >
                                    Novo cliente
                                </button>
                            </div>
                        </div>

                        {customerMode === 'existing' ? (
                            <div className="grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                                <Input
                                    label="Buscar contato"
                                    value={contactQuery}
                                    onChange={(event) => onContactQueryChange(event.target.value)}
                                    placeholder="Nome, telefone ou e-mail"
                                />

                                <label className="block space-y-1.5">
                                    <span className="block text-sm font-medium text-foreground">Contato</span>
                                    <select
                                        value={contactId}
                                        onChange={(event) => setContactId(event.target.value)}
                                        disabled={contactsLoading || contacts.length === 0}
                                        className="h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
                                        required={customerMode === 'existing'}
                                    >
                                        {contacts.length === 0 && (
                                            <option value="">{contactsLoading ? 'Carregando contatos...' : 'Nenhum contato encontrado'}</option>
                                        )}
                                        {contacts.map((contact) => (
                                            <option key={contact.id} value={contact.id}>{contactLabel(contact)}</option>
                                        ))}
                                    </select>
                                    {selectedContact?.business?.cnpj && (
                                        <span className="text-xs text-muted-foreground">CNPJ vinculado: {selectedContact.business.cnpj}</span>
                                    )}
                                </label>
                            </div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2">
                                <Input
                                    label="Cliente / empresa"
                                    value={newCustomerName}
                                    onChange={(event) => setNewCustomerName(event.target.value)}
                                    placeholder="Nome do cliente"
                                    required={customerMode === 'new'}
                                />
                                <Input
                                    label="Documento do cliente"
                                    value={newCustomerDocument}
                                    onChange={(event) => setNewCustomerDocument(event.target.value)}
                                    placeholder="CPF ou CNPJ opcional"
                                />
                                <Input
                                    label="Nome do contato"
                                    value={newContactName}
                                    onChange={(event) => setNewContactName(event.target.value)}
                                    placeholder="Pessoa responsavel"
                                />
                                <Input
                                    label="Telefone do contato"
                                    value={newContactPhone}
                                    onChange={(event) => setNewContactPhone(event.target.value)}
                                    placeholder="DDD + numero"
                                    required={customerMode === 'new'}
                                />
                                <Input
                                    label="E-mail do contato"
                                    type="email"
                                    value={newContactEmail}
                                    onChange={(event) => setNewContactEmail(event.target.value)}
                                    placeholder="Opcional"
                                />
                                <Input
                                    label="Empresa vinculada"
                                    value={newBusinessName}
                                    onChange={(event) => setNewBusinessName(event.target.value)}
                                    placeholder="Opcional, quando houver empresa"
                                />
                                <Input
                                    label="CNPJ da empresa"
                                    value={newBusinessCnpj}
                                    onChange={(event) => setNewBusinessCnpj(event.target.value)}
                                    placeholder="Opcional, somente se houver CNPJ"
                                />
                            </div>
                        )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <Input
                            ref={titleInputRef}
                            label="Titulo do chamado"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder="Ex.: Instalar SAT, configurar impressora..."
                            required
                        />

                        <label className="block space-y-1.5">
                            <span className="block text-sm font-medium text-foreground">Prioridade</span>
                            <select
                                value={priority}
                                onChange={(event) => setPriority(event.target.value as TicketPriority)}
                                className="h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/40"
                            >
                                {Object.entries(priorityLabels).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </select>
                        </label>

                        <label className="block space-y-1.5">
                            <span className="block text-sm font-medium text-foreground">Canal de abertura</span>
                            <select
                                value={channel}
                                onChange={(event) => setChannel(event.target.value as TicketChannel)}
                                className="h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/40"
                            >
                                {Object.entries(channelLabels).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </select>
                        </label>

                        <Input
                            label="Categoria"
                            value={category}
                            onChange={(event) => setCategory(event.target.value)}
                            placeholder="Opcional"
                        />

                        <label className="block space-y-1.5">
                            <span className="block text-sm font-medium text-foreground">Departamento</span>
                            <select
                                value={departmentId}
                                onChange={(event) => setDepartmentId(event.target.value)}
                                className="h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/40"
                            >
                                <option value="">Sem departamento</option>
                                {departments.filter((department) => department.active ?? true).map((department) => (
                                    <option key={department.id} value={department.id}>{department.name}</option>
                                ))}
                            </select>
                        </label>

                        <label className="block space-y-1.5">
                            <span className="block text-sm font-medium text-foreground">Responsavel</span>
                            <select
                                value={assignedUserId}
                                onChange={(event) => setAssignedUserId(event.target.value)}
                                className="h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/40"
                            >
                                <option value="">Definir depois</option>
                                {users.filter((userOption) => userOption.active ?? true).map((userOption) => (
                                    <option key={userOption.id} value={userOption.id}>{userOption.name}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <label className="block space-y-1.5">
                        <span className="block text-sm font-medium text-foreground">Descricao</span>
                        <textarea
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            rows={3}
                            className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/40"
                            placeholder="Descreva o motivo do chamado, combinado com o cliente ou pendencia interna."
                        />
                    </label>

                    <div className="rounded-xl border border-border bg-surface-alt p-4">
                        <label className="mb-4 flex items-start gap-3">
                            <input
                                type="checkbox"
                                checked={externalService}
                                onChange={(event) => setExternalService(event.target.checked)}
                                className="mt-1 h-4 w-4 accent-primary"
                            />
                            <span>
                                <span className="block text-sm font-semibold text-foreground">Criar como atendimento externo / agenda</span>
                                <span className="block text-xs text-muted-foreground">Use para visita tecnica, instalacao, treinamento ou atendimento agendado.</span>
                            </span>
                        </label>

                        {externalService && (
                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="block space-y-1.5">
                                    <span className="block text-sm font-medium text-foreground">Tipo de atendimento</span>
                                    <select
                                        value={serviceType}
                                        onChange={(event) => setServiceType(event.target.value as ServiceType)}
                                        className="h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/40"
                                    >
                                        {Object.entries(serviceTypeLabels).map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </select>
                                </label>

                                <label className="block space-y-1.5">
                                    <span className="block text-sm font-medium text-foreground">Tecnico</span>
                                    <select
                                        value={technicianId}
                                        onChange={(event) => setTechnicianId(event.target.value)}
                                        className="h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/40"
                                    >
                                        <option value="">Definir depois</option>
                                        {technicians.filter((tech) => tech.active ?? true).map((tech) => (
                                            <option key={tech.id} value={tech.id}>{tech.name}</option>
                                        ))}
                                    </select>
                                </label>

                                <label className="block space-y-1.5">
                                    <span className="block text-sm font-medium text-foreground">Data e hora combinada</span>
                                    <input
                                        type="datetime-local"
                                        value={scheduledAt}
                                        onChange={(event) => setScheduledAt(event.target.value)}
                                        className="h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/40"
                                    />
                                </label>

                                <Input
                                    label="Equipamento / sistema"
                                    value={equipment}
                                    onChange={(event) => setEquipment(event.target.value)}
                                    placeholder="Opcional"
                                />

                                <label className="block space-y-1.5 md:col-span-2">
                                    <span className="block text-sm font-medium text-foreground">Endereco / local do atendimento</span>
                                    <input
                                        value={visitAddress}
                                        onChange={(event) => setVisitAddress(event.target.value)}
                                        placeholder="Opcional"
                                        className="h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/40"
                                    />
                                </label>
                            </div>
                        )}
                    </div>

                    <label className="block space-y-1.5">
                        <span className="block text-sm font-medium text-foreground">Observacoes internas</span>
                        <textarea
                            value={notesInternal}
                            onChange={(event) => setNotesInternal(event.target.value)}
                            rows={3}
                            className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/40"
                            placeholder="Informacoes para equipe, combinados, restricoes de horario..."
                        />
                    </label>

                    {error && (
                        <div className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger-fg">
                            {error}
                        </div>
                    )}
                </div>

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                        Cancelar
                    </Button>
                    <Button type="submit" loading={loading} disabled={!canSubmitCustomer || !title.trim()}>
                        Criar chamado
                    </Button>
                </div>
            </form>
        </div>
    );
}

export default function Tickets() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { showToast } = useToast();
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [priorityFilter, setPriorityFilter] = useState<string>('');
    const [technicianFilter, setTechnicianFilter] = useState<string>('');
    const [fieldVisitStatusFilter, setFieldVisitStatusFilter] = useState<string>('');
    const [visitOnly, setVisitOnly] = useState(true);
    const [technicians, setTechnicians] = useState<Array<{ id: string; name: string; active?: boolean }>>([]);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [departments, setDepartments] = useState<DepartmentOption[]>([]);
    const [contacts, setContacts] = useState<ContactOption[]>([]);
    const [contactQuery, setContactQuery] = useState('');
    const [contactsLoading, setContactsLoading] = useState(false);
    const [manualTicketOpen, setManualTicketOpen] = useState(false);
    const [manualTicketLoading, setManualTicketLoading] = useState(false);
    const [manualTicketError, setManualTicketError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadTickets = () => {
        setIsLoading(true);
        setError(null);
        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);
        if (priorityFilter) params.set('priority', priorityFilter);
        if (technicianFilter) params.set('technicianId', technicianFilter);
        if (fieldVisitStatusFilter) params.set('fieldVisitStatus', fieldVisitStatusFilter);
        if (visitOnly) params.set('visitOnly', 'true');

        apiRequest<Ticket[] | { data: Ticket[] }>(`/api/tickets?${params.toString()}`)
            .then(data => {
                if (Array.isArray(data)) {
                    setTickets(data);
                } else {
                    setTickets(data?.data || []);
                }
            })
            .catch(err => {
                if (!redirectOnUnauthorized(err, navigate)) {
                    console.error(err);
                    const message = err instanceof Error ? err.message : 'Erro ao carregar chamados.';
                    setError(message);
                    showToast({ title: 'Erro ao carregar chamados', description: message, variant: 'error' });
                }
            })
            .finally(() => setIsLoading(false));
    };

    useEffect(() => {
        loadTickets();
    }, [statusFilter, priorityFilter, technicianFilter, fieldVisitStatusFilter, visitOnly]);

    useEffect(() => {
        apiRequest<UserOption[]>('/api/users')
            .then((data) => {
                setUsers(Array.isArray(data) ? data : []);
                const activeTechnicians = Array.isArray(data)
                    ? data
                        .filter((item) => item.role === 'TECHNICIAN' && (item.active ?? true))
                        .map((item) => ({ id: item.id, name: item.name, active: item.active }))
                    : [];
                setTechnicians(activeTechnicians);
            })
            .catch((err) => {
                if (!redirectOnUnauthorized(err, navigate)) {
                    console.error(err);
                }
            });
    }, []);

    useEffect(() => {
        apiRequest<DepartmentOption[]>('/api/departments')
            .then((data) => setDepartments(Array.isArray(data) ? data : []))
            .catch((err) => {
                if (!redirectOnUnauthorized(err, navigate)) {
                    console.error(err);
                }
            });
    }, [navigate]);

    useEffect(() => {
        if (!manualTicketOpen) return;
        setContactsLoading(true);
        const timeoutId = window.setTimeout(() => {
            const params = new URLSearchParams({ take: '80' });
            const trimmedQuery = contactQuery.trim();
            if (trimmedQuery) params.set('query', trimmedQuery);

            apiRequest<ContactOption[]>(`/api/contacts?${params.toString()}`)
                .then((data) => setContacts(Array.isArray(data) ? data : []))
                .catch((err) => {
                    if (!redirectOnUnauthorized(err, navigate)) {
                        const message = err instanceof Error ? err.message : 'Erro ao buscar contatos.';
                        setManualTicketError(message);
                    }
                })
                .finally(() => setContactsLoading(false));
        }, 250);

        return () => window.clearTimeout(timeoutId);
    }, [manualTicketOpen, contactQuery, navigate]);

    const handleStatusUpdate = (id: string, newStatus: string) => {
        apiRequest(`/api/tickets/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: newStatus })
        })
            .then(() => {
                showToast({ title: 'Chamado atualizado', description: 'O status do chamado foi alterado.', variant: 'success' });
                loadTickets();
            })
            .catch((err) => {
                if (!redirectOnUnauthorized(err, navigate)) {
                    const message = err instanceof Error ? err.message : 'Erro ao atualizar chamado.';
                    showToast({ title: 'Erro ao atualizar chamado', description: message, variant: 'error' });
                }
            });
    }

    const handleCreateManualTicket = async (payload: ManualTicketPayload) => {
        setManualTicketLoading(true);
        setManualTicketError(null);

        try {
            let contactId = payload.contactId;
            let customerId = payload.customerId || null;

            if (payload.newCustomer) {
                const customer = await apiRequest<CustomerCreateResult>('/api/customers', {
                    method: 'POST',
                    body: JSON.stringify({
                        name: payload.newCustomer.customerName,
                        document: payload.newCustomer.document || null,
                        status: 'ATIVO',
                        businesses: payload.newCustomer.cnpj
                            ? [{
                                name: payload.newCustomer.businessName || payload.newCustomer.customerName,
                                cnpj: payload.newCustomer.cnpj,
                            }]
                            : [],
                    }),
                });
                customerId = customer.id;
                const businessId = customer.businesses?.[0]?.id || null;
                const contact = await apiRequest<ContactOption>('/api/contacts', {
                    method: 'POST',
                    body: JSON.stringify({
                        name: payload.newCustomer.contactName,
                        phone: payload.newCustomer.phone,
                        email: payload.newCustomer.email || null,
                        customerId,
                        businessId,
                    }),
                });
                contactId = contact.id;
            }

            if (!contactId) {
                throw new Error('Selecione ou cadastre um contato para criar o chamado.');
            }

            const { newCustomer: _newCustomer, ...ticketPayload } = payload;
            const created = await apiRequest<Ticket>('/api/tickets', {
                method: 'POST',
                body: JSON.stringify({
                    ...ticketPayload,
                    contactId,
                    customerId,
                }),
            });
            setManualTicketOpen(false);
            showToast({
                title: 'Chamado criado',
                description: payload.newCustomer
                    ? 'Cliente, contato e chamado foram cadastrados.'
                    : 'O chamado manual foi registrado no painel.',
                variant: 'success',
            });
            loadTickets();
            navigate(`/tickets/${created.id}`);
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Erro ao criar chamado.';
                setManualTicketError(message);
                showToast({ title: 'Erro ao criar chamado', description: message, variant: 'error' });
            }
        } finally {
            setManualTicketLoading(false);
        }
    };

    return (
        <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden">
            <SigmaSidebarIcon user={user} onLogout={logout} />
            <main className="flex-1 flex flex-col overflow-y-auto p-4 pb-20 md:p-8 md:pb-8">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-display font-bold text-foreground mb-2">Chamados e Atendimentos</h1>
                        <p className="text-muted-foreground">Gerencie ordens de serviço presenciais e remotas</p>
                    </div>
                    <Button type="button" onClick={() => {
                        setManualTicketError(null);
                        setManualTicketOpen(true);
                    }}>
                        Criar chamado
                    </Button>
                </div>

                <div className="grid gap-4 mb-6 bg-surface p-4 rounded-xl border border-border shadow-card md:grid-cols-5">
                    <div className="flex-1 max-w-xs">
                        <label htmlFor="ticket-status-filter" className="mb-2 block text-sm font-medium text-foreground">Status</label>
                        <select
                            id="ticket-status-filter"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors"
                        >
                            <option value="">Todos</option>
                            <option value="NEW">Novos</option>
                            <option value="QUEUED">Na fila</option>
                            <option value="IN_PROGRESS">Em Andamento</option>
                            <option value="WAITING_CUSTOMER">Aguardando cliente</option>
                            <option value="SCHEDULED_FIELD_SERVICE">Visita agendada</option>
                            <option value="RESOLVED">Resolvidos</option>
                            <option value="CLOSED">Fechados</option>
                            <option value="CANCELED">Cancelados</option>
                        </select>
                    </div>
                    <div className="flex-1 max-w-xs">
                        <label htmlFor="ticket-priority-filter" className="mb-2 block text-sm font-medium text-foreground">Prioridade</label>
                        <select
                            id="ticket-priority-filter"
                            value={priorityFilter}
                            onChange={(e) => setPriorityFilter(e.target.value)}
                            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors"
                        >
                            <option value="">Todas</option>
                            <option value="LOW">Baixa</option>
                            <option value="MEDIUM">Média</option>
                            <option value="HIGH">Alta</option>
                            <option value="CRITICAL">Crítica</option>
                        </select>
                    </div>
                    <div className="flex-1 max-w-xs">
                        <label htmlFor="ticket-technician-filter" className="mb-2 block text-sm font-medium text-foreground">Técnico</label>
                        <select
                            id="ticket-technician-filter"
                            value={technicianFilter}
                            onChange={(e) => setTechnicianFilter(e.target.value)}
                            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors"
                        >
                            <option value="">Todos</option>
                            {technicians.map((technician) => (
                                <option key={technician.id} value={technician.id}>{technician.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 max-w-xs">
                        <label htmlFor="ticket-visit-status-filter" className="mb-2 block text-sm font-medium text-foreground">Status da visita</label>
                        <select
                            id="ticket-visit-status-filter"
                            value={fieldVisitStatusFilter}
                            onChange={(e) => setFieldVisitStatusFilter(e.target.value)}
                            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors"
                        >
                            <option value="">Todos</option>
                            {Object.entries(fieldVisitStatusLabels).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </div>
                    <label className="flex items-center gap-2 self-end rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-muted-foreground">
                        <input
                            type="checkbox"
                            checked={visitOnly}
                            onChange={(event) => setVisitOnly(event.target.checked)}
                            className="h-4 w-4 accent-primary"
                        />
                        Apenas visitas
                    </label>
                </div>

                <div className="bg-surface rounded-xl border border-border shadow-card overflow-hidden flex-1 flex flex-col">
                    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Lista de chamados com rolagem horizontal">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-surface-alt border-b border-border">
                                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cliente / Título</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prioridade</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Visita</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Técnico</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {isLoading && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-6">
                                            <TableSkeleton rows={6} columns={6} />
                                        </td>
                                    </tr>
                                )}
                                {error && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center">
                                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-danger-soft text-danger-fg text-sm border border-danger/20">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                {error}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {!isLoading && !error && tickets.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-6">
                                            <EmptyState
                                                icon="confirmation_number"
                                                title="Nenhum chamado encontrado"
                                                description="Ajuste os filtros ou crie chamados a partir de uma conversa no Inbox."
                                            />
                                        </td>
                                    </tr>
                                )}
                                {!isLoading && !error && tickets.map(ticket => (
                                    <tr key={ticket.id} className="hover:bg-surface-alt transition-colors">
                                        <td className="px-6 py-4">
                                            <Link to={`/tickets/${ticket.id}`} className="mb-1 block font-medium text-foreground hover:text-primary">
                                                {ticket.protocol || `#${ticket.id.slice(0, 6)}`} - {ticket.title}
                                            </Link>
                                            <div className="text-xs text-muted-foreground">
                                                {ticket.customer?.name || ticket.contact?.name || ticket.contact?.phone}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <PriorityBadge priority={ticket.priority} />
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatusBadge status={ticket.status} />
                                        </td>
                                        <td className="px-6 py-4 text-sm text-muted-foreground">
                                            <div>{formatVisitDate(ticket)}</div>
                                            {ticket.fieldService?.status && (
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    {fieldVisitStatusLabels[ticket.fieldService.status] || ticket.fieldService.status}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-muted-foreground">
                                            {ticket.fieldService?.technician?.name || ticket.fieldService?.technician?.nome || ticket.assignedUser?.name || ticket.assignedUser?.nome || <span className="text-muted-foreground">Não atribuído</span>}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {(ticket.status === 'NEW' || ticket.status === 'QUEUED') && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleStatusUpdate(ticket.id, 'IN_PROGRESS')}
                                                    className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary transition-colors hover:text-primary-700"
                                                    aria-label={`Iniciar chamado ${ticket.protocol || ticket.title}`}
                                                >
                                                    Iniciar
                                                </button>
                                            )}
                                            {ticket.status === 'IN_PROGRESS' && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleStatusUpdate(ticket.id, 'RESOLVED')}
                                                    className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-success transition-colors hover:text-success-fg"
                                                    aria-label={`Resolver chamado ${ticket.protocol || ticket.title}`}
                                                >
                                                    Resolver
                                                </button>
                                            )}
                                            <Link to={`/tickets/${ticket.id}`} className="ml-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:text-primary-700" aria-label={`Ver detalhes do chamado ${ticket.protocol || ticket.title}`}>
                                                Detalhes
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
            <ManualTicketModal
                open={manualTicketOpen}
                contacts={contacts}
                contactsLoading={contactsLoading}
                contactQuery={contactQuery}
                technicians={technicians}
                users={users}
                departments={departments}
                loading={manualTicketLoading}
                error={manualTicketError}
                onContactQueryChange={setContactQuery}
                onClose={() => setManualTicketOpen(false)}
                onSubmit={handleCreateManualTicket}
            />
        </div>
    );
}
