import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SigmaSidebarIcon } from '../components/sigma/SigmaSidebarIcon';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { TableSkeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';
import { useAuth } from '../lib/auth';
import { contactDisplayName } from '../components/inbox/contactDisplayName';

type CustomerStatus = 'ATIVO' | 'NEGOCIACAO' | 'INATIVO';

interface CustomerBusiness {
    id: string;
    name: string;
    cnpj: string;
}

interface Customer {
    id: string;
    name: string;
    document?: string | null;
    segment?: string | null;
    city?: string | null;
    status: CustomerStatus;
    notes?: string | null;
    updatedAt: string;
    businesses?: CustomerBusiness[];
    _count?: {
        businesses: number;
        contacts: number;
        tickets: number;
    };
}

interface CustomerContact {
    id: string;
    customerId?: string | null;
    name?: string | null;
    phone: string;
    email?: string | null;
    role?: string | null;
    updatedAt: string;
    business?: CustomerBusiness | null;
    customer?: Pick<Customer, 'id' | 'name'> | null;
}

interface ContactDataDeletionSummary {
    contacts: number;
    conversations: number;
    messages: number;
    tickets: number;
    ticketTimeline: number;
    ticketEvaluation: number;
    ticketFieldService: number;
    inboundEvents: number;
    outbox: number;
}

interface ContactDataDeletionResponse {
    ok: boolean;
    deleted: ContactDataDeletionSummary;
}

interface CustomerFormState {
    name: string;
    document: string;
    segment: string;
    city: string;
    notes: string;
    status: CustomerStatus;
    businesses: Array<Pick<CustomerBusiness, 'name' | 'cnpj'>>;
}

const initialForm: CustomerFormState = {
    name: '',
    document: '',
    segment: '',
    city: '',
    notes: '',
    status: 'ATIVO',
    businesses: [],
};

const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    return digits
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
};

const statusStyles: Record<CustomerStatus, string> = {
    ATIVO: 'bg-success-soft text-success-fg border-success/20',
    NEGOCIACAO: 'bg-warning-soft text-warning-fg border-warning/20',
    INATIVO: 'bg-surface-alt text-muted-foreground border-border',
};

