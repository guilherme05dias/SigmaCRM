import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { cn } from '../../lib/utils';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: string;
    title: string;
    description?: string;
    variant: ToastVariant;
}

interface ToastInput {
    title: string;
    description?: string;
    variant?: ToastVariant;
}

interface ToastContextValue {
    showToast: (toast: ToastInput) => void;
    dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const variantConfig: Record<ToastVariant, { icon: IconName; className: string }> = {
    success: { icon: 'check_circle', className: 'border-success/20 bg-success-soft text-success-fg' },
    error: { icon: 'error', className: 'border-danger/20 bg-danger-soft text-danger-fg' },
    info: { icon: 'info', className: 'border-primary/20 bg-primary-50 text-primary-700' },
    warning: { icon: 'error', className: 'border-warning/20 bg-warning-soft text-warning-fg' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const dismissToast = useCallback((id: string) => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
    }, []);

    const showToast = useCallback((toast: ToastInput) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const nextToast: Toast = {
            id,
            title: toast.title,
            description: toast.description,
            variant: toast.variant || 'info',
        };

        setToasts((current) => [nextToast, ...current].slice(0, 4));
        window.setTimeout(() => dismissToast(id), 4500);
    }, [dismissToast]);

    const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="fixed right-4 top-4 z-[80] flex w-[min(380px,calc(100vw-32px))] flex-col gap-3" role="status" aria-live="polite">
                {toasts.map((toast) => {
                    const config = variantConfig[toast.variant];
                    return (
                        <div key={toast.id} className={cn('rounded-xl border p-4 shadow-card backdrop-blur', config.className)}>
                            <div className="flex items-start gap-3">
                                <Icon name={config.icon} className="mt-0.5 size-5" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold">{toast.title}</p>
                                    {toast.description && <p className="mt-1 text-xs opacity-85">{toast.description}</p>}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => dismissToast(toast.id)}
                                    className="rounded-lg px-2 py-1 text-xs font-semibold opacity-70 transition-opacity hover:opacity-100"
                                    aria-label="Fechar notificacao"
                                >
                                    x
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast deve ser usado dentro de ToastProvider');
    }
    return context;
}
