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

type Role = 'ADMIN' | 'SUPERVISOR' | 'ATTENDANT' | 'TECHNICIAN';

interface DepartmentItem {
    id: string;
    name: string;
    active: boolean;
}

interface UserItem {
    id: string;
    name: string;
    email: string;
    role: Role;
    messageSignature?: string | null;
    departmentId?: string | null;
    department?: DepartmentItem | null;
    active: boolean;
}

interface UserFormState {
    name: string;
    email: string;
    password: string;
    role: Role;
    messageSignature: string;
    departmentId: string;
    active: boolean;
}

const initialForm: UserFormState = {
    name: '',
    email: '',
    password: '',
    role: 'ATTENDANT',
    messageSignature: '',
    departmentId: '',
    active: true,
};

export default function Users() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { showToast } = useToast();
    const [users, setUsers] = useState<UserItem[]>([]);
    const [departments, setDepartments] = useState<DepartmentItem[]>([]);
    const [form, setForm] = useState<UserFormState>(initialForm);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showFilters, setShowFilters] = useState(false);
    const [query, setQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadUsers = () => {
        setLoading(true);
        setError(null);
        apiRequest<UserItem[]>('/api/users')
            .then(setUsers)
            .catch((err) => {
                if (!redirectOnUnauthorized(err, navigate)) {
                    const message = err instanceof Error ? err.message : 'Erro ao carregar usuários.';
                    setError(message);
                    showToast({ title: 'Erro ao carregar usuários', description: message, variant: 'error' });
                }
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadUsers();
        apiRequest<DepartmentItem[]>('/api/departments')
            .then(setDepartments)
            .catch((err) => {
                if (!redirectOnUnauthorized(err, navigate)) console.error(err);
            });
    }, [navigate]);

    const filteredUsers = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return users.filter((user) => {
            const matchesQuery = !normalizedQuery
                || user.name.toLowerCase().includes(normalizedQuery)
                || user.email.toLowerCase().includes(normalizedQuery)
                || (user.department?.name || '').toLowerCase().includes(normalizedQuery);
            const matchesRole = !roleFilter || user.role === roleFilter;
            return matchesQuery && matchesRole;
        });
    }, [users, query, roleFilter]);

    const resetForm = () => {
        setEditingId(null);
        setForm(initialForm);
    };

    const editUser = (user: UserItem) => {
        setEditingId(user.id);
        setForm({
            name: user.name,
            email: user.email,
            password: '',
            role: user.role,
            messageSignature: user.messageSignature || '',
            departmentId: user.departmentId || '',
            active: user.active,
        });
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError(null);

        const payload: Record<string, unknown> = {
            name: form.name,
            email: form.email,
            role: form.role,
            messageSignature: form.messageSignature || null,
            departmentId: form.departmentId || null,
            active: form.active,
        };

        if (form.password) {
            payload.password = form.password;
        }

        try {
            if (editingId) {
                await apiRequest<UserItem>(`/api/users/${editingId}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                });
            } else {
                await apiRequest<UserItem>('/api/users', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
            }
            resetForm();
            showToast({
                title: editingId ? 'Usuário atualizado' : 'Usuário criado',
                description: editingId ? 'As alterações do usuário foram salvas.' : 'O usuário foi criado com sucesso.',
                variant: 'success',
            });
            loadUsers();
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Erro ao salvar usuário.';
                showToast({ title: 'Erro ao salvar usuário', description: message, variant: 'error' });
            }
        } finally {
            setSaving(false);
        }
    };

    const deactivateUser = async (user: UserItem) => {
        setError(null);
        try {
            await apiRequest<void>(`/api/users/${user.id}`, { method: 'DELETE' });
            showToast({ title: 'Usuário inativado', description: `${user.name} foi inativado.`, variant: 'success' });
            loadUsers();
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Erro ao inativar usuário.';
                showToast({ title: 'Erro ao inativar usuário', description: message, variant: 'error' });
            }
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground font-sans">
            <SigmaTopbar user={user} onLogout={logout} />

            <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 pb-24 sm:p-6 sm:pb-24 md:pb-6 lg:p-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Gerenciamento de Usuários</h1>
                        <p className="text-muted-foreground mt-1">Controle acessos, permissões e departamentos da sua equipe.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button type="button" variant="outline" onClick={() => setShowFilters((current) => !current)}>
                            <Icon name="filter_list" className="size-5" />
                            Filtros
                        </Button>
                        <Button type="button" onClick={resetForm}>
                            <Icon name="person_add" className="size-5" />
                            Novo usuário
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <SigmaMetricCard title="Total" value={users.length || 0} icon="group" colorClass="primary" />
                    <SigmaMetricCard title="Ativos" value={users.filter((user) => user.active).length || 0} icon="verified_user" colorClass="secondary" />
                    <SigmaMetricCard title="Admins" value={users.filter((user) => user.role === 'ADMIN').length || 0} icon="manage_accounts" colorClass="amber-500" />
                    <SigmaMetricCard title="Inativos" value={users.filter((user) => !user.active).length || 0} icon="block" colorClass="slate-500" />
                </div>

                {showFilters && (
                    <div className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface p-4 shadow-card md:grid-cols-[1fr_240px]">
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Busca</span>
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Nome, e-mail ou departamento"
                                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Papel</span>
                            <select
                                value={roleFilter}
                                onChange={(event) => setRoleFilter(event.target.value)}
                                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                            >
                                <option value="">Todos</option>
                                <option value="ADMIN">ADMIN</option>
                                <option value="SUPERVISOR">SUPERVISOR</option>
                                <option value="ATTENDANT">Atendente</option>
                                <option value="TECHNICIAN">Técnico</option>
                            </select>
                        </label>
                    </div>
                )}

                {error && <div className="mb-6 rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger-fg">{error}</div>}

                <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_380px]">
                    <SigmaTable
                        columns={[
                            { header: 'Nome & E-mail', align: 'left' },
                            { header: 'Papel', align: 'center' },
                            { header: 'Departamento', align: 'center' },
                            { header: 'Status', align: 'center' },
                            { header: 'Ações', align: 'right' },
                        ]}
                    >
                        {loading && (
                            <tr>
                                <td colSpan={5} className="px-6 py-6">
                                    <TableSkeleton rows={5} columns={5} />
                                </td>
                            </tr>
                        )}
                        {!loading && filteredUsers.map((user) => (
                            <SigmaTableRow key={user.id}>
                                <SigmaTableCell>
                                    <div className="flex items-center gap-3">
                                        <div className="size-10 rounded-xl bg-surface-alt flex items-center justify-center text-muted-foreground font-bold overflow-hidden">
                                            {user.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-bold text-foreground">{user.name}</p>
                                            <p className="text-xs text-muted-foreground">{user.email}</p>
                                        </div>
                                    </div>
                                </SigmaTableCell>
                                <SigmaTableCell align="center">
                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${user.role === 'ADMIN' ? 'bg-warning-soft text-warning-fg' :
                                        user.role === 'SUPERVISOR' ? 'bg-primary/10 text-primary' :
                                            'bg-surface-alt text-muted-foreground'
                                        }`}>
                                        {user.role}
                                    </span>
                                </SigmaTableCell>
                                <SigmaTableCell align="center">
                                    <span className="text-sm text-muted-foreground">{user.department?.name || '-'}</span>
                                </SigmaTableCell>
                                <SigmaTableCell align="center">
                                    <div className={`flex justify-center items-center gap-1.5 ${user.active ? 'text-success' : 'text-muted-foreground'}`}>
                                        <div className={`size-2 rounded-full ${user.active ? 'bg-success' : 'bg-slate-400'}`} />
                                        <span className="text-xs font-bold">{user.active ? 'Ativo' : 'Inativo'}</span>
                                    </div>
                                </SigmaTableCell>
                                <SigmaTableCell align="right">
                                    <div className="flex justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => editUser(user)}
                                            className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                                            title="Editar"
                                            aria-label={`Editar usuário ${user.name}`}
                                        >
                                            <Icon name="edit" className="size-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deactivateUser(user)}
                                            disabled={!user.active}
                                            className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                                            title="Inativar"
                                            aria-label={`Inativar usuário ${user.name}`}
                                        >
                                            <Icon name="delete" className="size-4" />
                                        </button>
                                    </div>
                                </SigmaTableCell>
                            </SigmaTableRow>
                        ))}
                        {!loading && filteredUsers.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-6 py-6">
                                    <EmptyState
                                        icon="group"
                                        title="Nenhum usuário encontrado"
                                        description="Ajuste os filtros ou cadastre um novo usuário para liberar acesso à equipe."
                                    />
                                </td>
                            </tr>
                        )}
                    </SigmaTable>

                    <aside className="rounded-xl border border-border bg-surface p-5 shadow-card h-fit">
                        <h2 className="text-lg font-bold text-foreground">{editingId ? 'Editar usuário' : 'Novo usuário'}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Usuários criados aqui já ficam vinculados à empresa do token atual.</p>

                        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nome</span>
                                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30" />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">E-mail</span>
                                <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30" />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Senha {editingId ? '(preencha para alterar)' : ''}</span>
                                <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required={!editingId} minLength={6} className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30" />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Papel</span>
                                <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })} className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30">
                                    <option value="ADMIN">ADMIN</option>
                                    <option value="SUPERVISOR">SUPERVISOR</option>
                                    <option value="ATTENDANT">Atendente</option>
                                    <option value="TECHNICIAN">Técnico</option>
                                </select>
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Departamento</span>
                                <select value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30">
                                    <option value="">Sem departamento</option>
                                    {departments.filter((department) => department.active).map((department) => (
                                        <option key={department.id} value={department.id}>{department.name}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assinatura da mensagem</span>
                                <input
                                    value={form.messageSignature}
                                    onChange={(event) => setForm({ ...form, messageSignature: event.target.value })}
                                    placeholder="Guilherme Dias | Suporte tecnico"
                                    className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30"
                                />
                                <p className="mt-1 text-xs text-muted-foreground">Será adicionada no início das mensagens enviadas por este usuário.</p>
                            </label>
                            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} className="h-4 w-4 accent-primary" />
                                Usuário ativo
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