export default function Customers() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { showToast } = useToast();
    const [searchParams] = useSearchParams();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [contacts, setContacts] = useState<CustomerContact[]>([]);
    const [query, setQuery] = useState(searchParams.get('query') || '');
    const [status, setStatus] = useState('');
    const [form, setForm] = useState<CustomerFormState>(initialForm);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [lgpdTarget, setLgpdTarget] = useState<CustomerContact | null>(null);
    const [lgpdConfirmation, setLgpdConfirmation] = useState('');
    const lgpdDialogRef = useDialogFocus<HTMLDivElement>(Boolean(lgpdTarget), () => {
        setLgpdTarget(null);
        setLgpdConfirmation('');
    });
    const [deletingContactId, setDeletingContactId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canDeleteContactData = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';

    const loadCustomers = () => {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (query.trim()) params.set('query', query.trim());
        if (status) params.set('status', status);

        Promise.all([
            apiRequest<Customer[]>(`/api/customers${params.toString() ? `?${params}` : ''}`),
            apiRequest<CustomerContact[]>('/api/contacts?take=500'),
        ])
            .then(([customerData, contactData]) => {
                setCustomers(customerData);
                setContacts(contactData);
            })
            .catch((err) => {
                if (!redirectOnUnauthorized(err, navigate)) {
                    const message = err instanceof Error ? err.message : 'Erro ao carregar clientes.';
                    setError(message);
                    showToast({ title: 'Erro ao carregar clientes', description: message, variant: 'error' });
                }
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        const timeoutId = window.setTimeout(loadCustomers, 250);
        return () => window.clearTimeout(timeoutId);
    }, [query, status]);

    useEffect(() => {
        setQuery(searchParams.get('query') || '');
    }, [searchParams]);

    const stats = useMemo(() => {
        return {
            total: customers.length,
            active: customers.filter((customer) => customer.status === 'ATIVO').length,
            negotiation: customers.filter((customer) => customer.status === 'NEGOCIACAO').length,
            tickets: customers.reduce((sum, customer) => sum + (customer._count?.tickets || 0), 0),
        };
    }, [customers]);

    const contactsByCustomer = useMemo(() => {
        const grouped = new Map<string, CustomerContact[]>();
        for (const contact of contacts) {
            if (!contact.customerId) continue;
            const current = grouped.get(contact.customerId) || [];
            grouped.set(contact.customerId, [...current, contact]);
        }
        return grouped;
    }, [contacts]);

    const resetCustomerForm = () => {
        setForm({ ...initialForm, businesses: [] });
        setEditingId(null);
    };

    const addBusiness = () => {
        setForm((current) => ({
            ...current,
            businesses: [...current.businesses, { name: '', cnpj: '' }],
        }));
    };

    const updateBusiness = (index: number, field: 'name' | 'cnpj', value: string) => {
        setForm((current) => ({
            ...current,
            businesses: current.businesses.map((business, businessIndex) => (
                businessIndex === index
                    ? { ...business, [field]: field === 'cnpj' ? formatCnpj(value) : value }
                    : business
            )),
        }));
    };

    const removeBusiness = (index: number) => {
        setForm((current) => ({
            ...current,
            businesses: current.businesses.filter((_, businessIndex) => businessIndex !== index),
        }));
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError(null);

        const payload = {
            name: form.name,
            document: form.document || null,
            segment: form.segment || null,
            city: form.city || null,
            notes: form.notes || null,
            status: form.status,
            businesses: form.businesses.map((business) => ({
                name: business.name.trim(),
                cnpj: business.cnpj.replace(/\D/g, ''),
            })),
        };

        try {
            if (editingId) {
                await apiRequest<Customer>(`/api/customers/${editingId}`, {
                    method: 'PATCH',
                    body: JSON.stringify(payload),
                });
            } else {
                await apiRequest<Customer>('/api/customers', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
            }
            resetCustomerForm();
            showToast({
                title: editingId ? 'Cliente atualizado' : 'Cliente criado',
                description: editingId ? 'As alterações do cliente foram salvas.' : 'O cliente foi cadastrado com sucesso.',
                variant: 'success',
            });
            loadCustomers();
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Erro ao salvar cliente.';
                showToast({ title: 'Erro ao salvar cliente', description: message, variant: 'error' });
            }
        } finally {
            setSaving(false);
        }
    };

    const editCustomer = (customer: Customer) => {
        setEditingId(customer.id);
        setForm({
            name: customer.name,
            document: customer.document || '',
            segment: customer.segment || '',
            city: customer.city || '',
            notes: customer.notes || '',
            status: customer.status,
            businesses: (customer.businesses || []).map((business) => ({
                name: business.name,
                cnpj: formatCnpj(business.cnpj),
            })),
        });
    };

    const deactivateCustomer = async (customer: Customer) => {
        setError(null);
        try {
            await apiRequest<void>(`/api/customers/${customer.id}`, { method: 'DELETE' });
            showToast({
                title: 'Cliente inativado',
                description: `${customer.name} foi inativado com sucesso.`,
                variant: 'success',
            });
            loadCustomers();
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Erro ao inativar cliente.';
                showToast({ title: 'Erro ao inativar cliente', description: message, variant: 'error' });
            }
        }
    };

    const openLgpdDeletion = (contact: CustomerContact) => {
        setLgpdTarget(contact);
        setLgpdConfirmation('');
        setError(null);
    };

    const closeLgpdDeletion = () => {
        if (deletingContactId) return;
        setLgpdTarget(null);
        setLgpdConfirmation('');
    };

    const deleteContactData = async () => {
        if (!lgpdTarget || lgpdConfirmation !== 'EXCLUIR DADOS') return;

        setDeletingContactId(lgpdTarget.id);
        setError(null);

        try {
            const result = await apiRequest<ContactDataDeletionResponse>(`/api/contacts/${lgpdTarget.id}/data`, {
                method: 'DELETE',
            });

            const deleted = result.deleted;
            showToast({
                title: 'Dados do contato apagados',
                description: `${deleted.contacts} contato, ${deleted.conversations} Atendimentos, ${deleted.messages} mensagens e ${deleted.tickets} Chamados removidos.`,
                variant: 'success',
            });
            setLgpdTarget(null);
            setLgpdConfirmation('');
            loadCustomers();
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Erro ao apagar dados do contato.';
                showToast({ title: 'Erro ao apagar dados do contato', description: message, variant: 'error' });
            }
        } finally {
            setDeletingContactId(null);
        }
    };

    return (
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
            <SigmaSidebarIcon user={user} onLogout={logout} />
            <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
                <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-8 p-6 xl:grid-cols-[minmax(0,1fr)_420px] lg:p-10">
                    <section className="min-w-0">
                        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-wider text-primary">CRM</p>
                                <h1 className="mt-2 text-3xl font-bold text-foreground">Clientes</h1>
                                <p className="mt-2 text-muted-foreground">Empresas atendidas, contatos vinculados e chamados associados.</p>
                            </div>
                        </div>

                        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
                            <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
                                <p className="text-xs uppercase tracking-wider text-muted-foreground">Total</p>
                                <p className="mt-2 text-2xl font-bold text-foreground">{stats.total}</p>
                            </div>
                            <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
                                <p className="text-xs uppercase tracking-wider text-muted-foreground">Ativos</p>
                                <p className="mt-2 text-2xl font-bold text-success">{stats.active}</p>
                            </div>
                            <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
                                <p className="text-xs uppercase tracking-wider text-muted-foreground">Negociacao</p>
                                <p className="mt-2 text-2xl font-bold text-warning">{stats.negotiation}</p>
                            </div>
                            <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
                                <p className="text-xs uppercase tracking-wider text-muted-foreground">Chamados</p>
                                <p className="mt-2 text-2xl font-bold text-primary">{stats.tickets}</p>
                            </div>
                        </div>

                        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-card md:flex-row">
                            <div className="relative flex-1">
                                <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-5" />
                                <input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Buscar cliente, empresa, CNPJ, segmento ou cidade"
                                    className="w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30"
                                />
                            </div>
                            <select
                                value={status}
                                onChange={(event) => setStatus(event.target.value)}
                                className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                            >
                                <option value="">Todos os status</option>
                                <option value="ATIVO">Ativo</option>
                                <option value="NEGOCIACAO">Negociacao</option>
                                <option value="INATIVO">Inativo</option>
                            </select>
                        </div>

                        {error && <div className="mb-4 rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger-fg">{error}</div>}

                        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
                            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Lista de clientes com rolagem horizontal">
                                <table className="w-full min-w-[820px] text-left">
                                    <thead className="border-b border-border bg-surface-alt">
                                        <tr>
                                            <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cliente</th>
                                            <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Segmento</th>
                                            <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                                            <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Relacionamento</th>
                                            <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Acoes</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {loading && (
                                            <tr>
                                                <td colSpan={5} className="px-5 py-6">
                                                    <TableSkeleton rows={5} columns={5} />
                                                </td>
                                            </tr>
                                        )}
                                        {!loading && customers.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-5 py-6">
                                                    <EmptyState
                                                        icon="business"
                                                        title="Nenhum cliente encontrado"
                                                        description="Ajuste os filtros ou cadastre um novo cliente para iniciar o relacionamento."
                                                    />
                                                </td>
                                            </tr>
                                        )}
                                        {!loading && customers.map((customer) => (
                                            <tr key={customer.id} className="hover:bg-surface-alt transition-colors">
                                                <td className="px-5 py-4">
                                                    <p className="font-semibold text-foreground">{customer.name}</p>
                                                    <p className="text-xs text-muted-foreground">{customer.document || 'Sem documento'} {customer.city ? `- ${customer.city}` : ''}</p>
                                                    {(customer.businesses || []).length > 0 ? (
                                                        <div className="mt-2 space-y-1">
                                                            {(customer.businesses || []).slice(0, 2).map((business) => (
                                                                <p key={business.id} className="truncate text-xs text-foreground">
                                                                    <span className="font-medium">{business.name}</span>
                                                                    <span className="text-muted-foreground"> · {formatCnpj(business.cnpj)}</span>
                                                                </p>
                                                            ))}
                                                            {(customer.businesses || []).length > 2 && (
                                                                <p className="text-[11px] text-muted-foreground">+{(customer.businesses || []).length - 2} empresas</p>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <p className="mt-2 text-[11px] text-muted-foreground">Nenhuma empresa vinculada</p>
                                                    )}
                                                </td>
                                                <td className="px-5 py-4 text-sm text-muted-foreground">{customer.segment || '-'}</td>
                                                <td className="px-5 py-4">
                                                    <span className={`inline-flex rounded-pill border px-2.5 py-1 text-xs font-semibold ${statusStyles[customer.status]}`}>
                                                        {customer.status}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4 text-sm text-muted-foreground">
                                                    <div>
                                                        <p>{(customer._count?.contacts || 0)} contatos · {(customer._count?.tickets || 0)} Chamados</p>
                                                        {(contactsByCustomer.get(customer.id) || []).length > 0 && (
                                                            <div className="mt-2 flex flex-col gap-2">
                                                                {(contactsByCustomer.get(customer.id) || []).slice(0, 3).map((contact) => (
                                                                    <div key={contact.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-alt px-2.5 py-2">
                                                                        <div className="min-w-0">
                                                                            <p className="truncate text-xs font-semibold text-foreground">
                                                                                {contactDisplayName({ name: contact.name, phone: contact.phone }, contact.business?.name || customer.name)}
                                                                            </p>
                                                                            <p className="truncate text-[11px] text-muted-foreground">{contact.phone}</p>
                                                                        </div>
                                                                        {canDeleteContactData && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => openLgpdDeletion(contact)}
                                                                                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger"
                                                                                title="Apagar dados LGPD"
                                                                                aria-label={`Apagar dados LGPD do contato ${contactDisplayName({ name: contact.name, phone: contact.phone }, contact.business?.name || customer.name)}`}
                                                                            >
                                                                                <Icon name="delete" className="size-3.5" />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                                {(customer._count?.contacts || 0) > Math.min(3, (contactsByCustomer.get(customer.id) || []).length) && (
                                                                    <p className="text-[11px] text-muted-foreground">
                                                                        +{(customer._count?.contacts || 0) - Math.min(3, (contactsByCustomer.get(customer.id) || []).length)} contatos nao exibidos
                                                                    </p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => editCustomer(customer)}
                                                            className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-alt hover:text-primary"
                                                            title="Editar"
                                                            aria-label={`Editar cliente ${customer.name}`}
                                                        >
                                                            <Icon name="edit" className="size-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => deactivateCustomer(customer)}
                                                            className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger"
                                                            title="Inativar"
                                                            aria-label={`Inativar cliente ${customer.name}`}
                                                        >
                                                            <Icon name="block" className="size-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>

                    <aside className="rounded-xl border border-border bg-surface p-5 shadow-card h-fit">
                        <div className="mb-5">
                            <h2 className="text-lg font-bold text-foreground">{editingId ? 'Editar cliente' : 'Novo cliente'}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">Dados comerciais usados nos contatos, Chamados e relatórios.</p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nome</span>
                                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30" />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Documento do cliente</span>
                                <input value={form.document} onChange={(event) => setForm({ ...form, document: event.target.value })} placeholder="CPF ou outro documento" className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30" />
                            </label>

                            <section className="space-y-3 border-y border-border py-4" aria-labelledby="customer-businesses-title">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <h3 id="customer-businesses-title" className="text-sm font-semibold text-foreground">Empresas e CNPJs</h3>
                                        <p className="mt-0.5 text-xs text-muted-foreground">Vincule uma ou mais empresas a este cliente.</p>
                                    </div>
                                    <Button type="button" variant="outline" size="sm" onClick={addBusiness} disabled={form.businesses.length >= 20}>
                                        <Icon name="add_business" className="size-4" />
                                        Adicionar
                                    </Button>
                                </div>

                                {form.businesses.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">Nenhuma empresa informada. O cadastro pode ser salvo assim ou você pode adicionar uma empresa.</p>
                                ) : (
                                    <div className="divide-y divide-border">
                                        {form.businesses.map((business, index) => (
                                            <fieldset key={index} className="space-y-3 py-4 first:pt-1 last:pb-1">
                                                <legend className="sr-only">Empresa {index + 1}</legend>
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-sm font-semibold text-foreground">Empresa {index + 1}</p>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-muted-foreground hover:bg-danger-soft hover:text-danger"
                                                        onClick={() => removeBusiness(index)}
                                                        aria-label={`Remover empresa ${index + 1}`}
                                                        title="Remover empresa"
                                                    >
                                                        <Icon name="delete" className="size-4" />
                                                    </Button>
                                                </div>
                                                <label className="block">
                                                    <span className="mb-1 block text-sm font-medium text-foreground">Nome da empresa</span>
                                                    <input
                                                        value={business.name}
                                                        onChange={(event) => updateBusiness(index, 'name', event.target.value)}
                                                        required
                                                        maxLength={160}
                                                        placeholder="Ex.: Sigma Tecnologia Ltda."
                                                        className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30"
                                                    />
                                                </label>
                                                <label className="block">
                                                    <span className="mb-1 block text-sm font-medium text-foreground">CNPJ</span>
                                                    <input
                                                        value={business.cnpj}
                                                        onChange={(event) => updateBusiness(index, 'cnpj', event.target.value)}
                                                        required
                                                        inputMode="numeric"
                                                        maxLength={18}
                                                        pattern="[0-9]{2}[.][0-9]{3}[.][0-9]{3}/[0-9]{4}-[0-9]{2}"
                                                        placeholder="00.000.000/0000-00"
                                                        title="Informe um CNPJ com 14 dígitos"
                                                        className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30"
                                                    />
                                                </label>
                                            </fieldset>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Segmento</span>
                                    <input value={form.segment} onChange={(event) => setForm({ ...form, segment: event.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30" />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cidade</span>
                                    <input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30" />
                                </label>
                            </div>
                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
                                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as CustomerStatus })} className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30">
                                    <option value="ATIVO">Ativo</option>
                                    <option value="NEGOCIACAO">Negociacao</option>
                                    <option value="INATIVO">Inativo</option>
                                </select>
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notas</span>
                                <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={4} className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30" />
                            </label>

                            <div className="flex gap-3 pt-2">
                                <Button type="submit" loading={saving} className="flex-1">
                                    <Icon name={editingId ? 'save' : 'add_business'} className="size-4" />
                                    {saving ? 'Salvando...' : editingId ? 'Salvar' : 'Criar'}
                                </Button>
                                {editingId && (
                                    <Button type="button" variant="outline" onClick={resetCustomerForm}>
                                        Cancelar
                                    </Button>
                                )}
                            </div>
                        </form>
                    </aside>
                </div>
            </main>

            {lgpdTarget && (
                <div ref={lgpdDialogRef} tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="lgpd-delete-title" aria-describedby="lgpd-delete-description">
                    <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-card">
                        <div className="flex items-start gap-3">
                            <div className="rounded-xl bg-danger-soft p-2 text-danger">
                                <Icon name="delete" className="size-5" />
                            </div>
                            <div>
                                <h2 id="lgpd-delete-title" className="text-lg font-bold text-foreground">Apagar dados do contato</h2>
                                <p id="lgpd-delete-description" className="mt-1 text-sm text-muted-foreground">
                                    Esta ação remove o contato, Atendimentos, mensagens, Chamados, avaliações, eventos de WhatsApp e mensagens pendentes vinculadas.
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 rounded-lg border border-border bg-surface-alt p-3 text-sm">
                            <p className="font-semibold text-foreground">{lgpdTarget.name || 'Contato sem nome'}</p>
                            <p className="text-muted-foreground">{lgpdTarget.phone}</p>
                            {lgpdTarget.email && <p className="text-muted-foreground">{lgpdTarget.email}</p>}
                        </div>

                        <label className="mt-5 block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Digite EXCLUIR DADOS para confirmar
                            </span>
                            <input
                                value={lgpdConfirmation}
                                onChange={(event) => setLgpdConfirmation(event.target.value)}
                                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-danger focus:ring-2 focus:ring-danger/30"
                                autoFocus
                            />
                        </label>

                        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <Button type="button" variant="outline" onClick={closeLgpdDeletion} disabled={Boolean(deletingContactId)}>
                                Cancelar
                            </Button>
                            <Button
                                type="button"
                                variant="danger"
                                loading={deletingContactId === lgpdTarget.id}
                                disabled={lgpdConfirmation !== 'EXCLUIR DADOS'}
                                onClick={deleteContactData}
                            >
                                Apagar dados
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
