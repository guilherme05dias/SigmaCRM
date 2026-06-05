import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '@sigma/shared';
import { SigmaTopbar } from '../components/sigma/SigmaTopbar';
import { SigmaMetricCard } from '../components/sigma/SigmaMetricCard';
import { SigmaTable, SigmaTableRow, SigmaTableCell } from '../components/sigma/SigmaTable';
import { Icon } from '../components/ui/Icon';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';

export default function Users() {
    const navigate = useNavigate();
    const [users, setUsers] = useState<User[]>([]);

    useEffect(() => {
        apiRequest<User[]>('/api/users')
            .then(data => setUsers(data))
            .catch(err => {
                if (!redirectOnUnauthorized(err, navigate)) console.error(err);
            });
    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem('sigma-token');
        navigate('/login');
    };

    const mockUser = { nome: 'Admin', role: 'Administrador' };

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground font-sans">
            <SigmaTopbar user={mockUser} onLogout={handleLogout} />

            <main className="flex-1 max-w-[1440px] mx-auto w-full p-6 lg:p-10">
                {/* Header Actions */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Gerenciamento de Usuários</h1>
                        <p className="text-muted-foreground mt-1">Controle acessos, permissões e departamentos da sua equipe.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="flex items-center gap-2 px-4 py-2.5 bg-surface border border-border rounded-pill font-semibold text-sm text-foreground hover:bg-surface-alt transition-all shadow-sm cursor-pointer">
                            <Icon name="filter_list" className="size-5" />
                            Filtros
                        </button>
                        <button className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-pill font-bold text-sm hover:bg-primary-700 transition-all shadow-primary-glow cursor-pointer">
                            <Icon name="person_add" className="size-5" />
                            Novo usuário
                        </button>
                    </div>
                </div>

                {/* Stats Overview */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <SigmaMetricCard title="Total" value={users.length || 0} icon="group" colorClass="primary" />
                    <SigmaMetricCard title="Ativos" value={users.filter(u => (u as any).active ?? u.ativo).length || 0} icon="verified_user" colorClass="secondary" />
                    <SigmaMetricCard title="Admins" value={users.filter(u => u.role === 'ADMIN').length || 0} icon="manage_accounts" colorClass="amber-500" />
                    <SigmaMetricCard title="Inativos" value={users.filter(u => !((u as any).active ?? u.ativo)).length || 0} icon="block" colorClass="slate-500" />
                </div>

                {/* Users Table */}
                <SigmaTable
                    columns={[
                        { header: 'Nome & E-mail', align: 'left' },
                        { header: 'Papel', align: 'center' },
                        { header: 'Status', align: 'center' },
                        { header: 'Ações', align: 'right' }
                    ]}
                >
                    {users.map(user => (
                        <SigmaTableRow key={user.id}>
                            <SigmaTableCell>
                                <div className="flex items-center gap-3">
                                    <div className="size-10 rounded-xl bg-surface-alt flex items-center justify-center text-muted-foreground font-bold overflow-hidden">
                                        {((user as any).name ?? user.nome).charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-bold text-foreground">{(user as any).name ?? user.nome}</p>
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
                                <div className={`flex justify-center items-center gap-1.5 ${((user as any).active ?? user.ativo) ? 'text-success' : 'text-muted-foreground'}`}>
                                    <div className={`size-2 rounded-full ${((user as any).active ?? user.ativo) ? 'bg-success' : 'bg-slate-400'}`}></div>
                                    <span className="text-xs font-bold">{((user as any).active ?? user.ativo) ? 'Ativo' : 'Inativo'}</span>
                                </div>
                            </SigmaTableCell>
                            <SigmaTableCell align="right">
                                <div className="flex justify-end gap-2">
                                    <button className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all cursor-pointer">
                                        <Icon name="edit" className="size-4" />
                                    </button>
                                    <button className="p-2 text-muted-foreground hover:text-danger hover:bg-danger-soft rounded-lg transition-all cursor-pointer">
                                        <Icon name="delete" className="size-4" />
                                    </button>
                                </div>
                            </SigmaTableCell>
                        </SigmaTableRow>
                    ))}
                    {users.length === 0 && (
                        <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">Nenhum registro encontrado.</td>
                        </tr>
                    )}
                </SigmaTable>
            </main>
        </div>
    );
}
