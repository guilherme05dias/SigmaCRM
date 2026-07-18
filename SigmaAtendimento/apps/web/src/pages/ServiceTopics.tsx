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

interface ServiceTopicItem {
    id: string;
    name: string;
    description?: string | null;
    active: boolean;
}

interface ServiceTopicFormState {
    name: string;
    description: string;
    active: boolean;
}

const initialForm: ServiceTopicFormState = {
    name: '',
    description: '',
    active: true,
};

export default function ServiceTopics() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { showToast } = useToast();
    const [topics, setTopics] = useState<ServiceTopicItem[]>([]);
    const [form, setForm] = useState<ServiceTopicFormState>(initialForm);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showFilters, setShowFilters] = useState(false);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadTopics = () => {
        setLoading(true);
        setError(null);
        apiRequest<ServiceTopicItem[]>('/api/service-topics?includeInactive=true')
            .then(setTopics)
            .catch((err) => {
                if (!redirectOnUnauthorized(err, navigate)) {
                    const message = err instanceof Error ? err.message : 'Erro ao carregar sistemas/assuntos.';
                    setError(message);
                    showToast({ title: 'Erro ao carregar sistemas/assuntos', description: message, variant: 'error' });
                }
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadTopics();
    }, [navigate]);

    const filteredTopics = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return topics.filter((topic) => {
            const matchesQuery = !normalizedQuery
                || topic.name.toLowerCase().includes(normalizedQuery)
                || (topic.description || '').toLowerCase().includes(normalizedQuery);
            const matchesStatus = !statusFilter
                || (statusFilter === 'active' && topic.active)
                || (statusFilter === 'inactive' && !topic.active);
            return matchesQuery && matchesStatus;
        });
    }, [topics, query, statusFilter]);

    const resetForm = () => {
        setEditingId(null);
        setForm(initialForm);
    };

    const editTopic = (topic: ServiceTopicItem) => {
        setEditingId(topic.id);
        setForm({
            name: topic.name,
            description: topic.description || '',
            active: topic.active,
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
                await apiRequest<ServiceTopicItem>(`/api/service-topics/${editingId}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                });
            } else {
                await apiRequest<ServiceTopicItem>('/api/service-topics', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
            }
            resetForm();
            showToast({
                title: editingId ? 'Sistema/assunto atualizado' : 'Sistema/assunto criado',
                description: editingId ? 'As alteracoes foram salvas.' : 'O item foi cadastrado com sucesso.',
                variant: 'success',
            });
            loadTopics();
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Erro ao salvar sistema/assunto.';
                showToast({ title: 'Erro ao salvar sistema/assunto', description: message, variant: 'error' });
            }
        } finally {
            setSaving(false);
        }
    };

    const deactivateTopic = async (topic: ServiceTopicItem) => {
        setError(null);
        try {
            await apiRequest<void>(`/api/service-topics/${topic.id}`, { method: 'DELETE' });
            showToast({ title: 'Sistema/assunto inativado', description: `${topic.name} foi inativado.`, variant: 'success' });
            loadTopics();
        } catch (err) {
            if (!redirectOnUnauthorized(err, navigate)) {
                const message = err instanceof Error ? err.message : 'Erro ao inativar sistema/assunto.';
                showToast({ title: 'Erro ao inativar sistema/assunto', description: message, variant: 'error' });
            }
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
            <SigmaTopbar user={user} onLogout={logout} />

            <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 pb-24 sm:p-6 sm:pb-24 md:pb-6 lg:p-10">
                <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Sistemas e Assuntos</h1>
                        <p className="mt-1 text-muted-foreground">
                            Cadastre os sistemas e motivos usados para classificar encerramentos, chamados e relatorios.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button type="button" variant="outline" onClick={() => setShowFilters((current) => !current)}>
                            <Icon name="filter_list" className="size-5" />
                            Filtros
                        </Button>
                        <Button type="button" onClick={resetForm}>
                            <Icon name="add_business" className="size-5" />
                            Novo item
                        </Button>
                    </div>
                </div>

                <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
                    <SigmaMetricCard title="Total" value={topics.length || 0} icon="hub" colorClass="primary" />
                    <SigmaMetricCard title="Ativos" value={topics.filter((topic) => topic.active).length || 0} icon="check_circle" colorClass="secondary" />
                    <SigmaMetricCard title="Inativos" value={topics.filter((topic) => !topic.active).length || 0} icon="block" colorClass="slate-500" />
                </div>

                {showFilters && (
                    <div className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface p-4 shadow-card md:grid-cols-[1fr_220px]">
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Busca</span>
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Sistema, produto ou assunto"
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
                            { header: 'Sistema / Assunto', align: 'left' },
                            { header: 'Descricao', align: 'left' },
                            { header: 'Status', align: 'center' },
                            { header: 'Acoes', align: 'right' },
                        ]}
                    >
                        {loading && (
                            <tr>
                                <td colSpan={4} className="px-6 py-6">
                                    <TableSkeleton rows={5} columns={4} />
                                </td>
                            </tr>
                        )}
                        {!loading && filteredTopics.map((topic) => (
                            <SigmaTableRow key={topic.id}>
                                <SigmaTableCell>
                                    <div className="flex items-center gap-3">
                                        <div className="flex size-10 items-center justify-center overflow-hidden rounded-xl bg-primary/10 font-bold text-primary shadow-sm">
                                            <Icon name="hub" className="size-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-foreground">{topic.name}</p>
                                        </div>
                                    </div>
                                </SigmaTableCell>
                                <SigmaTableCell>
                                    <p className="text-sm text-muted-foreground">{topic.description || '-'}</p>
                                </SigmaTableCell>
                                <SigmaTableCell align="center">
                                    <div className={`flex items-center justify-center gap-1.5 ${topic.active ? 'text-success' : 'text-muted-foreground'}`}>
                                        <div className={`size-2 rounded-full ${topic.active ? 'bg-success' : 'bg-slate-400'}`} />
                                        <span className="text-xs font-bold">{topic.active ? 'Ativo' : 'Inativo'}</span>
                                    </div>
                                </SigmaTableCell>
                                <SigmaTableCell align="right">
                                    <div className="flex justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => editTopic(topic)}
                                            className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                                            title="Editar"
                                            aria-label={`Editar sistema/assunto ${topic.name}`}
                                        >
                                            <Icon name="edit" className="size-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deactivateTopic(topic)}
                                            disabled={!topic.active}
                                            className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                                            title="Inativar"
                                            aria-label={`Inativar sistema/assunto ${topic.name}`}
                                        >
                                            <Icon name="delete" className="size-4" />
                                        </button>
                                    </div>
                                </SigmaTableCell>
                            </SigmaTableRow>
                        ))}
                        {!loading && filteredTopics.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-6 py-6">
                                    <EmptyState
                                        icon="hub"
                                        title="Nenhum sistema ou assunto encontrado"
                                        description="Cadastre a lista que sera usada no encerramento dos atendimentos e nos relatorios."
                                    />
                                </td>
                            </tr>
                        )}
                    </SigmaTable>

                    <aside className="h-fit rounded-xl border border-border bg-surface p-5 shadow-card">
                        <h2 className="text-lg font-bold text-foreground">{editingId ? 'Editar sistema/assunto' : 'Novo sistema/assunto'}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Esta lista sera obrigatoria ao finalizar um atendimento. Use "Outro" para casos livres.
                        </p>

                        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nome</span>
                                <input
                                    value={form.name}
                                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                                    required
                                    placeholder="Ex.: Sistema PDV, Rede / Internet, Outro"
                                    className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Descricao</span>
                                <textarea
                                    value={form.description}
                                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                                    rows={4}
                                    placeholder="Quando este assunto deve ser usado?"
                                    className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                                />
                            </label>
                            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                <input
                                    type="checkbox"
                                    checked={form.active}
                                    onChange={(event) => setForm({ ...form, active: event.target.checked })}
                                    className="h-4 w-4 accent-primary"
                                />
                                Item ativo
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
