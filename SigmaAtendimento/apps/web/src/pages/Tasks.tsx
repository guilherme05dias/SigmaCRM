import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SigmaSidebarIcon } from '../components/sigma/SigmaSidebarIcon';
import { contactDisplayName } from '../components/inbox/contactDisplayName';
import { Badge, PriorityBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';
import { useAuth } from '../lib/auth';

type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'WAITING' | 'COMPLETED' | 'DISMISSED';
type TaskSource = 'MANUAL' | 'AI' | 'CONVERSATION' | 'TICKET' | 'VISIT';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type ViewMode = 'list' | 'board' | 'calendar';
type Scope = 'mine' | 'team';

interface Person { id: string; name: string; role?: string; active?: boolean }
interface Customer { id: string; name: string }
interface ServiceTopic { id: string; name: string; active?: boolean }
interface ContactOption {
    id: string;
    name?: string | null;
    phone: string;
    business?: { id: string; name: string } | null;
    customer?: (Customer & { businesses?: Array<{ id: string; name: string }> }) | null;
}
interface TaskActivity {
    id: string;
    type: 'CREATED' | 'UPDATED' | 'STATUS_CHANGED' | 'ASSIGNED' | 'COMPLETED' | 'REOPENED';
    createdAt: string;
    actor?: Person | null;
    payload?: { action?: string; itemText?: string } | null;
}
interface ChecklistItem {
    id: string;
    text: string;
    position: number;
    completedAt?: string | null;
    createdAt: string;
    updatedAt: string;
}

interface TaskPlan {
    understanding: string;
    steps: string[];
    analysisMode: 'LOCAL_MODEL' | 'LOCAL_RULES';
    agent: {
        id: 'REPORT_ANALYST' | 'UNIPLUS_SPECIALIST' | 'SECULLUM_SPECIALIST' | 'GENERAL_TASKS' | 'FOLLOWUP_MASCOT';
        name: string;
        shortName: string;
        description: string;
        capabilities: string[];
    };
    references?: Array<{
        id: string;
        title: string;
        summary: string;
        system: 'UNIPLUS' | 'SECULLUM';
        edition: 'DESKTOP' | 'WEB' | 'GENERAL';
        sourceType: 'OFFICIAL_DOC' | 'INTERNAL_CASE';
        sourceLabel: string;
        url: string | null;
    }>;
}

interface Task {
    id: string;
    title: string;
    description?: string | null;
    priority: Priority;
    status: TaskStatus;
    source: TaskSource;
    dueAt?: string | null;
    completedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    assignedUser?: Person | null;
    createdBy: Person;
    customer?: Customer | null;
    contact?: ContactOption | null;
    serviceTopic?: ServiceTopic | null;
    ticket?: {
        id: string;
        protocol?: string | null;
        title: string;
        customer?: Customer | null;
        contact: ContactOption;
    } | null;
    conversation?: {
        id: string;
        contact: ContactOption;
    } | null;
    fieldService?: {
        id: string;
        scheduledAt?: string | null;
        visitAddress?: string | null;
        ticket: { id: string; protocol?: string | null; title: string };
    } | null;
    activities?: TaskActivity[];
    checklistItems?: ChecklistItem[];
    checklistProgress?: {
        total: number;
        completed: number;
    };
}

const statusConfig: Record<TaskStatus, { label: string; tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' }> = {
    PENDING: { label: 'Planejada', tone: 'neutral' },
    IN_PROGRESS: { label: 'Em andamento', tone: 'primary' },
    WAITING: { label: 'Aguardando', tone: 'warning' },
    COMPLETED: { label: 'Concluída', tone: 'success' },
    DISMISSED: { label: 'Cancelada', tone: 'danger' },
};

const sourceConfig: Record<TaskSource, { label: string; tone: 'neutral' | 'primary' | 'success' | 'warning' | 'info' }> = {
    MANUAL: { label: 'Manual', tone: 'neutral' },
    AI: { label: 'Assistente', tone: 'primary' },
    CONVERSATION: { label: 'Conversa', tone: 'success' },
    TICKET: { label: 'Chamado', tone: 'info' },
    VISIT: { label: 'Visita', tone: 'warning' },
};

const activityLabels: Record<TaskActivity['type'], string> = {
    CREATED: 'criou a tarefa',
    UPDATED: 'atualizou a tarefa',
    STATUS_CHANGED: 'alterou o status',
    ASSIGNED: 'delegou a tarefa',
    COMPLETED: 'concluiu a tarefa',
    REOPENED: 'reabriu a tarefa',
};

function activityDescription(activity: TaskActivity) {
    const itemText = activity.payload?.itemText ? ` “${activity.payload.itemText}”` : '';
    switch (activity.payload?.action) {
        case 'CHECKLIST_ITEM_ADDED': return `adicionou${itemText} à checklist`;
        case 'CHECKLIST_ITEM_COMPLETED': return `concluiu${itemText}`;
        case 'CHECKLIST_ITEM_REOPENED': return `reabriu${itemText}`;
        case 'CHECKLIST_ITEM_UPDATED': return `editou${itemText} na checklist`;
        case 'CHECKLIST_ITEM_REMOVED': return `removeu${itemText} da checklist`;
        default: return activityLabels[activity.type];
    }
}

function startOfDay(date = new Date()) {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
}

function addDays(date: Date, days: number) {
    const value = new Date(date);
    value.setDate(value.getDate() + days);
    return value;
}

function startOfWeek(date: Date) {
    const value = startOfDay(date);
    const day = value.getDay();
    value.setDate(value.getDate() - (day === 0 ? 6 : day - 1));
    return value;
}

function toDateTimeLocal(value?: string | null) {
    if (!value) return '';
    const date = new Date(value);
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function clientName(task: Task) {
    return (task.contact ? contactDisplayName(task.contact) : '')
        || (task.ticket?.contact ? contactDisplayName(task.ticket.contact) : '')
        || (task.conversation?.contact ? contactDisplayName(task.conversation.contact) : '')
        || task.customer?.name
        || task.ticket?.customer?.name
        || 'Sem cliente vinculado';
}

function taskContextLabel(task: Task) {
    const customer = clientName(task);
    return task.serviceTopic?.name ? `${customer} · ${task.serviceTopic.name}` : customer;
}

function contextLink(task: Task) {
    if (task.ticket?.id) return `/tickets/${task.ticket.id}`;
    if (task.fieldService?.ticket.id) return `/tickets/${task.fieldService.ticket.id}`;
    if (task.conversation?.id) return `/inbox?conversationId=${task.conversation.id}`;
    if (task.contact?.id) return `/customers?query=${encodeURIComponent(task.contact.phone)}`;
    if (task.customer?.id) return `/customers?query=${encodeURIComponent(task.customer.name)}`;
    return null;
}

function formatDue(value?: string | null, withDate = true) {
    if (!value) return 'Sem prazo';
    return new Date(value).toLocaleString('pt-BR', withDate
        ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
        : { hour: '2-digit', minute: '2-digit' });
}

function initials(name?: string | null) {
    return (name || '?').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function Avatar({ person, title }: { person?: Person | null; title?: string }) {
    return (
        <span title={title || person?.name || 'Sem responsável'} className="flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary-50 text-[10px] font-bold text-primary-700">
            {initials(person?.name)}
        </span>
    );
}

function TaskStatusBadge({ status }: { status: TaskStatus }) {
    const config = statusConfig[status];
    return <Badge tone={config.tone} dot>{config.label}</Badge>;
}

function SourceBadge({ source }: { source: TaskSource }) {
    const config = sourceConfig[source];
    return <Badge tone={config.tone}>{config.label}</Badge>;
}

function taskProgress(task: Task) {
    const checklist = task.checklistItems;
    const total = checklist ? checklist.length : task.checklistProgress?.total || 0;
    const completed = checklist
        ? checklist.filter((item) => Boolean(item.completedAt)).length
        : Math.min(task.checklistProgress?.completed || 0, total);
    return {
        total,
        completed,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
}

function TaskProgress({ task, className = '', showLabel = true }: { task: Task; className?: string; showLabel?: boolean }) {
    const { total, completed, percentage } = taskProgress(task);
    if (total === 0) return null;
    const complete = completed === total;
    const accessibleText = `${completed} de ${total} etapas concluídas`;

    return (
        <div className={className}>
            {showLabel && (
                <div className="mb-1 flex items-center justify-between gap-3 text-[11px] font-medium text-muted-foreground">
                    <span>{completed}/{total} etapas</span>
                    <span>{percentage}%</span>
                </div>
            )}
            <div
                className="h-1.5 overflow-hidden rounded-full bg-surface-alt"
                role="progressbar"
                aria-label={`Progresso de ${task.title}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percentage}
                aria-valuetext={accessibleText}
            >
                <div
                    className={`h-full rounded-full transition-[width] duration-200 ${complete ? 'bg-success' : 'bg-primary-solid'}`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}

function TaskRow({ task, onOpen, onComplete }: { task: Task; onOpen: () => void; onComplete: () => void }) {
    const overdue = task.dueAt && new Date(task.dueAt) < new Date() && task.status !== 'COMPLETED';
    return (
        <div className="group grid min-h-[58px] grid-cols-[40px_minmax(220px,1fr)] items-center border-b border-border px-2 last:border-b-0 hover:bg-surface-alt/60 md:grid-cols-[40px_minmax(240px,1fr)_120px_110px_130px_44px]">
            <button type="button" onClick={onComplete} className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-success-soft hover:text-success-fg" aria-label={`Concluir ${task.title}`}>
                <Icon name={task.status === 'COMPLETED' ? 'check_circle' : 'radio_button_unchecked'} className="size-5" />
            </button>
            <button type="button" onClick={onOpen} className="min-w-0 py-3 pr-3 text-left">
                <p className={`truncate text-sm font-semibold text-foreground ${task.status === 'COMPLETED' ? 'line-through opacity-60' : ''}`}>{task.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{taskContextLabel(task)}</p>
                <TaskProgress task={task} className="mt-2 max-w-sm" />
            </button>
            <div className="hidden md:block"><SourceBadge source={task.source} /></div>
            <div className="hidden md:block"><PriorityBadge priority={task.priority} /></div>
            <span className={`hidden text-xs font-medium md:block ${overdue ? 'text-danger' : 'text-muted-foreground'}`}>{formatDue(task.dueAt)}</span>
            <div className="hidden md:flex md:justify-center"><Avatar person={task.assignedUser} /></div>
        </div>
    );
}

function TaskCard({ task, onOpen, onStatus }: { task: Task; onOpen: () => void; onStatus: (status: TaskStatus) => void }) {
    return (
        <article className="rounded-xl border border-border bg-surface p-3 transition-colors hover:border-primary/30">
            <button type="button" onClick={onOpen} className="w-full text-left">
                <p className="line-clamp-2 text-sm font-semibold text-foreground">{task.title}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{taskContextLabel(task)}</p>
                <div className="mt-3 flex flex-wrap gap-1.5"><SourceBadge source={task.source} /><PriorityBadge priority={task.priority} /></div>
                <TaskProgress task={task} className="mt-3" />
            </button>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">{formatDue(task.dueAt)}</span>
                <div className="flex items-center gap-2">
                    <Avatar person={task.assignedUser} />
                    {task.status !== 'COMPLETED' && (
                        <select value={task.status} onChange={(event) => onStatus(event.target.value as TaskStatus)} className="h-8 max-w-[36px] rounded-lg border border-border bg-surface px-1 text-xs text-foreground" aria-label={`Alterar status de ${task.title}`}>
                            <option value="PENDING">Planejada</option>
                            <option value="IN_PROGRESS">Em andamento</option>
                            <option value="WAITING">Aguardando</option>
                            <option value="COMPLETED">Concluída</option>
                        </select>
                    )}
                </div>
            </div>
        </article>
    );
}

interface CreateTaskModalProps {
    open: boolean;
    users: Person[];
    customers: Customer[];
    serviceTopics: ServiceTopic[];
    currentUserId: string;
    canManage: boolean;
    context: { conversationId?: string; ticketId?: string; fieldServiceId?: string; customerId?: string; contactId?: string; serviceTopicId?: string };
    onClose: () => void;
    onCreated: (task: Task) => void;
}

function CreateTaskModal({ open, users, customers, serviceTopics, currentUserId, canManage, context, onClose, onCreated }: CreateTaskModalProps) {
    const { showToast } = useToast();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<Priority>('MEDIUM');
    const [dueAt, setDueAt] = useState('');
    const [assignedUserId, setAssignedUserId] = useState(currentUserId);
    const [serviceTopicId, setServiceTopicId] = useState(context.serviceTopicId || '');
    const [selectedContact, setSelectedContact] = useState<ContactOption | null>(null);
    const [contactQuery, setContactQuery] = useState('');
    const [contactResults, setContactResults] = useState<ContactOption[]>([]);
    const [contactResultsOpen, setContactResultsOpen] = useState(false);
    const [contactsLoading, setContactsLoading] = useState(false);
    const [registeringContact, setRegisteringContact] = useState(false);
    const [newContactName, setNewContactName] = useState('');
    const [newContactPhone, setNewContactPhone] = useState('');
    const [newCompanyName, setNewCompanyName] = useState('');
    const [contactSaving, setContactSaving] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setAssignedUserId(currentUserId);
        setServiceTopicId(context.serviceTopicId || '');
        setSelectedContact(null);
        setContactQuery('');
        setRegisteringContact(false);
        setNewContactName('');
        setNewContactPhone('');
        setNewCompanyName('');
    }, [open, currentUserId, context.serviceTopicId]);

    useEffect(() => {
        if (!open || registeringContact || context.contactId) return;
        const timeoutId = window.setTimeout(() => {
            const params = new URLSearchParams({ take: '100' });
            const query = contactQuery.trim();
            if (query && !selectedContact) params.set('query', query);
            setContactsLoading(true);
            apiRequest<ContactOption[]>(`/api/contacts?${params}`)
                .then((items) => {
                    setContactResults(Array.isArray(items) ? items : []);
                })
                .catch(() => setContactResults([]))
                .finally(() => setContactsLoading(false));
        }, contactQuery.trim() ? 250 : 0);
        return () => window.clearTimeout(timeoutId);
    }, [contactQuery, context.contactId, open, registeringContact, selectedContact]);

    useEffect(() => {
        if (!open || !context.contactId) return;
        apiRequest<ContactOption>(`/api/contacts/${context.contactId}`)
            .then((contact) => {
                setSelectedContact(contact);
                setContactQuery(contactDisplayName(contact));
            })
            .catch(() => {
                setSelectedContact(null);
                setContactQuery('Contato do registro de origem');
            });
    }, [context.contactId, open]);

    if (!open) return null;

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!title.trim()) return;
        setSaving(true);
        try {
            const response = await apiRequest<{ task: Task }>('/api/assistant/tasks', {
                method: 'POST',
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim() || null,
                    priority,
                    dueAt: dueAt ? new Date(dueAt).toISOString() : null,
                    assignedUserId,
                    serviceTopicId: serviceTopicId || null,
                    contactId: selectedContact?.id || context.contactId || null,
                    customerId: selectedContact?.customer?.id || context.customerId || null,
                    ...context,
                }),
            });
            onCreated(response.task);
            showToast({ title: 'Tarefa criada', description: assignedUserId === currentUserId ? 'Ela já está na sua lista.' : 'O responsável foi notificado.', variant: 'success' });
            setTitle('');
            setDescription('');
            setPriority('MEDIUM');
            setDueAt('');
            onClose();
        } catch (error) {
            showToast({ title: 'Não foi possível criar a tarefa', description: error instanceof Error ? error.message : undefined, variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const phoneDigits = contactQuery.replace(/\D/g, '');
    const phoneKey = (value: string) => value.replace(/\D/g, '').slice(-10);
    const canRegisterPhone = phoneDigits.length >= 10
        && !contactResults.some((contact) => phoneKey(contact.phone) === phoneKey(phoneDigits));

    const startContactRegistration = () => {
        setNewContactPhone(phoneDigits);
        setNewContactName('');
        setNewCompanyName('');
        setRegisteringContact(true);
        setContactResultsOpen(false);
    };

    const saveContact = async () => {
        const normalizedPhone = newContactPhone.replace(/\D/g, '');
        if (normalizedPhone.length < 10 || !newContactName.trim()) {
            showToast({ title: 'Complete o cadastro', description: 'Informe o nome e um número com DDD.', variant: 'error' });
            return;
        }
        setContactSaving(true);
        try {
            let customerId: string | null = null;
            const companyName = newCompanyName.trim();
            if (companyName) {
                let existingCustomer = customers.find((customer) => customer.name.trim().toLocaleLowerCase('pt-BR') === companyName.toLocaleLowerCase('pt-BR'));
                if (!existingCustomer) {
                    const matches = await apiRequest<Customer[]>(`/api/customers?query=${encodeURIComponent(companyName)}`);
                    existingCustomer = matches.find((customer) => customer.name.trim().toLocaleLowerCase('pt-BR') === companyName.toLocaleLowerCase('pt-BR'));
                }
                if (existingCustomer) {
                    customerId = existingCustomer.id;
                } else {
                    const customer = await apiRequest<Customer>('/api/customers', {
                        method: 'POST',
                        body: JSON.stringify({ name: companyName, status: 'ATIVO' }),
                    });
                    customerId = customer.id;
                }
            }
            const contact = await apiRequest<ContactOption>('/api/contacts', {
                method: 'POST',
                body: JSON.stringify({
                    name: newContactName.trim(),
                    phone: normalizedPhone,
                    customerId,
                }),
            });
            setSelectedContact(contact);
            setContactQuery(contactDisplayName(contact));
            setContactResults((current) => [contact, ...current.filter((item) => item.id !== contact.id)]);
            setRegisteringContact(false);
            showToast({ title: 'Contato cadastrado', description: `${contactDisplayName(contact)} foi vinculado à tarefa.`, variant: 'success' });
        } catch (error) {
            showToast({ title: 'Não foi possível cadastrar o contato', description: error instanceof Error ? error.message : undefined, variant: 'error' });
        } finally {
            setContactSaving(false);
        }
    };

    const hasContext = Boolean(context.conversationId || context.ticketId || context.fieldServiceId);
    return (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="new-task-title">
            <form onSubmit={submit} className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 sm:max-w-2xl sm:rounded-2xl sm:p-6">
                <div className="flex items-start justify-between gap-4">
                    <div><h2 id="new-task-title" className="text-xl font-bold text-foreground">Nova tarefa</h2><p className="mt-1 text-sm text-muted-foreground">Organize a próxima ação e defina quem será responsável.</p></div>
                    <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Fechar"><Icon name="close" className="size-5" /></Button>
                </div>
                {hasContext && <div className="mt-5 rounded-xl border border-primary/20 bg-primary-50 p-3 text-sm text-primary-700"><Icon name="open_in_new" className="mr-2 inline size-4" />O vínculo com o registro de origem será salvo automaticamente.</div>}
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <label className="sm:col-span-2"><span className="text-sm font-semibold text-foreground">Título</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Ex.: Retornar ao cliente sobre o chamado" className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
                    <label><span className="text-sm font-semibold text-foreground">Prioridade</span><select value={priority} onChange={(event) => setPriority(event.target.value as Priority)} className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"><option value="LOW">Baixa</option><option value="MEDIUM">Média</option><option value="HIGH">Alta</option><option value="CRITICAL">Crítica</option></select></label>
                    <label><span className="text-sm font-semibold text-foreground">Prazo</span><input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground" /></label>
                    <label><span className="text-sm font-semibold text-foreground">Responsável</span><select disabled={!canManage} value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground disabled:opacity-70">{!users.some((item) => item.id === currentUserId) && <option value={currentUserId}>Eu</option>}{users.filter((item) => item.active !== false).map((item) => <option key={item.id} value={item.id}>{item.id === currentUserId ? `${item.name} (eu)` : item.name}</option>)}</select></label>
                    <label><span className="text-sm font-semibold text-foreground">Sistema / produto</span><select value={serviceTopicId} onChange={(event) => setServiceTopicId(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"><option value="">Não informado</option>{serviceTopics.filter((topic) => topic.active !== false).map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select></label>
                    <div className="relative sm:col-span-2">
                        <label htmlFor="task-contact" className="text-sm font-semibold text-foreground">Contato / cliente</label>
                        <div className="relative mt-1">
                            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                id="task-contact"
                                value={contactQuery}
                                disabled={Boolean(context.contactId || context.conversationId || context.ticketId || context.fieldServiceId)}
                                onFocus={() => setContactResultsOpen(true)}
                                onChange={(event) => {
                                    setContactQuery(event.target.value);
                                    setSelectedContact(null);
                                    setContactResultsOpen(true);
                                }}
                                placeholder="Buscar nome, empresa ou número"
                                autoComplete="off"
                                className="h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-9 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-70"
                            />
                            {selectedContact && !(context.contactId || context.conversationId || context.ticketId || context.fieldServiceId) && (
                                <button type="button" onClick={() => { setSelectedContact(null); setContactQuery(''); setContactResultsOpen(true); }} aria-label="Remover contato" className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-alt hover:text-foreground"><Icon name="close" className="size-4" /></button>
                            )}
                        </div>
                        {contactResultsOpen && !selectedContact && !registeringContact && (
                            <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-border bg-surface p-1" role="listbox" aria-label="Contatos do CRM">
                                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setSelectedContact(null); setContactQuery(''); setContactResultsOpen(false); }} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-surface-alt">Sem contato vinculado</button>
                                {contactsLoading && <p className="px-3 py-3 text-sm text-muted-foreground">Buscando contatos...</p>}
                                {!contactsLoading && contactResults.map((contact) => (
                                    <button key={contact.id} type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => { setSelectedContact(contact); setContactQuery(contactDisplayName(contact)); setContactResultsOpen(false); }} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-primary-50">
                                        <span className="min-w-0"><span className="block truncate text-sm font-semibold text-foreground">{contactDisplayName(contact)}</span><span className="block text-xs text-muted-foreground">{contact.phone}</span></span>
                                        <Icon name="person" className="size-4 shrink-0 text-muted-foreground" />
                                    </button>
                                ))}
                                {!contactsLoading && canRegisterPhone && (
                                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={startContactRegistration} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-primary hover:bg-primary-50">
                                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-50"><Icon name="person_add" className="size-4" /></span>
                                        <span><span className="block text-sm font-semibold">Cadastrar {phoneDigits}</span><span className="block text-xs text-muted-foreground">Número não encontrado no CRM</span></span>
                                    </button>
                                )}
                                {!contactsLoading && contactResults.length === 0 && !canRegisterPhone && <p className="px-3 py-3 text-sm text-muted-foreground">Digite um nome, empresa ou número com DDD.</p>}
                            </div>
                        )}
                    </div>
                    {registeringContact && (
                        <section className="sm:col-span-2 rounded-xl border border-primary/25 bg-primary-50/40 p-4" aria-labelledby="quick-contact-title">
                            <div className="flex items-start justify-between gap-3"><div><h3 id="quick-contact-title" className="text-sm font-bold text-foreground">Cadastrar contato pelo número</h3><p className="mt-1 text-xs text-muted-foreground">O contato ficará disponível no CRM e já será vinculado a esta tarefa.</p></div><Button type="button" variant="ghost" size="icon" onClick={() => setRegisteringContact(false)} aria-label="Cancelar cadastro do contato"><Icon name="close" className="size-4" /></Button></div>
                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                <label><span className="text-xs font-semibold text-foreground">Número</span><input value={newContactPhone} onChange={(event) => setNewContactPhone(event.target.value)} inputMode="tel" className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary" /></label>
                                <label><span className="text-xs font-semibold text-foreground">Nome do contato</span><input autoFocus value={newContactName} onChange={(event) => setNewContactName(event.target.value)} placeholder="Nome" className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary" /></label>
                                <label><span className="text-xs font-semibold text-foreground">Empresa <span className="font-normal text-muted-foreground">(opcional)</span></span><input value={newCompanyName} onChange={(event) => setNewCompanyName(event.target.value)} list="task-contact-companies" placeholder="Empresa do CRM" className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary" /><datalist id="task-contact-companies">{customers.map((customer) => <option key={customer.id} value={customer.name} />)}</datalist></label>
                            </div>
                            <div className="mt-4 flex justify-end"><Button type="button" size="sm" loading={contactSaving} disabled={!newContactName.trim() || newContactPhone.replace(/\D/g, '').length < 10} onClick={() => void saveContact()}><Icon name="person_add" className="size-4" />Cadastrar e vincular</Button></div>
                        </section>
                    )}
                    <label className="sm:col-span-2"><span className="text-sm font-semibold text-foreground">Descrição</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={4} placeholder="Inclua informações necessárias para executar a atividade." className="mt-1 w-full resize-none rounded-xl border border-border bg-surface p-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
                </div>
                <div className="mt-6 flex justify-end gap-3"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={saving} disabled={!title.trim()}><Icon name="add" className="size-4" />Criar tarefa</Button></div>
            </form>
        </div>
    );
}

function TaskDetail({ task, users, serviceTopics, canManage, loading, onClose, onUpdate, onChecklistAdd, onChecklistAddMany, onChecklistToggle, onChecklistDelete, onPlan }: { task: Task | null; users: Person[]; serviceTopics: ServiceTopic[]; canManage: boolean; loading: boolean; onClose: () => void; onUpdate: (patch: Partial<Task>) => Promise<void>; onChecklistAdd: (text: string) => Promise<void>; onChecklistAddMany: (texts: string[]) => Promise<void>; onChecklistToggle: (item: ChecklistItem) => Promise<void>; onChecklistDelete: (item: ChecklistItem) => Promise<void>; onPlan: (context: string) => Promise<TaskPlan> }) {
    const [newItem, setNewItem] = useState('');
    const [checklistSaving, setChecklistSaving] = useState(false);
    const [plannerOpen, setPlannerOpen] = useState(false);
    const [planContext, setPlanContext] = useState('');
    const [plan, setPlan] = useState<TaskPlan | null>(null);
    const [selectedPlanSteps, setSelectedPlanSteps] = useState<string[]>([]);
    const [planning, setPlanning] = useState(false);
    const [addingPlan, setAddingPlan] = useState(false);
    useEffect(() => {
        setNewItem('');
        setPlannerOpen(false);
        setPlanContext(task?.description || '');
        setPlan(null);
        setSelectedPlanSteps([]);
    }, [task?.id]);
    if (!task && !loading) return null;
    const checklist = task?.checklistItems || [];
    const completedItems = checklist.filter((item) => item.completedAt).length;

    const addChecklistItem = async (event: FormEvent) => {
        event.preventDefault();
        const text = newItem.trim();
        if (!text || checklistSaving) return;
        setChecklistSaving(true);
        try {
            await onChecklistAdd(text);
            setNewItem('');
        } catch {
            // A mensagem de erro é exibida pelo painel de tarefas.
        } finally {
            setChecklistSaving(false);
        }
    };

    const toggleChecklistItem = async (item: ChecklistItem) => {
        if (checklistSaving) return;
        setChecklistSaving(true);
        try { await onChecklistToggle(item); } catch { /* Erro informado pelo painel. */ } finally { setChecklistSaving(false); }
    };

    const deleteChecklistItem = async (item: ChecklistItem) => {
        if (checklistSaving || !window.confirm(`Remover “${item.text}” da checklist?`)) return;
        setChecklistSaving(true);
        try { await onChecklistDelete(item); } catch { /* Erro informado pelo painel. */ } finally { setChecklistSaving(false); }
    };

    const generatePlan = async () => {
        if (planning) return;
        setPlanning(true);
        try {
            const nextPlan = await onPlan(planContext.trim());
            setPlan(nextPlan);
            setSelectedPlanSteps(nextPlan.steps);
        } catch {
            // A mensagem de erro é exibida pelo painel de tarefas.
        } finally {
            setPlanning(false);
        }
    };

    const togglePlannedStep = (step: string) => {
        setSelectedPlanSteps((current) => current.includes(step)
            ? current.filter((item) => item !== step)
            : [...current, step]);
    };

    const addPlannedSteps = async () => {
        if (addingPlan || selectedPlanSteps.length === 0) return;
        setAddingPlan(true);
        try {
            await onChecklistAddMany(selectedPlanSteps);
            setPlannerOpen(false);
            setPlan(null);
            setSelectedPlanSteps([]);
        } catch {
            // A mensagem de erro é exibida pelo painel de tarefas.
        } finally {
            setAddingPlan(false);
        }
    };

    return (
        <aside className="fixed inset-y-0 right-0 z-[65] w-full overflow-y-auto border-l border-border bg-surface shadow-lifted sm:w-[440px]" aria-label="Detalhes da tarefa">
            {loading || !task ? <div className="space-y-4 p-6"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24" /><Skeleton className="h-44" /></div> : <>
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-5 py-4"><div className="flex items-center gap-2"><SourceBadge source={task.source} /><TaskStatusBadge status={task.status} /></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar detalhes"><Icon name="close" className="size-5" /></Button></div>
                <div className="p-5">
                    <div className="flex items-start gap-3"><button type="button" onClick={() => onUpdate({ status: task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED' })} className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-success-soft hover:text-success-fg"><Icon name={task.status === 'COMPLETED' ? 'check_circle' : 'radio_button_unchecked'} className="size-6" /></button><div className="min-w-0"><h2 className={`text-xl font-bold text-foreground ${task.status === 'COMPLETED' ? 'line-through opacity-60' : ''}`}>{task.title}</h2><p className="mt-1 text-sm text-muted-foreground">Criada por {task.createdBy.name}</p></div></div>
                    {task.description && <p className="mt-5 whitespace-pre-wrap rounded-xl border border-border bg-surface-alt p-4 text-sm leading-6 text-foreground">{task.description}</p>}
                    <div className="mt-6 space-y-4">
                        <label className="grid grid-cols-[110px_1fr] items-center gap-3 text-sm"><span className="text-muted-foreground">Status</span><select value={task.status} onChange={(event) => onUpdate({ status: event.target.value as TaskStatus })} className="h-10 rounded-xl border border-border bg-surface px-3 text-foreground"><option value="PENDING">Planejada</option><option value="IN_PROGRESS">Em andamento</option><option value="WAITING">Aguardando</option><option value="COMPLETED">Concluída</option><option value="DISMISSED">Cancelada</option></select></label>
                        <label className="grid grid-cols-[110px_1fr] items-center gap-3 text-sm"><span className="text-muted-foreground">Prioridade</span><select value={task.priority} onChange={(event) => onUpdate({ priority: event.target.value as Priority })} className="h-10 rounded-xl border border-border bg-surface px-3 text-foreground"><option value="LOW">Baixa</option><option value="MEDIUM">Média</option><option value="HIGH">Alta</option><option value="CRITICAL">Crítica</option></select></label>
                        <label className="grid grid-cols-[110px_1fr] items-center gap-3 text-sm"><span className="text-muted-foreground">Sistema</span><select value={task.serviceTopic?.id || ''} onChange={(event) => onUpdate({ serviceTopic: serviceTopics.find((topic) => topic.id === event.target.value) || null, serviceTopicId: event.target.value || null } as Partial<Task>)} className="h-10 min-w-0 rounded-xl border border-border bg-surface px-3 text-foreground"><option value="">Não informado</option>{serviceTopics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}{topic.active === false ? ' (inativo)' : ''}</option>)}</select></label>
                        <label className="grid grid-cols-[110px_1fr] items-center gap-3 text-sm"><span className="text-muted-foreground">Prazo</span><input type="datetime-local" value={toDateTimeLocal(task.dueAt)} onChange={(event) => onUpdate({ dueAt: event.target.value ? new Date(event.target.value).toISOString() : null })} className="h-10 min-w-0 rounded-xl border border-border bg-surface px-3 text-foreground" /></label>
                        <label className="grid grid-cols-[110px_1fr] items-center gap-3 text-sm"><span className="text-muted-foreground">Responsável</span><select disabled={!canManage} value={task.assignedUser?.id || ''} onChange={(event) => onUpdate({ assignedUser: users.find((item) => item.id === event.target.value) || null, assignedUserId: event.target.value } as Partial<Task>)} className="h-10 min-w-0 rounded-xl border border-border bg-surface px-3 text-foreground disabled:opacity-70"><option value="">Sem responsável</option>{users.filter((item) => item.active !== false).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                    </div>
                    <section className="mt-7 border-t border-border pt-6" aria-labelledby="task-checklist-title">
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <div><h3 id="task-checklist-title" className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Etapas</h3><p className="mt-1 text-sm text-muted-foreground">Organize o problema em ações pequenas e verificáveis.</p></div>
                            <div className="flex items-center gap-2">
                                {checklist.length > 0 && <span className="shrink-0 text-sm font-semibold text-foreground">{completedItems}/{checklist.length}</span>}
                                {!plannerOpen && <Button type="button" variant="outline" size="sm" onClick={() => setPlannerOpen(true)}><Icon name="auto_awesome" className="size-4" />Sugerir etapas</Button>}
                            </div>
                        </div>
                        {plannerOpen && (
                            <div className="mt-4 rounded-xl border border-primary/25 bg-primary-50/40 p-4">
                                {!plan ? (
                                    <>
                                        <div className="flex items-start gap-3">
                                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary"><Icon name="auto_awesome" className="size-4" /></span>
                                            <div>
                                                <h4 className="text-sm font-bold text-foreground">Ajude o especialista a entender o problema</h4>
                                                <p className="mt-1 text-xs leading-5 text-muted-foreground">O Sigma escolherá entre os agentes Uniplus, Secullum ou tarefas gerais. Nenhuma etapa será adicionada sem sua confirmação.</p>
                                            </div>
                                        </div>
                                        <label className="mt-4 block" htmlFor="task-plan-context">
                                            <span className="text-xs font-semibold text-foreground">Contexto adicional <span className="font-normal text-muted-foreground">(opcional)</span></span>
                                            <textarea id="task-plan-context" value={planContext} onChange={(event) => setPlanContext(event.target.value)} maxLength={2000} rows={4} placeholder="Descreva o que acontece, o resultado esperado e o impacto observado." className="mt-1 w-full resize-none rounded-lg border border-border bg-surface p-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20" />
                                        </label>
                                        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                            <Button type="button" variant="ghost" size="sm" onClick={() => setPlannerOpen(false)}>Cancelar</Button>
                                            <Button type="button" size="sm" loading={planning} onClick={() => void generatePlan()}><Icon name="task_list" className="size-4" />Entender e criar plano</Button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <h4 className="text-sm font-bold text-foreground">Entendimento do problema</h4>
                                                <p className="mt-1 text-sm leading-6 text-muted-foreground">{plan.understanding}</p>
                                            </div>
                                            <Badge tone={plan.analysisMode === 'LOCAL_MODEL' ? 'primary' : 'neutral'}>{plan.agent.shortName}</Badge>
                                        </div>
                                        {Boolean(plan.references?.length) && (
                                            <section className="mt-4" aria-labelledby="task-plan-references">
                                                <div className="flex items-center justify-between gap-3">
                                                    <h5 id="task-plan-references" className="text-xs font-semibold text-foreground">Bases consultadas</h5>
                                                    <span className="text-xs text-muted-foreground">{plan.references?.length} referência{plan.references?.length === 1 ? '' : 's'}</span>
                                                </div>
                                                <div className="mt-2 divide-y divide-border rounded-xl border border-border bg-surface">
                                                    {plan.references?.map((reference) => (
                                                        <details key={reference.id} className="group px-3 py-2.5">
                                                            <summary className="flex cursor-pointer list-none items-start gap-2 text-sm marker:hidden">
                                                                <Icon name={reference.sourceType === 'OFFICIAL_DOC' ? 'assignment' : 'history'} className="mt-0.5 size-4 shrink-0 text-primary" />
                                                                <span className="min-w-0 flex-1">
                                                                    <span className="block font-semibold leading-5 text-foreground">{reference.title}</span>
                                                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                                                        {reference.sourceLabel} · {reference.edition === 'DESKTOP' ? 'Desktop/offline' : reference.edition === 'WEB' ? 'Web' : 'Geral'}
                                                                    </span>
                                                                </span>
                                                                <Icon name="expand_more" className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                                                            </summary>
                                                            <div className="ml-6 mt-2 text-xs leading-5 text-muted-foreground">
                                                                <p>{reference.summary}</p>
                                                                {reference.url && <a href={reference.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-8 items-center gap-1 font-semibold text-primary hover:text-primary-700"><Icon name="open_in_new" className="size-3.5" />Abrir documentação oficial</a>}
                                                            </div>
                                                        </details>
                                                    ))}
                                                </div>
                                            </section>
                                        )}
                                        <fieldset className="mt-4">
                                            <legend className="text-xs font-semibold text-foreground">Etapas sugeridas</legend>
                                            <div className="mt-2 divide-y divide-border rounded-xl border border-border bg-surface">
                                                {plan.steps.map((step) => (
                                                    <label key={step} className="flex cursor-pointer items-start gap-3 px-3 py-3 text-sm text-foreground hover:bg-surface-alt">
                                                        <input type="checkbox" checked={selectedPlanSteps.includes(step)} onChange={() => togglePlannedStep(step)} className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary/30" />
                                                        <span className="leading-5">{step}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </fieldset>
                                        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                                            <Button type="button" variant="ghost" size="sm" onClick={() => { setPlan(null); setSelectedPlanSteps([]); }}>Revisar contexto</Button>
                                            <Button type="button" size="sm" loading={addingPlan} disabled={selectedPlanSteps.length === 0} onClick={() => void addPlannedSteps()}><Icon name="check" className="size-4" />Adicionar {selectedPlanSteps.length} etapa{selectedPlanSteps.length === 1 ? '' : 's'}</Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                        <TaskProgress task={task} className="mt-4" showLabel={false} />
                        {checklist.length > 0 ? <div className="mt-4 divide-y divide-border rounded-xl border border-border">{checklist.map((item) => <div key={item.id} className="group flex items-start gap-3 px-3 py-3"><button type="button" disabled={checklistSaving} onClick={() => void toggleChecklistItem(item)} aria-label={item.completedAt ? `Reabrir ${item.text}` : `Concluir ${item.text}`} aria-pressed={Boolean(item.completedAt)} className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-50 ${item.completedAt ? 'bg-success-soft text-success-fg' : 'border border-border text-muted-foreground hover:border-success/50 hover:text-success-fg'}`}><Icon name={item.completedAt ? 'check' : 'radio_button_unchecked'} className="size-4" /></button><div className="min-w-0 flex-1"><p className={`break-words text-sm text-foreground ${item.completedAt ? 'line-through opacity-60' : ''}`}>{item.text}</p>{item.completedAt && <p className="mt-1 text-xs text-muted-foreground">Concluído em {new Date(item.completedAt).toLocaleString('pt-BR')}</p>}</div><button type="button" disabled={checklistSaving} onClick={() => void deleteChecklistItem(item)} aria-label={`Remover ${item.text}`} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-70 hover:bg-danger-soft hover:text-danger group-hover:opacity-100 disabled:opacity-40"><Icon name="delete" className="size-4" /></button></div>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-border bg-surface-alt/40 px-4 py-5 text-center"><Icon name="task_list" className="mx-auto size-6 text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">Divida a tarefa em pequenos passos para não se perder.</p></div>}
                        <form onSubmit={addChecklistItem} className="mt-3 flex gap-2"><label className="sr-only" htmlFor="new-checklist-item">Novo tópico</label><input id="new-checklist-item" value={newItem} onChange={(event) => setNewItem(event.target.value)} maxLength={240} placeholder="Adicionar tópico ou etapa" className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20" /><Button type="submit" size="sm" loading={checklistSaving} disabled={!newItem.trim()} aria-label="Adicionar etapa"><Icon name="add" className="size-4" />Adicionar</Button></form>
                    </section>
                    <section className="mt-7 border-t border-border pt-6"><h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Contexto relacionado</h3><div className="mt-3 rounded-xl border border-border p-4"><p className="font-semibold text-foreground">{clientName(task)}</p>{task.serviceTopic && <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><Icon name="build" className="size-4" />{task.serviceTopic.name}</p>}{task.ticket && <p className="mt-1 text-sm text-muted-foreground">{task.ticket.protocol || 'Chamado'} · {task.ticket.title}</p>}{task.fieldService?.visitAddress && <p className="mt-1 text-sm text-muted-foreground">{task.fieldService.visitAddress}</p>}{contextLink(task) && <Link to={contextLink(task)!} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg font-semibold text-primary hover:text-primary-700"><Icon name="open_in_new" className="size-4" />Abrir registro original</Link>}</div></section>
                    <section className="mt-7 border-t border-border pt-6"><h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Atividades</h3>{task.activities?.length ? <div className="mt-4 space-y-4">{task.activities.map((activity) => <div key={activity.id} className="flex gap-3"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" /><div><p className="text-sm text-foreground"><strong>{activity.actor?.name || 'Sistema'}</strong> {activityDescription(activity)}</p><p className="mt-0.5 text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleString('pt-BR')}</p></div></div>)}</div> : <p className="mt-3 text-sm text-muted-foreground">Nenhuma alteração registrada.</p>}</section>
                </div>
            </>}
        </aside>
    );
}

export default function Tasks() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const canManage = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
    const [tasks, setTasks] = useState<Task[]>([]);
    const [users, setUsers] = useState<Person[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [serviceTopics, setServiceTopics] = useState<ServiceTopic[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [view, setView] = useState<ViewMode>('list');
    const [scope, setScope] = useState<Scope>('mine');
    const [search, setSearch] = useState('');
    const [priority, setPriority] = useState<Priority | ''>('');
    const [source, setSource] = useState<TaskSource | ''>('');
    const [serviceTopicFilter, setServiceTopicFilter] = useState('');
    const [assignee, setAssignee] = useState('');
    const [showCreate, setShowCreate] = useState(searchParams.get('new') === '1');
    const [selected, setSelected] = useState<Task | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [week, setWeek] = useState(() => startOfWeek(new Date()));

    const context = useMemo(() => ({
        ...(searchParams.get('conversationId') ? { conversationId: searchParams.get('conversationId')! } : {}),
        ...(searchParams.get('ticketId') ? { ticketId: searchParams.get('ticketId')! } : {}),
        ...(searchParams.get('fieldServiceId') ? { fieldServiceId: searchParams.get('fieldServiceId')! } : {}),
        ...(searchParams.get('customerId') ? { customerId: searchParams.get('customerId')! } : {}),
        ...(searchParams.get('contactId') ? { contactId: searchParams.get('contactId')! } : {}),
        ...(searchParams.get('serviceTopicId') ? { serviceTopicId: searchParams.get('serviceTopicId')! } : {}),
    }), [searchParams]);

    const loadTasks = useCallback(async (quiet = false) => {
        if (!user) return;
        if (quiet) setRefreshing(true); else setLoading(true);
        try {
            const params = new URLSearchParams({ scope });
            if (assignee && scope === 'team') params.set('assignedUserId', assignee);
            const response = await apiRequest<{ tasks: Task[] }>(`/api/assistant/tasks?${params}`);
            setTasks(response.tasks);
            setError('');
        } catch (requestError) {
            if (!redirectOnUnauthorized(requestError, navigate)) setError(requestError instanceof Error ? requestError.message : 'Erro ao carregar tarefas.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [assignee, navigate, scope, user]);

    useEffect(() => { void loadTasks(); }, [loadTasks]);
    useEffect(() => {
        if (!user) return;
        Promise.all([apiRequest<Person[]>('/api/users'), apiRequest<Customer[]>('/api/customers'), apiRequest<ServiceTopic[]>('/api/service-topics?includeInactive=true')])
            .then(([team, customerList, topics]) => { setUsers(team); setCustomers(customerList); setServiceTopics(topics); })
            .catch((requestError) => { if (!redirectOnUnauthorized(requestError, navigate)) console.error(requestError); });
    }, [navigate, user]);
    useEffect(() => {
        const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void loadTasks(true); }, 30_000);
        const handleFocus = () => void loadTasks(true);
        window.addEventListener('focus', handleFocus);
        return () => { window.clearInterval(timer); window.removeEventListener('focus', handleFocus); };
    }, [loadTasks]);

    const filtered = useMemo(() => tasks.filter((task) => {
        if (priority && task.priority !== priority) return false;
        if (source && task.source !== source) return false;
        if (serviceTopicFilter && task.serviceTopic?.id !== serviceTopicFilter) return false;
        const term = search.trim().toLocaleLowerCase('pt-BR');
        return !term || `${task.title} ${task.description || ''} ${clientName(task)} ${task.serviceTopic?.name || ''} ${task.ticket?.protocol || ''}`.toLocaleLowerCase('pt-BR').includes(term);
    }), [priority, search, serviceTopicFilter, source, tasks]);

    const active = filtered.filter((task) => task.status !== 'COMPLETED' && task.status !== 'DISMISSED');
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = addDays(today, 1);
    const listGroups = [
        { label: 'Atrasadas', tasks: active.filter((task) => task.dueAt && new Date(task.dueAt) < today), tone: 'danger' },
        { label: 'Hoje', tasks: active.filter((task) => task.dueAt && new Date(task.dueAt) >= today && new Date(task.dueAt) < tomorrow), tone: 'primary' },
        { label: 'Próximas', tasks: active.filter((task) => task.dueAt && new Date(task.dueAt) >= tomorrow), tone: 'neutral' },
        { label: 'Sem prazo', tasks: active.filter((task) => !task.dueAt), tone: 'neutral' },
    ];
    const metrics = {
        overdue: active.filter((task) => task.dueAt && new Date(task.dueAt) < now).length,
        today: active.filter((task) => task.dueAt && new Date(task.dueAt) >= today && new Date(task.dueAt) < tomorrow).length,
        progress: active.filter((task) => task.status === 'IN_PROGRESS').length,
        waiting: active.filter((task) => task.status === 'WAITING').length,
    };

    const openDetail = async (task: Task) => {
        setSelected(task);
        setDetailLoading(true);
        try {
            const response = await apiRequest<{ task: Task }>(`/api/assistant/tasks/${task.id}`);
            setSelected(response.task);
        } catch (requestError) {
            showToast({ title: 'Não foi possível abrir a tarefa', description: requestError instanceof Error ? requestError.message : undefined, variant: 'error' });
        } finally { setDetailLoading(false); }
    };

    const refreshTaskDetail = async (taskId: string) => {
        const response = await apiRequest<{ task: Task }>(`/api/assistant/tasks/${taskId}`);
        setSelected(response.task);
        setTasks((current) => current.map((item) => item.id === taskId ? response.task : item));
    };

    const addChecklistItem = async (taskId: string, text: string) => {
        try {
            await apiRequest(`/api/assistant/tasks/${taskId}/checklist`, { method: 'POST', body: JSON.stringify({ text }) });
            await refreshTaskDetail(taskId);
        } catch (requestError) {
            showToast({ title: 'Não foi possível adicionar o tópico', description: requestError instanceof Error ? requestError.message : undefined, variant: 'error' });
            throw requestError;
        }
    };

    const addChecklistItems = async (taskId: string, texts: string[]) => {
        try {
            await apiRequest(`/api/assistant/tasks/${taskId}/checklist/bulk`, {
                method: 'POST',
                body: JSON.stringify({ items: texts }),
            });
            await refreshTaskDetail(taskId);
            showToast({
                title: 'Etapas adicionadas',
                description: `${texts.length} etapa${texts.length === 1 ? '' : 's'} incluída${texts.length === 1 ? '' : 's'} na tarefa.`,
                variant: 'success',
            });
        } catch (requestError) {
            showToast({ title: 'Não foi possível adicionar as etapas', description: requestError instanceof Error ? requestError.message : undefined, variant: 'error' });
            throw requestError;
        }
    };

    const planTask = async (taskId: string, context: string) => {
        try {
            const response = await apiRequest<{ plan: TaskPlan }>(`/api/assistant/tasks/${taskId}/plan`, {
                method: 'POST',
                body: JSON.stringify({ context: context || null }),
            });
            return response.plan;
        } catch (requestError) {
            showToast({ title: 'Não foi possível sugerir as etapas', description: requestError instanceof Error ? requestError.message : undefined, variant: 'error' });
            throw requestError;
        }
    };

    const toggleChecklistItem = async (taskId: string, item: ChecklistItem) => {
        try {
            await apiRequest(`/api/assistant/tasks/${taskId}/checklist/${item.id}`, { method: 'PATCH', body: JSON.stringify({ completed: !item.completedAt }) });
            await refreshTaskDetail(taskId);
        } catch (requestError) {
            showToast({ title: 'Não foi possível atualizar o tópico', description: requestError instanceof Error ? requestError.message : undefined, variant: 'error' });
            throw requestError;
        }
    };

    const deleteChecklistItem = async (taskId: string, item: ChecklistItem) => {
        try {
            await apiRequest(`/api/assistant/tasks/${taskId}/checklist/${item.id}`, { method: 'DELETE' });
            await refreshTaskDetail(taskId);
        } catch (requestError) {
            showToast({ title: 'Não foi possível remover o tópico', description: requestError instanceof Error ? requestError.message : undefined, variant: 'error' });
            throw requestError;
        }
    };

    const updateTask = async (task: Task, patch: Record<string, unknown>) => {
        try {
            const response = await apiRequest<{ task: Task }>(`/api/assistant/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
            setTasks((current) => current.map((item) => item.id === task.id ? { ...item, ...response.task } : item));
            if (selected?.id === task.id) {
                const detail = await apiRequest<{ task: Task }>(`/api/assistant/tasks/${task.id}`);
                setSelected(detail.task);
            }
        } catch (requestError) {
            showToast({ title: 'Não foi possível atualizar a tarefa', description: requestError instanceof Error ? requestError.message : undefined, variant: 'error' });
        }
    };

    const closeCreate = () => {
        setShowCreate(false);
        if ([...searchParams.keys()].some((key) => ['new', 'conversationId', 'ticketId', 'fieldServiceId', 'customerId', 'contactId', 'serviceTopicId'].includes(key))) setSearchParams({});
    };

    const boardColumns: Array<{ status: TaskStatus; label: string }> = [
        { status: 'PENDING', label: 'Planejadas' }, { status: 'IN_PROGRESS', label: 'Em andamento' },
        { status: 'WAITING', label: 'Aguardando' }, { status: 'COMPLETED', label: 'Concluídas' },
    ];
    const weekDays = Array.from({ length: 7 }, (_, index) => addDays(week, index));

    return (
        <div className="min-h-screen bg-background text-foreground md:flex">
            <SigmaSidebarIcon user={user} onLogout={logout} />
            <main className="min-w-0 flex-1 pb-24 md:pb-8">
                <div className="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-8 md:py-8">
                    <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                        <div><p className="text-sm font-semibold text-primary">Execução operacional</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">Tarefas</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Priorize retornos, acompanhe visitas e mantenha cada atividade ligada ao cliente, sistema e chamado corretos.</p></div>
                        <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => void loadTasks(true)} loading={refreshing}><Icon name="refresh" className="size-4" />Atualizar</Button><Button size="sm" onClick={() => setShowCreate(true)}><Icon name="add" className="size-4" />Nova tarefa</Button></div>
                    </header>

                    <section className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Resumo das tarefas">
                        {[['Atrasadas', metrics.overdue, 'text-danger'], ['Para hoje', metrics.today, 'text-primary'], ['Em andamento', metrics.progress, 'text-info-fg'], ['Aguardando', metrics.waiting, 'text-warning-fg']].map(([label, value, tone]) => <div key={String(label)} className="rounded-xl border border-border bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p></div>)}
                    </section>

                    <section className="mt-5 rounded-2xl border border-border bg-surface">
                        <div className="flex flex-col gap-3 border-b border-border p-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex flex-wrap gap-2">
                                <div className="flex rounded-xl bg-surface-alt p-1">{([['list', 'task_list', 'Lista'], ['board', 'view_kanban', 'Quadro'], ['calendar', 'calendar_month', 'Agenda']] as const).map(([mode, icon, label]) => <button key={mode} type="button" onClick={() => setView(mode)} className={`flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${view === mode ? 'bg-surface text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}><Icon name={icon} className="size-4" />{label}</button>)}</div>
                                {canManage && <div className="flex rounded-xl bg-surface-alt p-1">{([['mine', 'Minhas tarefas'], ['team', 'Equipe']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => { setAssignee(''); setScope(value); }} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${scope === value ? 'bg-surface text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>)}</div>}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
                                <label className="relative min-w-[220px] flex-1 lg:max-w-sm"><Icon name="search" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tarefa, cliente ou chamado" className="h-10 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary" /></label>
                                <select value={priority} onChange={(event) => setPriority(event.target.value as Priority | '')} className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-foreground"><option value="">Prioridades</option><option value="CRITICAL">Crítica</option><option value="HIGH">Alta</option><option value="MEDIUM">Média</option><option value="LOW">Baixa</option></select>
                                <select value={source} onChange={(event) => setSource(event.target.value as TaskSource | '')} className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-foreground"><option value="">Origens</option>{Object.entries(sourceConfig).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select>
                                <select value={serviceTopicFilter} onChange={(event) => setServiceTopicFilter(event.target.value)} className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-foreground"><option value="">Sistemas/produtos</option>{serviceTopics.filter((topic) => topic.active !== false).map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select>
                                {canManage && scope === 'team' && <select value={assignee} onChange={(event) => setAssignee(event.target.value)} className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-foreground"><option value="">Toda a equipe</option>{users.filter((item) => item.active !== false).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
                            </div>
                        </div>

                        {error ? <div className="p-6"><EmptyState icon="error" title="Não foi possível carregar as tarefas" description={error} actionLabel="Tentar novamente" onAction={() => void loadTasks()} /></div> : loading ? <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-14" />)}</div> : view === 'list' ? (
                            <div>{listGroups.map((group) => group.tasks.length > 0 && <section key={group.label}><div className="flex items-center gap-2 border-b border-border bg-surface-alt/50 px-4 py-3"><h2 className="text-sm font-bold text-foreground">{group.label}</h2><Badge tone={group.tone === 'danger' ? 'danger' : group.tone === 'primary' ? 'primary' : 'neutral'}>{group.tasks.length}</Badge></div>{group.tasks.map((task) => <TaskRow key={task.id} task={task} onOpen={() => void openDetail(task)} onComplete={() => void updateTask(task, { status: task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED' })} />)}</section>)}{active.length === 0 && <div className="p-8"><EmptyState icon="task_alt" title="Tudo em dia" description="Nenhuma tarefa ativa corresponde aos filtros atuais." actionLabel="Criar tarefa" onAction={() => setShowCreate(true)} /></div>}{filtered.some((task) => task.status === 'COMPLETED') && <details className="border-t border-border"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-muted-foreground">Concluídas recentemente ({filtered.filter((task) => task.status === 'COMPLETED').length})</summary>{filtered.filter((task) => task.status === 'COMPLETED').slice(0, 30).map((task) => <TaskRow key={task.id} task={task} onOpen={() => void openDetail(task)} onComplete={() => void updateTask(task, { status: 'PENDING' })} />)}</details>}</div>
                        ) : view === 'board' ? (
                            <div className="grid min-w-[1020px] grid-cols-4 gap-3 overflow-x-auto bg-surface-alt/40 p-4">{boardColumns.map((column) => { const items = filtered.filter((task) => task.status === column.status); return <section key={column.status} className="min-w-0"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold text-foreground">{column.label}</h2><Badge tone={statusConfig[column.status].tone}>{items.length}</Badge></div><div className="space-y-3">{items.map((task) => <TaskCard key={task.id} task={task} onOpen={() => void openDetail(task)} onStatus={(status) => void updateTask(task, { status })} />)}{items.length === 0 && <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">Nenhuma tarefa</div>}</div></section>; })}</div>
                        ) : (
                            <div className="p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Button variant="outline" size="icon" onClick={() => setWeek(addDays(week, -7))} aria-label="Semana anterior"><Icon name="chevron_left" className="size-4" /></Button><Button variant="outline" size="sm" onClick={() => setWeek(startOfWeek(new Date()))}>Hoje</Button><Button variant="outline" size="icon" onClick={() => setWeek(addDays(week, 7))} aria-label="Próxima semana"><Icon name="chevron_right" className="size-4" /></Button></div><p className="text-sm font-semibold text-foreground">{week.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })} – {addDays(week, 6).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p></div><div className="grid min-w-[980px] grid-cols-7 overflow-x-auto rounded-xl border border-border">{weekDays.map((day) => { const next = addDays(day, 1); const items = active.filter((task) => task.dueAt && new Date(task.dueAt) >= day && new Date(task.dueAt) < next); const isToday = day.getTime() === today.getTime(); return <section key={day.toISOString()} className="min-h-[460px] border-r border-border last:border-r-0"><div className={`border-b border-border p-3 text-center ${isToday ? 'bg-primary-50 text-primary-700' : 'bg-surface-alt'}`}><p className="text-xs font-semibold uppercase">{day.toLocaleDateString('pt-BR', { weekday: 'short' })}</p><p className="mt-1 text-lg font-bold">{day.getDate()}</p></div><div className="space-y-2 p-2">{items.map((task) => <button key={task.id} type="button" onClick={() => void openDetail(task)} className={`w-full rounded-lg border p-2 text-left ${task.source === 'VISIT' ? 'border-warning/30 bg-warning-soft' : 'border-primary/20 bg-primary-50'}`}><p className="text-[11px] font-bold text-foreground">{formatDue(task.dueAt, false)}</p><p className="mt-1 line-clamp-2 text-xs font-semibold text-foreground">{task.title}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{taskContextLabel(task)}</p><TaskProgress task={task} className="mt-2" /></button>)}</div></section>; })}</div>{active.some((task) => !task.dueAt) && <div className="mt-4 rounded-xl border border-border p-4"><h3 className="text-sm font-bold text-foreground">Sem data ({active.filter((task) => !task.dueAt).length})</h3><div className="mt-3 flex flex-wrap gap-2">{active.filter((task) => !task.dueAt).map((task) => <button key={task.id} type="button" onClick={() => void openDetail(task)} className="min-w-[180px] rounded-lg border border-border bg-surface-alt px-3 py-2 text-left text-xs font-semibold text-foreground hover:border-primary/30"><span className="block truncate">{task.title}</span><TaskProgress task={task} className="mt-2" /></button>)}</div></div>}</div>
                        )}
                    </section>
                </div>
            </main>
            <CreateTaskModal open={showCreate} users={users} customers={customers} serviceTopics={serviceTopics} currentUserId={user?.id || ''} canManage={canManage} context={context} onClose={closeCreate} onCreated={(task) => setTasks((current) => [task, ...current])} />
            <TaskDetail task={selected} users={users} serviceTopics={serviceTopics} canManage={canManage} loading={detailLoading} onClose={() => setSelected(null)} onUpdate={async (patch) => { if (!selected) return; const payload: Record<string, unknown> = { ...patch }; if ('assignedUserId' in patch) delete (payload as any).assignedUser; if ('serviceTopicId' in patch) delete (payload as any).serviceTopic; await updateTask(selected, payload); }} onChecklistAdd={async (text) => { if (selected) await addChecklistItem(selected.id, text); }} onChecklistAddMany={async (texts) => { if (selected) await addChecklistItems(selected.id, texts); }} onChecklistToggle={async (item) => { if (selected) await toggleChecklistItem(selected.id, item); }} onChecklistDelete={async (item) => { if (selected) await deleteChecklistItem(selected.id, item); }} onPlan={async (context) => selected ? planTask(selected.id, context) : Promise.reject(new Error('Tarefa não selecionada.'))} />
            {selected && <button type="button" aria-label="Fechar detalhes" className="fixed inset-0 z-[60] bg-black/20 sm:block" onClick={() => setSelected(null)} />}
        </div>
    );
}
