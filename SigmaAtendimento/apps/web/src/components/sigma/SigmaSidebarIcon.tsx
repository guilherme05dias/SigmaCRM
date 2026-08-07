import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../ui/Icon';
import { ThemeToggle } from '../ui/ThemeToggle';
import { NotificationBell } from './NotificationBell';

interface SigmaSidebarIconProps {
    user: any;
    onLogout: () => void;
    collapsible?: boolean;
}

type NavItem = { path: string; label: string; icon: IconName };

const primaryItems: NavItem[] = [
    { path: '/', label: 'Dashboard', icon: 'dashboard' },
    { path: '/inbox', label: 'Atendimentos', icon: 'chat' },
    { path: '/tickets', label: 'Chamados', icon: 'local_activity' },
    { path: '/tasks', label: 'Tarefas', icon: 'task_list' },
    { path: '/visits', label: 'Agenda técnica', icon: 'engineering' },
];

const secondaryItems: NavItem[] = [
    { path: '/customers', label: 'Clientes', icon: 'business' },
    { path: '/assistant', label: 'Assistente', icon: 'assistant' },
    { path: '/reports', label: 'Relatórios', icon: 'bar_chart' },
];

const managementItems: NavItem[] = [
    { path: '/users', label: 'Usuários', icon: 'group' },
    { path: '/departments', label: 'Departamentos', icon: 'domain' },
    { path: '/service-topics', label: 'Sistemas e assuntos', icon: 'hub' },
    { path: '/settings', label: 'Configurações', icon: 'settings' },
];

const technicianItems: NavItem[] = [
    { path: '/tickets', label: 'Chamados', icon: 'local_activity' },
    { path: '/tasks', label: 'Tarefas', icon: 'task_list' },
    { path: '/reports', label: 'Relatórios', icon: 'bar_chart' },
];

