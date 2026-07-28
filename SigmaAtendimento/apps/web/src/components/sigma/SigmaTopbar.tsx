import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { ThemeToggle } from '../ui/ThemeToggle';

interface SigmaTopbarProps {
    user: any;
    onLogout: () => void;
}

export function SigmaTopbar({ user, onLogout }: SigmaTopbarProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [showNotifications, setShowNotifications] = useState(false);
    const [showAccount, setShowAccount] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const canManage = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';

    const navigation = [
        { path: '/', label: 'Dashboard', icon: 'dashboard' as const },
        { path: '/inbox', label: 'Atendimentos', icon: 'chat' as const },
        { path: '/tickets', label: 'Chamados', icon: 'local_activity' as const },
        { path: '/tasks', label: 'Tarefas', icon: 'task_list' as const },
        { path: '/customers', label: 'Clientes', icon: 'business' as const },
        { path: '/assistant', label: 'Assistente', icon: 'assistant' as const },
        { path: '/reports', label: 'Relatórios', icon: 'bar_chart' as const },
        ...(canManage ? [
            { path: '/users', label: 'Usuários', icon: 'group' as const },
            { path: '/departments', label: 'Departamentos', icon: 'domain' as const },
            { path: '/service-topics', label: 'Assuntos', icon: 'hub' as const },
            { path: '/settings', label: 'Configurações', icon: 'settings' as const },
        ] : []),
    ];

    const handleSearch = (event: FormEvent) => {
        event.preventDefault();
        const query = search.trim();
        if (!query) return;
        navigate(`/customers?query=${encodeURIComponent(query)}`);
    };

    const navLinkClass = (path: string) =>
        `text-sm font-medium transition-colors ${location.pathname === path
            ? 'text-primary border-b-2 border-primary pb-1 font-semibold'
            : 'text-muted-foreground hover:text-primary'
        }`;

    return (
        <>
        <header className="sticky top-0 z-50 border-b border-border bg-surface px-6 py-3">
            <div className="mx-auto flex max-w-[1440px] items-center justify-between">
                <div className="flex items-center gap-8">
                    <div className="flex items-center gap-3 text-primary">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-primary-solid text-primary-solid-fg">
                            <Icon name="grid_view" className="size-5" />
                        </div>
                        <h2 className="font-display text-xl font-bold leading-tight tracking-tight text-foreground">Sigma</h2>
                    </div>

                    <nav aria-label="Navegação principal" className="hidden items-center gap-5 2xl:flex">
                        <Link to="/" className={navLinkClass('/')}>Dashboard</Link>
                        <Link to="/inbox" className={navLinkClass('/inbox')}>Atendimentos</Link>
                        <Link to="/tickets" className={navLinkClass('/tickets')}>Chamados</Link>
                        <Link to="/tasks" className={navLinkClass('/tasks')}>Tarefas</Link>
                        <Link to="/customers" className={navLinkClass('/customers')}>Clientes</Link>
                        <Link to="/assistant" className={navLinkClass('/assistant')}>Assistente</Link>
                        <Link to="/users" className={navLinkClass('/users')}>Usuarios</Link>
                        <Link to="/departments" className={navLinkClass('/departments')}>Departamentos</Link>
                        <Link to="/service-topics" className={navLinkClass('/service-topics')}>Assuntos</Link>
                        <Link to="/reports" className={navLinkClass('/reports')}>Relatorios</Link>
                        <Link to="/settings" className={navLinkClass('/settings')}>Configuracoes</Link>
                    </nav>
                </div>

                <div className="flex items-center gap-4">
                    <form onSubmit={handleSearch} className="relative hidden lg:block">
                        <Icon name="search" className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Pesquisar..."
                            aria-label="Pesquisar clientes"
                            className="w-64 rounded-pill border border-transparent bg-surface-alt py-2 pl-10 pr-4 text-sm text-foreground transition-all placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </form>

                    <div className="relative 2xl:hidden">
                        <button
                            type="button"
                            onClick={() => setShowMenu((current) => !current)}
                            className="flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground"
                            aria-label="Abrir navegação"
                            aria-expanded={showMenu}
                            aria-controls="sigma-compact-navigation"
                        >
                            <Icon name="grid_view" className="size-5" />
                        </button>
                        {showMenu && (
                            <nav id="sigma-compact-navigation" aria-label="Navegação compacta" className="absolute right-0 top-full z-[70] mt-2 hidden w-72 rounded-xl border border-border bg-surface p-2 shadow-lifted md:block">
                                <div className="grid grid-cols-2 gap-1">
                                    {navigation.map((item) => (
                                        <Link
                                            key={item.path}
                                            to={item.path}
                                            onClick={() => setShowMenu(false)}
                                            aria-current={location.pathname === item.path ? 'page' : undefined}
                                            className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${location.pathname === item.path ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-surface-alt'}`}
                                        >
                                            <Icon name={item.icon} className="size-5" />
                                            {item.label}
                                        </Link>
                                    ))}
                                </div>
                            </nav>
                        )}
                    </div>

                    <ThemeToggle />

                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setShowNotifications((current) => !current)}
                            className="relative flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground"
                            title="Notificacoes"
                            aria-label="Abrir notificacoes"
                            aria-expanded={showNotifications}
                            aria-controls="sigma-notifications-menu"
                        >
                            <Icon name="notifications" className="size-5" />
                        </button>
                        {showNotifications && (
                            <div id="sigma-notifications-menu" className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-border bg-surface p-4 shadow-lifted">
                                <p className="text-sm font-semibold text-foreground">Notificacoes</p>
                                <p className="mt-2 text-sm text-muted-foreground">Nenhuma notificacao nova no momento.</p>
                            </div>
                        )}
                    </div>

                    <div className="mx-2 h-8 w-px bg-border" />

                    <div className="flex items-center gap-3">
                        <div className="hidden text-right lg:block">
                            <p className="text-sm font-semibold text-foreground">{user?.name || 'Usuario'}</p>
                            <p className="text-xs text-muted-foreground">{user?.role || 'Atendente'}</p>
                        </div>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowAccount((current) => !current)}
                                className="flex size-11 cursor-pointer items-center justify-center rounded-full border-2 border-primary/20 bg-primary-50 p-0.5 font-bold text-primary"
                                title="Menu da conta"
                                aria-label="Abrir menu da conta"
                                aria-expanded={showAccount}
                                aria-controls="sigma-account-menu"
                            >
                                {user?.name?.charAt(0).toUpperCase() || 'U'}
                            </button>

                            {showAccount && (
                                <div id="sigma-account-menu" className="absolute right-0 top-full z-50 mt-2 w-40">
                                    <div className="overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lifted">
                                        <div className="border-b border-border px-4 py-2">
                                            <p className="text-sm font-semibold text-foreground">{user?.name || 'Usuario'}</p>
                                            <p className="truncate text-xs text-muted-foreground">{user?.email || user?.role || 'Atendente'}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={onLogout}
                                            className="w-full px-4 py-2 text-left text-sm text-danger transition-colors hover:bg-danger-soft"
                                        >
                                            Sair
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </header>
        <nav aria-label="Navegação móvel" className="fixed inset-x-0 bottom-0 z-50 grid h-[72px] grid-cols-5 border-t border-border bg-surface md:hidden">
            {navigation.slice(0, 4).map((item) => (
                <Link
                    key={item.path}
                    to={item.path}
                    aria-current={location.pathname === item.path ? 'page' : undefined}
                    className={`flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium ${location.pathname === item.path ? 'text-primary' : 'text-muted-foreground'}`}
                >
                    <Icon name={item.icon} className="size-5" />
                    <span className="max-w-full truncate px-1">{item.label}</span>
                </Link>
            ))}
            <button
                type="button"
                onClick={() => setShowMenu((current) => !current)}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium ${showMenu ? 'text-primary' : 'text-muted-foreground'}`}
                aria-label="Abrir mais opções"
                aria-expanded={showMenu}
                aria-controls="sigma-mobile-navigation"
            >
                <Icon name="grid_view" className="size-5" />
                <span>Mais</span>
            </button>
            {showMenu && (
                <div id="sigma-mobile-navigation" className="absolute bottom-[80px] right-2 w-[min(320px,calc(100vw-16px))] rounded-xl border border-border bg-surface p-2 shadow-lifted">
                    <div className="grid grid-cols-2 gap-1">
                        {navigation.slice(4).map((item) => (
                            <Link key={item.path} to={item.path} onClick={() => setShowMenu(false)} className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-alt">
                                <Icon name={item.icon} className="size-5" />
                                {item.label}
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </nav>
        </>
    );
}
