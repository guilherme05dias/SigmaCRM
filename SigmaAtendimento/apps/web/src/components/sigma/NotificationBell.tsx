import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { apiRequest } from '../../lib/api';
import { getAuthToken } from '../../lib/authToken';
import { formatNotificationDate, type NotificationItem, type NotificationsResponse } from '../../lib/notifications';
import { acquireSharedSocket, releaseSharedSocket } from '../../lib/socket';

export function NotificationBell() {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<NotificationItem[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const socketRef = useRef<Socket | null>(null);

    const loadNotifications = async () => {
        setLoading(true);
        try {
            const data = await apiRequest<NotificationsResponse>('/api/notifications?take=10');
            setItems(data.items);
            setUnreadCount(data.unreadCount);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadNotifications();
    }, []);

    useEffect(() => {
        const token = getAuthToken();
        if (!token) return;

        const socket = acquireSharedSocket(token);
        if (!socket) return;
        socketRef.current = socket;

        socket.on('notification:new', (notification: NotificationItem) => {
            setItems((current) => [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 10));
            setUnreadCount((current) => current + 1);
        });

        return () => {
            socket.off('notification:new');
            releaseSharedSocket(socket);
            socketRef.current = null;
        };
    }, []);

    const markAsRead = async (notification: NotificationItem) => {
        if (!notification.readAt) {
            try {
                await apiRequest(`/api/notifications/${notification.id}/read`, { method: 'POST' });
                setItems((current) => current.map((item) => (
                    item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item
                )));
                setUnreadCount((current) => Math.max(0, current - 1));
            } catch (error) {
                console.error(error);
            }
        }

        if (notification.link) {
            setOpen(false);
            navigate(notification.link);
        }
    };

    const markAllAsRead = async () => {
        try {
            await apiRequest('/api/notifications/read-all', { method: 'POST' });
            setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
            setUnreadCount(0);
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="relative flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label={`Notificações${unreadCount ? `, ${unreadCount} não lidas` : ''}`}
                aria-expanded={open}
            >
                <Icon name="notifications" className="size-6" />
                {unreadCount > 0 && (
                    <span className="absolute right-1 top-1 flex min-w-5 items-center justify-center rounded-pill bg-danger-solid px-1.5 text-[10px] font-bold leading-5 text-danger-solid-fg">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="fixed bottom-20 right-3 z-[80] w-[min(calc(100vw-24px),360px)] overflow-hidden rounded-2xl border border-border bg-surface shadow-lifted md:bottom-20 md:left-24 md:right-auto">
                    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                        <div>
                            <p className="text-sm font-bold text-foreground">Notificações</p>
                            <p className="text-xs text-muted-foreground">{unreadCount} não lida(s)</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setOpen(false);
                                    navigate('/notifications');
                                }}
                                className="text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                            >
                                Abrir central
                            </button>
                            <button
                                type="button"
                                onClick={markAllAsRead}
                                disabled={unreadCount === 0}
                                className="text-xs font-semibold text-primary transition-colors hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Marcar todas
                            </button>
                        </div>
                    </div>

                    <div className="max-h-[420px] overflow-y-auto p-2">
                        {loading && items.length === 0 ? (
                            <div className="px-3 py-6 text-center text-sm text-muted-foreground">Carregando...</div>
                        ) : items.length === 0 ? (
                            <div className="px-4 py-8 text-center">
                                <Icon name="notifications" className="mx-auto mb-3 size-8 text-muted-foreground" />
                                <p className="text-sm font-semibold text-foreground">Nada por enquanto</p>
                                <p className="mt-1 text-xs text-muted-foreground">Avisos de visitas e agenda aparecerão aqui.</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {items.map((notification) => (
                                    <button
                                        key={notification.id}
                                        type="button"
                                        onClick={() => markAsRead(notification)}
                                        className="w-full rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface-alt"
                                    >
                                        <div className="flex items-start gap-3">
                                            <span className={`mt-1 size-2 rounded-full ${notification.readAt ? 'bg-border' : 'bg-primary'}`} />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-foreground">{notification.title}</p>
                                                {notification.body && (
                                                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{notification.body}</p>
                                                )}
                                                <p className="mt-2 text-[11px] text-muted-foreground">{formatNotificationDate(notification.createdAt)}</p>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