export function SigmaSidebarIcon({ user, onLogout, collapsible = false }: SigmaSidebarIconProps) {
    const location = useLocation();
    const canManage = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
    const isTechnician = user?.role === 'TECHNICIAN';
    const [moreOpen, setMoreOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const moreRef = useRef<HTMLDivElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);
    const drawerTriggerRef = useRef<HTMLButtonElement>(null);
    const drawerCloseRef = useRef<HTMLButtonElement>(null);
    const drawerWasOpenRef = useRef(false);

    const isActive = (path: string) => path === '/'
        ? location.pathname === '/'
        : location.pathname === path || location.pathname.startsWith(`${path}/`);

    useEffect(() => {
        setMoreOpen(false);
        setProfileOpen(false);
        setDrawerOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (!moreRef.current?.contains(target)) setMoreOpen(false);
            if (!profileRef.current?.contains(target)) setProfileOpen(false);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setMoreOpen(false);
                setProfileOpen(false);
                setDrawerOpen(false);
            }
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    useEffect(() => {
        if (!collapsible || !drawerOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [collapsible, drawerOpen]);

    useEffect(() => {
        if (!collapsible) return;
        const frame = window.requestAnimationFrame(() => {
            if (drawerOpen) {
                drawerWasOpenRef.current = true;
                drawerCloseRef.current?.focus();
            } else if (drawerWasOpenRef.current) {
                drawerWasOpenRef.current = false;
                drawerTriggerRef.current?.focus();
            }
        });
        return () => window.cancelAnimationFrame(frame);
    }, [collapsible, drawerOpen]);

    const desktopLink = (item: NavItem) => (
        <Link
            key={item.path}
            to={item.path}
            aria-label={item.label}
            aria-current={isActive(item.path) ? 'page' : undefined}
            title={item.label}
            className={`flex size-11 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${isActive(item.path)
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-surface-alt hover:text-foreground'
            }`}
        >
            <Icon name={item.icon} className="size-5" />
        </Link>
    );

    const menuLink = (item: NavItem) => (
        <Link
            key={item.path}
            to={item.path}
            aria-current={isActive(item.path) ? 'page' : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${isActive(item.path)
                ? 'bg-primary/10 text-primary'
                : 'text-foreground hover:bg-surface-alt'
            }`}
        >
            <Icon name={item.icon} className="size-5 text-current" />
            {item.label}
        </Link>
    );

    if (collapsible) {
        return (
            <>
                {!drawerOpen && (
                    <button
                        ref={drawerTriggerRef}
                        type="button"
                        onClick={() => setDrawerOpen(true)}
                        aria-label="Abrir menu principal"
                        aria-controls="sigma-navigation-drawer"
                        aria-expanded={false}
                        className="fixed left-3 top-2.5 z-40 flex size-11 items-center justify-center rounded-xl bg-primary-solid text-primary-solid-fg shadow-lifted transition-colors hover:bg-primary-solid-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                        <Icon name="menu" className="size-5" />
                    </button>
                )}

                {drawerOpen && (
                    <>
                        <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => setDrawerOpen(false)}
                            aria-label="Fechar menu principal"
                            className="fixed inset-0 z-40 cursor-default bg-black/60"
                        />

                        <aside
                            id="sigma-navigation-drawer"
                            aria-label="Menu principal"
                            className="fixed inset-y-0 left-0 z-50 flex w-[min(280px,calc(100vw-16px))] flex-col border-r border-border bg-surface shadow-lifted"
                        >
                            <div className="flex min-h-16 items-center gap-3 border-b border-border px-4">
                                <Link
                                    to="/"
                                    aria-label="Sigma Atendimento — início"
                                    className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-solid text-primary-solid-fg"
                                >
                                    <Icon name="chat_bubble" className="size-5" />
                                </Link>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold text-foreground">Sigma Atendimento</p>
                                    <p className="truncate text-xs text-muted-foreground">Navegação principal</p>
                                </div>
                                <button
                                    ref={drawerCloseRef}
                                    type="button"
                                    onClick={() => setDrawerOpen(false)}
                                    aria-label="Fechar menu principal"
                                    className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                >
                                    <Icon name="close" className="size-5" />
                                </button>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                                <nav aria-label="Navegação principal" className="space-y-1">
                                    {primaryItems.map(menuLink)}
                                    {secondaryItems.map(menuLink)}
                                </nav>

                                {canManage && (
                                    <nav aria-label="Administração" className="mt-3 space-y-1 border-t border-border pt-3">
                                        {managementItems.map(menuLink)}
                                    </nav>
                                )}
                            </div>

                            <div className="border-t border-border p-3">
                                <div className="mb-3 flex min-h-11 items-center gap-2">
                                    <NotificationBell />
                                    <ThemeToggle />
                                </div>
                                <div className="flex items-center gap-3 rounded-xl bg-surface-alt p-3">
                                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                                        {user?.name?.charAt(0).toUpperCase() || 'U'}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-foreground">{user?.name || 'Usuário'}</p>
                                        <p className="truncate text-xs text-muted-foreground">{user?.specialty || user?.role || 'Atendente'}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={onLogout}
                                        className="min-h-11 rounded-lg px-3 text-sm font-semibold text-danger transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                    >
                                        Sair
                                    </button>
                                </div>
                            </div>
                        </aside>
                    </>
                )}
            </>
        );
    }

    if (isTechnician) {
        return (
            <aside className="fixed inset-x-3 z-50 h-16 rounded-full border border-border bg-surface shadow-lifted bottom-[max(0.75rem,env(safe-area-inset-bottom))] md:static md:h-screen md:w-20 md:flex-shrink-0 md:rounded-none md:border-y-0 md:border-l-0 md:border-r">
                <div className="hidden h-full flex-col items-center py-5 md:flex">
                    <Link
                        to="/tickets"
                        aria-label="Sigma Atendimento — chamados"
                        className="mb-7 flex size-12 items-center justify-center rounded-xl border-2 border-primary-solid text-primary transition-colors hover:bg-primary/10"
                    >
                        <Icon name="engineering" className="size-6" />
                    </Link>
                    <nav aria-label="Navegação do técnico" className="flex flex-col items-center gap-2">
                        {technicianItems.map(desktopLink)}
                    </nav>
                    <div className="mt-auto flex flex-col items-center gap-2">
                        <NotificationBell />
                        <ThemeToggle />
                        <button
                            type="button"
                            onClick={onLogout}
                            aria-label="Sair"
                            title="Sair"
                            className="flex size-11 items-center justify-center rounded-full border border-border text-sm font-bold text-danger transition-colors hover:bg-danger-soft"
                        >
                            {user?.name?.charAt(0).toUpperCase() || 'T'}
                        </button>
                    </div>
                </div>

                <nav aria-label="Navegação do técnico" className="grid h-full grid-cols-4 items-center gap-1 px-1.5 md:hidden">
                    <Link
                        to="/tickets"
                        aria-label="Chamados"
                        aria-current={isActive('/tickets') && !location.search.includes('new=1') ? 'page' : undefined}
                        className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[10px] font-semibold transition-colors ${isActive('/tickets') && !location.search.includes('new=1') ? 'bg-primary-solid text-primary-solid-fg' : 'text-muted-foreground'}`}
                    >
                        <Icon name="local_activity" className="size-5" />
                        <span>Chamados</span>
                    </Link>
                    <Link
                        to="/tickets?new=1"
                        aria-label="Criar chamado"
                        className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[10px] font-semibold text-muted-foreground transition-colors active:bg-surface-alt"
                    >
                        <Icon name="add_ticket" className="size-5" />
                        <span>Novo</span>
                    </Link>
                    {technicianItems.slice(1).map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            aria-label={item.label}
                            aria-current={isActive(item.path) ? 'page' : undefined}
                            className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[10px] font-semibold transition-colors ${isActive(item.path) ? 'bg-primary-solid text-primary-solid-fg' : 'text-muted-foreground'}`}
                        >
                            <Icon name={item.icon} className="size-5" />
                            <span>{item.label}</span>
                        </Link>
                    ))}
                </nav>
            </aside>
        );
    }

    return (
        <aside className="fixed inset-x-0 bottom-0 z-50 h-[72px] border-t border-border bg-surface md:static md:h-screen md:w-20 md:flex-shrink-0 md:border-r md:border-t-0">
            <div className="hidden h-full flex-col items-center py-5 md:flex">
                <Link
                    to="/"
                    aria-label="Sigma Atendimento — início"
                    className="mb-7 flex size-12 items-center justify-center rounded-xl border-2 border-primary-solid bg-transparent text-primary shadow-none transition-colors hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                    <Icon name="chat_bubble" className="size-6" />
                </Link>

                <nav aria-label="Navegação principal" className="flex flex-col items-center gap-2">
                    {primaryItems.map(desktopLink)}
                    {secondaryItems.map(desktopLink)}
                    {canManage && managementItems.slice(0, 3).map(desktopLink)}
                </nav>

                <div className="mt-auto flex flex-col items-center gap-2">
                    <NotificationBell />
                    <ThemeToggle />
                    {canManage && desktopLink(managementItems[3])}
                    <div ref={profileRef} className="relative">
                        <button
                            type="button"
                            onClick={() => setProfileOpen((value) => !value)}
                            aria-label="Abrir menu do perfil"
                            aria-expanded={profileOpen}
                            aria-haspopup="menu"
                            className="flex size-11 items-center justify-center rounded-full border-2 border-primary/30 bg-primary-50 text-sm font-bold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                            {user?.name?.charAt(0).toUpperCase() || 'U'}
                        </button>
                        {profileOpen && (
                            <div role="menu" className="absolute bottom-0 left-full ml-3 w-52 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lifted">
                                <div className="border-b border-border px-4 py-3">
                                    <p className="truncate text-sm font-semibold text-foreground">{user?.name || 'Usuário'}</p>
                                    <p className="truncate text-xs text-muted-foreground">{user?.email || user?.role || 'Atendente'}</p>
                                </div>
                                <button type="button" role="menuitem" onClick={onLogout} className="min-h-11 w-full px-4 py-2 text-left text-sm font-medium text-danger transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40">
                                    Sair
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <nav aria-label="Navegação principal" className="grid h-full grid-cols-5 items-stretch md:hidden">
                {primaryItems.map((item) => (
                    <Link
                        key={item.path}
                        to={item.path}
                        aria-label={item.label}
                        aria-current={isActive(item.path) ? 'page' : undefined}
                        className={`flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 ${isActive(item.path) ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                        <Icon name={item.icon} className="size-5" />
                        <span className="truncate">{item.label}</span>
                    </Link>
                ))}
                <div ref={moreRef} className="relative min-w-0">
                    <button
                        type="button"
                        onClick={() => setMoreOpen((value) => !value)}
                        aria-label="Abrir mais opções"
                        aria-expanded={moreOpen}
                        aria-haspopup="menu"
                        className={`flex size-full min-h-11 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 ${moreOpen ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                        <Icon name="grid_view" className="size-5" />
                        <span>Mais</span>
                    </button>
                    {moreOpen && (
                        <div role="menu" className="absolute bottom-[calc(100%+8px)] right-2 w-[min(320px,calc(100vw-16px))] rounded-xl border border-border bg-surface p-2 shadow-lifted">
                            <div className="grid grid-cols-2 gap-1">
                                {secondaryItems.map(menuLink)}
                                {canManage && managementItems.map(menuLink)}
                            </div>
                            <div className="mt-2 flex min-h-12 items-center justify-between border-t border-border pt-2">
                                <div className="flex items-center gap-1">
                                    <NotificationBell />
                                    <ThemeToggle />
                                </div>
                                <button type="button" onClick={onLogout} className="min-h-11 rounded-lg px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                                    Sair
                                </button>
                            </div>
                            <p className="truncate px-3 pb-1 pt-2 text-xs text-muted-foreground">{user?.name || 'Usuário'} · {user?.specialty || user?.role || 'Atendente'}</p>
                        </div>
                    )}
                </div>
            </nav>
        </aside>
    );
}
