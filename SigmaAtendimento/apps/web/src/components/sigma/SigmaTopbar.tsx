import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../ui/Icon';

interface SigmaTopbarProps {
    user: any;
    onLogout: () => void;
}

export function SigmaTopbar({ user, onLogout }: SigmaTopbarProps) {
    const location = useLocation();

    const navLinkClass = (path: string) =>
        `text-sm font-medium transition-colors ${location.pathname === path
            ? 'text-primary border-b-2 border-primary pb-1 font-semibold'
            : 'text-muted-foreground hover:text-primary'
        }`;

    return (
        <header className="sticky top-0 z-50 bg-surface border-b border-border px-6 py-3">
            <div className="max-w-[1440px] mx-auto flex items-center justify-between">
                <div className="flex items-center gap-8">
                    <div className="flex items-center gap-3 text-primary">
                        <div className="size-8 bg-primary rounded-lg flex items-center justify-center text-white">
                            <Icon name="grid_view" className="size-5" />
                        </div>
                        <h2 className="text-foreground text-xl font-bold leading-tight tracking-tight font-display">Sigma</h2>
                    </div>

                    <nav className="hidden md:flex items-center gap-6">
                        <Link to="/" className={navLinkClass('/')}>Dashboard</Link>
                        <Link to="/inbox" className={navLinkClass('/inbox')}>Inbox</Link>
                        <Link to="/tickets" className={navLinkClass('/tickets')}>Tickets</Link>
                        <Link to="/customers" className={navLinkClass('/customers')}>Clientes</Link>
                        <Link to="/users" className={navLinkClass('/users')}>Usuários</Link>
                        <Link to="/departments" className={navLinkClass('/departments')}>Departamentos</Link>
                        <Link to="/reports" className={navLinkClass('/reports')}>Relatórios</Link>
                        <Link to="/settings" className={navLinkClass('/settings')}>Configurações</Link>
                    </nav>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative hidden sm:block">
                        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-5" />
                        <input
                            type="text"
                            placeholder="Pesquisar..."
                            className="bg-surface-alt border border-transparent rounded-pill pl-10 pr-4 py-2 text-sm w-64 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all placeholder:text-muted-foreground"
                        />
                    </div>

                    <button className="p-2 text-muted-foreground hover:bg-surface-alt hover:text-foreground rounded-xl transition-colors relative">
                        <Icon name="notifications" className="size-5" />
                        {/* Notification dot placeholder */}
                        <span className="absolute top-1 right-1 size-2 rounded-full bg-primary"></span>
                    </button>

                    <div className="h-8 w-[1px] bg-border mx-2"></div>

                    <div className="flex items-center gap-3">
                        <div className="text-right hidden lg:block">
                            <p className="text-sm font-semibold text-foreground">{user?.nome || 'Usuário'}</p>
                            <p className="text-xs text-muted-foreground">{user?.role || 'Agente'}</p>
                        </div>
                        <div className="group relative cursor-pointer">
                            <div className="size-10 rounded-full border-2 border-primary/20 p-0.5 bg-primary-50 flex items-center justify-center text-primary font-bold">
                                {user?.nome?.charAt(0).toUpperCase() || 'U'}
                            </div>

                            {/* Dropdown Menu */}
                            <div className="absolute right-0 top-full pt-2 hidden group-hover:block w-32 z-50">
                                <div className="bg-surface border border-border rounded-lg shadow-lifted py-1 overflow-hidden">
                                    <button className="w-full text-left px-4 py-2 text-sm text-muted-foreground hover:bg-surface-alt transition-colors">
                                        Conta
                                    </button>
                                    <button
                                        onClick={onLogout}
                                        className="w-full text-left px-4 py-2 text-sm text-danger hover:bg-danger-soft transition-colors"
                                    >
                                        Sair
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
