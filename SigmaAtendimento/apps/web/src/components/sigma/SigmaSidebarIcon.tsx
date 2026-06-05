import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../ui/Icon';

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
        <aside className="w-20 flex flex-col items-center py-6 bg-surface border-r border-border flex-shrink-0 z-50">
            <div className="mb-8">
                <Link to="/" className="px-5 py-3 rounded-3xl rounded-tr-none bg-primary text-white flex items-center justify-center shadow-primary-glow">
                    <Icon name="chat_bubble" className="size-7" />
                </Link>
            </div>

            <nav className="flex flex-col gap-6 flex-1">
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

            <div className="flex flex-col gap-4 mt-auto">
                <Link to="/settings" className="p-3 text-muted-foreground hover:text-foreground transition-colors" title="Configurações">
                    <Icon name="settings" className="size-6" />
                </Link>

                <div className="group relative cursor-pointer">
                    <div className="size-10 rounded-full border-2 border-primary/30 p-0.5 bg-primary-50 flex items-center justify-center text-primary font-bold text-sm">
                        {user?.nome?.charAt(0).toUpperCase() || 'U'}
                    </div>

                    {/* Dropdown Menu */}
                    <div className="absolute left-full ml-4 bottom-0 hidden group-hover:block w-32 z-50">
                        <div className="bg-surface border border-border rounded-lg shadow-lifted py-1 overflow-hidden">
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
