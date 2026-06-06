import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SigmaSidebarIcon } from '../components/sigma/SigmaSidebarIcon';
import { StatusBadge, PriorityBadge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { TableSkeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';
import { useAuth } from '../lib/auth';

export interface Ticket {
    id: string;
    protocol?: string;
    title: string;
    description: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    status: 'NEW' | 'QUEUED' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'WAITING_INTERNAL' | 'SCHEDULED_FIELD_SERVICE' | 'RESOLVED' | 'CLOSED' | 'CANCELED';
    contact: { name?: string | null; phone: string };
    customer?: { name: string } | null;
    assignedUser?: { name?: string; nome?: string };
    department?: { name?: string; nome?: string };
    fieldService?: {
        onSiteRequired?: boolean;
        visitAddress?: string | null;
        visitWindowStart?: string | null;
        visitWindowEnd?: string | null;
        technician?: { name?: string; nome?: string } | null;
    } | null;
    createdAt: string;
}

export default function Tickets() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { showToast } = useToast();
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [priorityFilter, setPriorityFilter] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadTickets = () => {
        setIsLoading(true);
        setError(null);
        let url = '/api/tickets?';
        if (statusFilter) url += `status=${statusFilter}&`;
        if (priorityFilter) url += `priority=${priorityFilter}&`;

        apiRequest<Ticket[] | { data: Ticket[] }>(url)
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
    }, [statusFilter, priorityFilter]);

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

    return (
        <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden">
            <SigmaSidebarIcon user={user} onLogout={logout} />
            <main className="flex-1 flex flex-col overflow-y-auto p-4 pb-20 md:p-8 md:pb-8">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-display font-bold text-foreground mb-2">Chamados e Atendimentos</h1>
                        <p className="text-muted-foreground">Gerencie ordens de serviço presenciais e remotas</p>
                    </div>
                </div>

                <div className="flex gap-4 mb-6 bg-surface p-4 rounded-xl border border-border shadow-card">
                    <div className="flex-1 max-w-xs">
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Status</label>
                        <select
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
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Prioridade</label>
                        <select
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
                </div>

                <div className="bg-surface rounded-xl border border-border shadow-card overflow-hidden flex-1 flex flex-col">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-surface-alt border-b border-border">
                                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cliente / Título</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prioridade</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Janela de Visita</th>
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
                                            {ticket.fieldService?.onSiteRequired ? (
                                                (ticket.fieldService.visitWindowStart && ticket.fieldService.visitWindowEnd) ? (
                                                    <span>Agendado para {new Date(ticket.fieldService.visitWindowStart).toLocaleDateString()} {new Date(ticket.fieldService.visitWindowStart).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}-{new Date(ticket.fieldService.visitWindowEnd).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                ) : <span className="text-muted-foreground">A agendar</span>
                                            ) : (
                                                <span className="text-muted-foreground">N/A (Remoto)</span>
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
                                                    className="text-xs font-semibold text-primary hover:text-primary-700 transition-colors cursor-pointer"
                                                    aria-label={`Iniciar chamado ${ticket.protocol || ticket.title}`}
                                                >
                                                    Iniciar
                                                </button>
                                            )}
                                            {ticket.status === 'IN_PROGRESS' && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleStatusUpdate(ticket.id, 'RESOLVED')}
                                                    className="text-xs font-semibold text-success hover:text-success-fg transition-colors cursor-pointer"
                                                    aria-label={`Resolver chamado ${ticket.protocol || ticket.title}`}
                                                >
                                                    Resolver
                                                </button>
                                            )}
                                            <Link to={`/tickets/${ticket.id}`} className="ml-3 text-xs font-semibold text-primary hover:text-primary-700" aria-label={`Ver detalhes do chamado ${ticket.protocol || ticket.title}`}>
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
        </div>
    );
}
