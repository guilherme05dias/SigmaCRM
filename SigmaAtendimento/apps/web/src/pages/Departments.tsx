import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Department } from '@sigma/shared';
import { SigmaTopbar } from '../components/sigma/SigmaTopbar';
import { SigmaMetricCard } from '../components/sigma/SigmaMetricCard';
import { SigmaTable, SigmaTableRow, SigmaTableCell } from '../components/sigma/SigmaTable';
import { Icon } from '../components/ui/Icon';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';

export default function Departments() {
    const navigate = useNavigate();
    const [departments, setDepartments] = useState<Department[]>([]);

    useEffect(() => {
        apiRequest<Department[]>('/api/departments')
            .then(data => setDepartments(data))
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
                        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Gestão de Departamentos</h1>
                        <p className="text-muted-foreground mt-1">Configure os setores da empresa habilitados para atendimento.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="flex items-center gap-2 px-4 py-2.5 bg-surface border border-border rounded-pill font-semibold text-sm text-foreground hover:bg-surface-alt transition-all shadow-sm cursor-pointer">
                            <Icon name="filter_list" className="size-5" />
                            Filtros
                        </button>
                        <button className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-pill font-bold text-sm hover:bg-primary-700 transition-all shadow-primary-glow cursor-pointer">
                            <Icon name="domain_add" className="size-5" />
                            Novo departamento
                        </button>
                    </div>
                </div>

                {/* Stats Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <SigmaMetricCard title="Total" value={departments.length || 0} icon="domain" colorClass="primary" />
                    <SigmaMetricCard title="Ativos" value={departments.filter(d => (d as any).active ?? d.ativo).length || 0} icon="domain_verification" colorClass="secondary" />
                    <SigmaMetricCard title="Inativos" value={departments.filter(d => !((d as any).active ?? d.ativo)).length || 0} icon="block" colorClass="slate-500" />
                </div>

                {/* Departments Table */}
                <SigmaTable
                    columns={[
                        { header: 'Departamento', align: 'left' },
                        { header: 'Descrição', align: 'left' },
                        { header: 'Status', align: 'center' },
                        { header: 'Ações', align: 'right' }
                    ]}
                >
                    {departments.map(dept => (
                        <SigmaTableRow key={dept.id}>
                            <SigmaTableCell>
                                <div className="flex items-center gap-3">
                                    <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold overflow-hidden shadow-sm">
                                        <Icon name="domain" className="size-5" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-foreground">{(dept as any).name ?? dept.nome}</p>
                                    </div>
                                </div>
                            </SigmaTableCell>
                            <SigmaTableCell>
                                <p className="text-sm text-muted-foreground">{(dept as any).description ?? dept.descricao ?? '-'}</p>
                            </SigmaTableCell>
                            <SigmaTableCell align="center">
                                <div className={`flex justify-center items-center gap-1.5 ${((dept as any).active ?? dept.ativo) ? 'text-success' : 'text-muted-foreground'}`}>
                                    <div className={`size-2 rounded-full ${((dept as any).active ?? dept.ativo) ? 'bg-success' : 'bg-slate-400'}`}></div>
                                    <span className="text-xs font-bold">{((dept as any).active ?? dept.ativo) ? 'Ativo' : 'Inativo'}</span>
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
                    {departments.length === 0 && (
                        <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">Nenhum registro encontrado.</td>
                        </tr>
                    )}
                </SigmaTable>
            </main>
        </div>
    );
}
