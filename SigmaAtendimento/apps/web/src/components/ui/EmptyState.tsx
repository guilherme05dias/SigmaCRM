import { Icon, type IconName } from './Icon';
import { Button } from './Button';

interface EmptyStateProps {
    icon?: IconName;
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
}

export function EmptyState({ icon = 'info', title, description, actionLabel, onAction }: EmptyStateProps) {
    return (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-alt px-6 py-10 text-center">
            <div className="rounded-xl border border-border bg-surface p-3 text-primary shadow-sm">
                <Icon name={icon} className="size-6" />
            </div>
            <h3 className="mt-4 text-base font-bold text-foreground">{title}</h3>
            {description && <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>}
            {actionLabel && onAction && (
                <Button type="button" size="sm" className="mt-5" onClick={onAction}>
                    {actionLabel}
                </Button>
            )}
        </div>
    );
}
