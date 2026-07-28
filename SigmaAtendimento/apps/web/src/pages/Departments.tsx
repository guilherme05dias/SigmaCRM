import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SigmaTopbar } from '../components/sigma/SigmaTopbar';
import { SigmaMetricCard } from '../components/sigma/SigmaMetricCard';
import { SigmaTable, SigmaTableRow, SigmaTableCell } from '../components/sigma/SigmaTable';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { TableSkeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';
import { useAuth } from '../lib/auth';

interface DepartmentItem {
    id: string;
    name: string;
    description?: string | null;
    active: boolean;
}

interface DepartmentFormState {
    name: string;
    description: string;
    active: boolean;
}

const initialForm: DepartmentFormState = {
    name: '',
    description: '',
    active: true,
};

export default function Departments() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { showToast } = useToast();
    const [departments, setDepartments] = useState<DepartmentItem[]>([]);
    const [form, setForm] = useState<DepartmentFormState>(initialForm);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showFilters, setShowFilters] = useState(false);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadDepartments = () => {
        setLoading(true);
        setError(null);
        apiRequest<DepartmentItem[]>('/api/departments')
            .then(setDepartments)
            .catch((err) => {
                if (!redirectOnUnauthorized(err, navigate)) {
                    const message = err instanceof Error ? err.message : 'Erro ao carregar departamentos.';
                    setError(message);
                    showToast({ title: 'Erro ao carregar departamentos', description: message, variant: 'error' });
                }
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadDepartments();
    }, [navigate]);

    const filteredDepartments = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return departments.filter((department) => {
            const matchesQuery = !normalizedQuery
                || department.name.toLowerCase().includes(normalizedQuery)
                || (department.description || '').toLowerCase().includes(normalizedQuery);
            const matchesStatus = !statusFilter
                || (statusFilter === 'active' && department.active)
                || (statusFilter === 'inactive' && !department.active);
            return matchesQuery && matchesStatus;
        });
    }, [departments, query, statusFilter]);

    const resetForm = () => {
        setEditingId(null);
        setForm(initialForm);
    };

    const editDepartment = (department: DepartmentItem) => {
        setEditingId(department.id);
        setForm({
            name: department.name,
            description: department.description || '',
            active: department.active,
        });
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError(null);

        const payload = {
            name: form.name,
            description: form.description || null,
            active: form.active,
        };

        try {
            if (editingId) {
                await apiRequest<DepartmentItem>(`/api/departments/${editingId}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                });
            } else {
                await apiRequest<DepartmentItem>('/api/departments', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
            }
            resetForm();
            showToast({
                title: editingId ? 'Departamento atualizado' : 'Departamento criado',
                description: editingId ? 'As alterações do departamento foram salvas.' : 'O departamento foi criado com sucesso.',
                variant: 'success',
            });
            loadDepartments();
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Erro ao salvar departamento.';
                showToast({ title: 'Erro ao salvar departamento', description: message, variant: 'error' });
            }
        } finally {
            setSaving(false);
        }
    };

    const deactivateDepartment = async (department: DepartmentItem) => {
        setError(null);
        try {
            await apiRequest<void>(`/api/departments/${department.id}`, { method: 'DELETE' });
            showToast({ title: 'Departamento inativado', description: `${department.name} foi inativado.`, variant: 'success' });
            loadDepartments();
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Erro ao inativar departamento.';
                showToast({ title: 'Erro ao inativar departamento', description: message, variant: 'error' });
            }
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground font-sans">
            <SigmaTopbar user={user} onLogout={logout} />

            <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 pb-24 sm:p-6 sm:pb-24 md:pb-6 lg:p-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Gestão de Departamentos</h1>
                        <p className="text-muted-foreground mt-1">Configure os setores da empresa habilitados para atendimento.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button type="button" variant="outline" onClick={() => setShowFilters((current) => !current)}>
                            <Icon name="filter_list" className="size-5" />
                            Filtros
                        </Button>
                        <Button type="button" onClick={resetForm}>
                            <Icon name="domain_add" className="size-5" />
                            Novo departamento
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <SigmaMetricCard title="Total" value={departments.length || 0} icon="domain" colorClass="primary" />
                    <SigmaMetricCard title="Ativos" value={departments.filter((department) => department.active).length || 0} icon="domain_verification" colorClass="secondary" />
                    <SigmaMetricCard title="Inativos" value={departments.filter((department) => !department.active).length || 0} icon="block" colorClass="slate-500" />
                </div>

                {showFilters && (
                    <div className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface p-4 shadow-card md:grid-cols-[1fr_220px]">
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Busca</span>
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Nome ou descrição"
                                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
                            <select
                                value={statusFilter}
                                onChange={(event) => setStatusFilter(event.target.value)}
                                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                            >
                                <option value="">Todos</option>
                                <option value="active">Ativos</option>
                                <option value="inactive">Inativos</option>
                            </select>
                        </label>
                    </div>
                )}

                {error && <div className="mb-6 rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger-fg">{error}</div>}

                <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_380px]">
                    <SigmaTable
                        columns={[
                            { header: 'Departamento', align: 'left' },
                            { header: 'Descrição', align: 'left' },
                            { header: 'Status', align: 'center' },
                            { header: 'Ações', align: 'right' },
                        ]}
                    >
                        {loading && (
                            <tr>
                                <td colSpan={4} className="px-6 py-6">
                                    <TableSkeleton rows={5} columns={4} />
                                </td>
                            </tr>
                        )}
                        {!loading && filteredDepartments.map((department) => (
                            <SigmaTableRow key={department.id}>
                                <SigmaTableCell>
                                    <div className="flex items-center gap-3">
                                        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold overflow-hidden shadow-sm">
                                            <Icon name="domain" className="size-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-foreground">{department.name}</p>
                                        </div>
                                    </div>
                                </SigmaTableCell>
                                <SigmaTableCell>
                                    <p className="text-sm text-muted-foreground">{department.description || '-'}</p>
                                </SigmaTableCell>
                                <SigmaTableCell align="center">
                                    <div className={`flex justify-center items-center gap-1.5 ${department.active ? 'text-success' : 'text-muted-foreground'}`}>
                                        <div className={`size-2 rounded-full ${department.active ? 'bg-success' : 'bg-slate-400'}`} />
                                        <span className="text-xs font-bold">{department.active ? 'Ativo' : 'Inativo'}</span>
                                    </div>
                                </SigmaTableCell>
                                <SigmaTableCell align="right">
                                    <div className="flex justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => editDepartment(department)}
                                            className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                                            title="Editar"
                                            aria-label={`Editar departamento ${department.name}`}
                                        >
                                            <Icon name="edit" className="size-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deactivateDepartment(department)}
                                            disabled={!department.active}
                                            className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                                            title="Inativar"
                                            aria-label={`Inativar departamento ${department.name}`}
                                        >
                                            <Icon name="delete" className="size-4" />
                                        </button>
                                    </div>
                                </SigmaTableCell>
                            </SigmaTableRow>
                        ))}
                        {!loading && filteredDepartments.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-6 py-6">
                                    <EmptyState
                                        icon="domain"
                                        title="Nenhum departamento encontrado"
                                        description="Ajuste os filtros ou cadastre um departamento para organizar filas e responsáveis."
                                    />
                                </td>
                            </tr>
                        )}
                    </SigmaTable>

                    <aside className="rounded-xl border border-border bg-surface p-5 shadow-card h-fit">
                        <h2 className="text-lg font-bold text-foreground">{editingId ? 'Editar departamento' : 'Novo departamento'}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Departamentos organizam filas, Chamados e responsáveis.</p>

                        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nome</span>
                                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30" />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Descrição</span>
                                <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30" />
                            </label>
                            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} className="h-4 w-4 accent-primary" />
                                Departamento ativo
                            </label>

                            <div className="flex gap-3 pt-2">
                                <Button type="submit" loading={saving} className="flex-1">
                                    <Icon name="save" className="size-4" />
                                    {editingId ? 'Salvar' : 'Criar'}
                                </Button>
                                <Button type="button" variant="outline" onClick={resetForm}>
                                    Cancelar
                                </Button>
                            </div>
                        </form>
                    </aside>
                </div>
            </main>
        </div>
    );
}
