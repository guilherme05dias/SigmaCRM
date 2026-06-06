import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SigmaSidebarIcon } from '../components/sigma/SigmaSidebarIcon';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';
import { useAuth } from '../lib/auth';

type CustomerStatus = 'ATIVO' | 'NEGOCIACAO' | 'INATIVO';

interface Customer {
    id: string;
    name: string;
    document?: string | null;
    segment?: string | null;
    city?: string | null;
    status: CustomerStatus;
    notes?: string | null;
    updatedAt: string;
    _count?: {
        contacts: number;
        tickets: number;
    };
}

interface CustomerFormState {
    name: string;
    document: string;
    segment: string;
    city: string;
    notes: string;
    status: CustomerStatus;
}

const initialForm: CustomerFormState = {
    name: '',
    document: '',
    segment: '',
    city: '',
    notes: '',
    status: 'ATIVO',
};

const statusStyles: Record<CustomerStatus, string> = {
    ATIVO: 'bg-success-soft text-success-fg border-success/20',
    NEGOCIACAO: 'bg-warning-soft text-warning-fg border-warning/20',
    INATIVO: 'bg-surface-alt text-muted-foreground border-border',
};

export default function Customers() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [searchParams] = useSearchParams();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [query, setQuery] = useState(searchParams.get('query') || '');
    const [status, setStatus] = useState('');
    const [form, setForm] = useState<CustomerFormState>(initialForm);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadCustomers = () => {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (query.trim()) params.set('query', query.trim());
        if (status) params.set('status', status);

        apiRequest<Customer[]>(`/api/customers${params.toString() ? `?${params}` : ''}`)
            .then(setCustomers)
            .catch((err) => {
                if (!redirectOnUnauthorized(err, navigate)) {
                    setError(err instanceof Error ? err.message : 'Erro ao carregar clientes.');
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
            setForm(initialForm);
            setEditingId(null);
            loadCustomers();
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                setError(err instanceof Error ? err.message : 'Erro ao salvar cliente.');
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
        });
    };

    const deactivateCustomer = async (customer: Customer) => {
        try {
            await apiRequest<void>(`/api/customers/${customer.id}`, { method: 'DELETE' });
            loadCustomers();
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                setError(err instanceof Error ? err.message : 'Erro ao inativar cliente.');
            }
        }
    };

    return (
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
            <SigmaSidebarIcon user={user} onLogout={logout} />
            <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
                <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-8 p-6 lg:grid-cols-[1fr_360px] lg:p-10">
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
                                <p className="text-xs uppercase tracking-wider text-muted-foreground">Tickets</p>
                                <p className="mt-2 text-2xl font-bold text-primary">{stats.tickets}</p>
                            </div>
                        </div>

                        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-card md:flex-row">
                            <div className="relative flex-1">
                                <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-5" />
                                <input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Buscar por nome, documento, segmento ou cidade"
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

                        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
                            <div className="overflow-x-auto">
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
                                                <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">Carregando clientes...</td>
                                            </tr>
                                        )}
                                        {!loading && customers.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">Nenhum cliente encontrado.</td>
                                            </tr>
                                        )}
                                        {!loading && customers.map((customer) => (
                                            <tr key={customer.id} className="hover:bg-surface-alt transition-colors">
                                                <td className="px-5 py-4">
                                                    <p className="font-semibold text-foreground">{customer.name}</p>
                                                    <p className="text-xs text-muted-foreground">{customer.document || 'Sem documento'} {customer.city ? `- ${customer.city}` : ''}</p>
                                                </td>
                                                <td className="px-5 py-4 text-sm text-muted-foreground">{customer.segment || '-'}</td>
                                                <td className="px-5 py-4">
                                                    <span className={`inline-flex rounded-pill border px-2.5 py-1 text-xs font-semibold ${statusStyles[customer.status]}`}>
                                                        {customer.status}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4 text-sm text-muted-foreground">
                                                    {(customer._count?.contacts || 0)} contatos · {(customer._count?.tickets || 0)} tickets
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => editCustomer(customer)} className="rounded-lg p-2 text-muted-foreground hover:bg-surface-alt hover:text-primary transition-colors cursor-pointer" title="Editar">
                                                            <Icon name="edit" className="size-4" />
                                                        </button>
                                                        <button onClick={() => deactivateCustomer(customer)} className="rounded-lg p-2 text-muted-foreground hover:bg-danger-soft hover:text-danger transition-colors cursor-pointer" title="Inativar">
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
                            <p className="mt-1 text-sm text-muted-foreground">Dados comerciais usados nos contatos, tickets e relatórios.</p>
                        </div>

                        {error && <div className="mb-4 rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger-fg">{error}</div>}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nome</span>
                                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30" />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Documento</span>
                                <input value={form.document} onChange={(event) => setForm({ ...form, document: event.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30" />
                            </label>
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
                                    <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(initialForm); }}>
                                        Cancelar
                                    </Button>
                                )}
                            </div>
                        </form>
                    </aside>
                </div>
            </main>
        </div>
    );
}
