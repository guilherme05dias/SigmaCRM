import { useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { SigmaSidebarIcon } from '../components/sigma/SigmaSidebarIcon';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { apiRequest, redirectOnUnauthorized } from '../lib/api';
import { useAuth } from '../lib/auth';
import { getAuthToken } from '../lib/authToken';
import {
    formatNotificationDate,
    getNotificationTypeLabel,
    notificationTypeLabels,
    type NotificationItem,
    type NotificationsResponse,
} from '../lib/notifications';
import { acquireSharedSocket, releaseSharedSocket } from '../lib/socket';

export default function Notifications() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { showToast } = useToast();
    const socketRef = useRef<Socket | null>(null);
    const [items, setItems] = useState<NotificationItem[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [typeFilter, setTypeFilter] = useState('');

    const loadNotifications = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ take: '100' });
            if (unreadOnly) params.set('unreadOnly', 'true');

            const data = await apiRequest<NotificationsResponse>(`/api/notifications?${params.toString()}`);
            setItems(data.items);
            setUnreadCount(data.unreadCount);
        } catch (error) {
            if (!redirectOnUnauthorized(error, navigate)) {
                const message = error instanceof Error ? error.message : 'Erro ao carregar notificações.';
                showToast({ title: 'Erro ao carregar notificações', description: message, variant: 'error' });
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadNotifications();
    }, [unreadOnly]);

    useEffect(() => {
        const token = getAuthToken();
        if (!token) return;

        const socket = acquireSharedSocket(token);
        if (!socket) return;
        socketRef.current = socket;

        socket.on('notification:new', (notification: NotificationItem) => {
            setItems((current) => {
                const merged = [notification, ...current.filter((item) => item.id !== notification.id)];
                return unreadOnly ? merged.filter((item) => !item.readAt) : merged;
            });
            setUnreadCount((current) => current + 1);
        });

        return () => {
            socket.off('notification:new');
            releaseSharedSocket(socket);
            socketRef.current = null;
        };
    }, [unreadOnly]);

    const visibleItems = useMemo(
        () => items.filter((item) => (typeFilter ? item.type === typeFilter : true)),
        [items, typeFilter],
    );

    const groupedCounts = useMemo(() => {
        return visibleItems.reduce<Record<string, number>>((acc, item) => {
            acc[item.type] = (acc[item.type] || 0) + 1;
            return acc;
        }, {});
    }, [visibleItems]);

    const readItems = items.length - unreadCount;

    const markAsRead = async (notification: NotificationItem, redirect = false) => {
        try {
            if (!notification.readAt) {
                setUpdatingId(notification.id);
                await apiRequest(`/api/notifications/${notification.id}/read`, { method: 'POST' });
                setItems((current) => current
                    .map((item) => (item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item))
                    .filter((item) => (unreadOnly ? !item.readAt : true)));
                setUnreadCount((current) => Math.max(0, current - 1));
            }

            if (redirect && notification.link) {
                navigate(notification.link);
            }
        } catch (error) {
            if (!redirectOnUnauthorized(error, navigate)) {
                const message = error instanceof Error ? error.message : 'Erro ao atualizar notificação.';
                showToast({ title: 'Erro ao atualizar notificação', description: message, variant: 'error' });
            }
        } finally {
            setUpdatingId(null);
        }
    };

    const markAllAsRead = async () => {
        try {
            await apiRequest('/api/notifications/read-all', { method: 'POST' });
            setItems((current) => current
                .map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() }))
                .filter((item) => (unreadOnly ? !item.readAt : true)));
            setUnreadCount(0);
            showToast({ title: 'Notificações atualizadas', description: 'Todas as notificações foram marcadas como lidas.' });
        } catch (error) {
            if (!redirectOnUnauthorized(error, navigate)) {
                const message = error instanceof Error ? error.message : 'Erro ao marcar notificações como lidas.';
                showToast({ title: 'Erro ao atualizar notificações', description: message, variant: 'error' });
            }
        }
    };

    return (
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
            <SigmaSidebarIcon user={user} onLogout={logout} />
            <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
                <div className="mx-auto flex w-full max-w-container flex-col gap-6 p-4 md:p-8">
                    <header className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-card lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <div className="mb-3 inline-flex items-center gap-2 rounded-pill border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                                <Icon name="notifications" className="size-4" />
                                Central interna
                            </div>
                            <h1 className="text-3xl font-bold tracking-tight text-foreground">Notificações</h1>
                            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                                Acompanhe avisos de visitas, agenda e próximos eventos operacionais sem sair do sistema.
                            </p>
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-sm">
                            <div className="rounded-xl border border-border bg-surface-alt px-4 py-3">
                                <p className="text-xs text-muted-foreground">Não lidas</p>
                                <p className="mt-1 text-2xl font-bold text-foreground">{unreadCount}</p>
                            </div>
                            <div className="rounded-xl border border-border bg-surface-alt px-4 py-3">
                                <p className="text-xs text-muted-foreground">Carregadas</p>
                                <p className="mt-1 text-2xl font-bold text-foreground">{items.length}</p>
                            </div>
                            <div className="rounded-xl border border-border bg-surface-alt px-4 py-3">
                                <p className="text-xs text-muted-foreground">Lidas</p>
                                <p className="mt-1 text-2xl font-bold text-foreground">{Math.max(0, readItems)}</p>
                            </div>
                        </div>
                    </header>

                    <section className="grid gap-4 rounded-2xl border border-border bg-surface p-4 shadow-card lg:grid-cols-[minmax(0,1fr)_220px_auto]">
                        <label>
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipo</span>
                            <select
                                value={typeFilter}
                                onChange={(event) => setTypeFilter(event.target.value)}
                                className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                            >
                                <option value="">Todos os tipos</option>
                                {Object.entries(notificationTypeLabels).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </select>
                        </label>

                        <label className="flex h-full items-end">
                            <button
                                type="button"
                                onClick={() => setUnreadOnly((value) => !value)}
                                className={`flex h-11 w-full items-center justify-between rounded-lg border px-3 text-sm transition-colors ${
                                    unreadOnly
                                        ? 'border-primary/30 bg-primary/10 text-primary'
                                        : 'border-border bg-surface text-foreground hover:bg-surface-alt'
                                }`}
                            >
                                <span>Apenas não lidas</span>
                                <span className={`size-2 rounded-full ${unreadOnly ? 'bg-primary' : 'bg-border'}`} />
                            </button>
                        </label>

                        <div className="flex items-end gap-2">
                            <Button type="button" variant="outline" onClick={loadNotifications} loading={loading}>
                                Atualizar
                            </Button>
                            <Button type="button" variant="ghost" onClick={markAllAsRead} disabled={unreadCount === 0}>
                                Marcar todas como lidas
                            </Button>
                        </div>
                    </section>

                    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_320px]">
                        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-semibold text-foreground">Últimas notificações</h2>
                                    <p className="text-sm text-muted-foreground">Lista completa das últimas 100 notificações da sua conta.</p>
                                </div>
                                <Badge tone={unreadCount > 0 ? 'primary' : 'neutral'}>
                                    {visibleItems.length} item(ns)
                                </Badge>
                            </div>

                            {loading ? (
                                <div className="space-y-3">
                                    {Array.from({ length: 6 }).map((_, index) => (
                                        <div key={index} className="rounded-xl border border-border p-4">
                                            <Skeleton className="h-4 w-40" />
                                            <Skeleton className="mt-3 h-4 w-full" />
                                            <Skeleton className="mt-2 h-4 w-3/4" />
                                        </div>
                                    ))}
                                </div>
                            ) : visibleItems.length === 0 ? (
                                <EmptyState
                                    icon="notifications"
                                    title="Nenhuma notificação encontrada"
                                    description={unreadOnly
                                        ? 'Você não tem notificações pendentes com os filtros atuais.'
                                        : 'Avisos de visitas e agenda aparecerão aqui assim que forem gerados.'}
                                />
                            ) : (
                                <div className="space-y-3">
                                    {visibleItems.map((notification) => {
                                        const isRead = Boolean(notification.readAt);

                                        return (
                                            <article
                                                key={notification.id}
                                                className={`rounded-2xl border p-4 transition-colors ${
                                                    isRead
                                                        ? 'border-border bg-surface'
                                                        : 'border-primary/20 bg-primary/5'
                                                }`}
                                            >
                                                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className={`size-2 rounded-full ${isRead ? 'bg-border' : 'bg-primary'}`} />
                                                            <Badge tone={isRead ? 'neutral' : 'primary'}>
                                                                {isRead ? 'Lida' : 'Nova'}
                                                            </Badge>
                                                            <Badge tone="info">
                                                                {getNotificationTypeLabel(notification.type)}
                                                            </Badge>
                                                            <span className="text-xs text-muted-foreground">
                                                                {formatNotificationDate(notification.createdAt)}
                                                            </span>
                                                        </div>

                                                        <h3 className="mt-3 text-base font-bold text-foreground">
                                                            {notification.title}
                                                        </h3>

                                                        {notification.body && (
                                                            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                                                                {notification.body}
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div className="flex flex-wrap gap-2">
                                                        {!isRead && (
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                loading={updatingId === notification.id}
                                                                onClick={() => markAsRead(notification)}
                                                            >
                                                                Marcar como lida
                                                            </Button>
                                                        )}
                                                        {notification.link && (
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                onClick={() => markAsRead(notification, true)}
                                                            >
                                                                Abrir chamado
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <aside className="space-y-6">
                            <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
                                <h2 className="text-lg font-semibold text-foreground">Resumo por tipo</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Distribuição das notificações atualmente visíveis na lista.
                                </p>

                                <div className="mt-4 space-y-3">
                                    {Object.keys(groupedCounts).length === 0 ? (
                                        <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                                            Sem dados para resumir com os filtros atuais.
                                        </p>
                                    ) : Object.entries(groupedCounts)
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([type, count]) => (
                                            <div key={type} className="rounded-xl border border-border bg-surface-alt px-4 py-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-sm font-semibold text-foreground">{getNotificationTypeLabel(type)}</p>
                                                    <span className="text-sm font-bold text-foreground">{count}</span>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
                                <h2 className="text-lg font-semibold text-foreground">Como usar</h2>
                                <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                                    <p>Use “Apenas não lidas” para limpar a fila do dia mais rápido.</p>
                                    <p>Abra o chamado direto pela notificação quando precisar revisar detalhes da visita.</p>
                                    <p>O sino da navegação continua mostrando os últimos avisos em tempo real.</p>
                                </div>
                            </div>
                        </aside>
                    </section>
                </div>
            </main>
        </div>
    );
}
