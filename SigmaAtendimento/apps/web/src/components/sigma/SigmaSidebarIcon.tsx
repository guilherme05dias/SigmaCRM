import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { ThemeToggle } from '../ui/ThemeToggle';

interface SigmaSidebarIconProps {
    user: any;
    onLogout: () => void;
}

export function SigmaSidebarIcon({ user, onLogout }: SigmaSidebarIconProps) {
    const location = useLocation();

    const navLinkClass = (path: string) => {
        const isActive = location.pathname === path;
        return `p-3 rounded-2xl transition-colors ${isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-surface-alt hover:text-foreground'
            }`;
    };

    return (
        <aside className="fixed inset-x-0 bottom-0 z-50 flex h-16 items-center gap-2 overflow-x-auto border-t border-border bg-surface px-3 md:static md:inset-auto md:h-screen md:w-20 md:flex-shrink-0 md:flex-col md:items-center md:overflow-visible md:border-r md:border-t-0 md:px-0 md:py-6">
            <div className="hidden md:mb-8 md:block">
                <Link to="/" className="px-5 py-3 rounded-3xl rounded-tr-none bg-primary text-white flex items-center justify-center shadow-primary-glow">
                    <Icon name="chat_bubble" className="size-7" />
                </Link>
            </div>

            <nav className="flex flex-1 items-center gap-2 md:flex-col md:gap-6">
                <Link to="/" className={navLinkClass('/')} title="Dashboard">
                    <Icon name="dashboard" className="size-6" />
                </Link>
                <Link to="/inbox" className={navLinkClass('/inbox')} title="Inbox">
                    <Icon name="chat" className="size-6" />
                </Link>
                <Link to="/tickets" className={navLinkClass('/tickets')} title="Tickets">
                    <Icon name="local_activity" className="size-6" />
                </Link>
                <Link to="/customers" className={navLinkClass('/customers')} title="Clientes">
                    <Icon name="business" className="size-6" />
                </Link>
                <Link to="/users" className={navLinkClass('/users')} title="Usuários">
                    <Icon name="group" className="size-6" />
                </Link>
                <Link to="/departments" className={navLinkClass('/departments')} title="Departamentos">
                    <Icon name="domain" className="size-6" />
                </Link>
                <Link to="/reports" className={navLinkClass('/reports')} title="Relatórios">
                    <Icon name="bar_chart" className="size-6" />
                </Link>
            </nav>

            <div className="ml-auto flex items-center gap-2 md:ml-0 md:mt-auto md:flex-col md:gap-4">
                <ThemeToggle />

                <Link to="/settings" className="p-3 text-muted-foreground hover:text-foreground transition-colors" title="Configurações">
                    <Icon name="settings" className="size-6" />
                </Link>

                <div className="group relative cursor-pointer">
                    <div className="size-10 rounded-full border-2 border-primary/30 p-0.5 bg-primary-50 flex items-center justify-center text-primary font-bold text-sm">
                        {user?.name?.charAt(0).toUpperCase() || 'U'}
                    </div>

                    {/* Dropdown Menu */}
                    <div className="absolute bottom-full right-0 mb-3 hidden w-44 group-hover:block md:bottom-0 md:left-full md:right-auto md:mb-0 md:ml-4">
                        <div className="bg-surface border border-border rounded-lg shadow-lifted py-1 overflow-hidden">
                            <div className="border-b border-border px-4 py-2">
                                <p className="truncate text-sm font-semibold text-foreground">{user?.name || 'Usuário'}</p>
                                <p className="truncate text-xs text-muted-foreground">{user?.email || user?.role || 'Agente'}</p>
                            </div>
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
        </aside>
    );
}
