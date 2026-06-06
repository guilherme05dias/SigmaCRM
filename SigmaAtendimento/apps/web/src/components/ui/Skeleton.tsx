import { cn } from '../../lib/utils';

export function Skeleton({ className }: { className?: string }) {
    return <div className={cn('animate-pulse rounded-lg bg-surface-alt', className)} aria-hidden="true" />;
}

export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
    return (
        <div className="space-y-3" aria-label="Carregando dados">
            {Array.from({ length: rows }).map((_, rowIndex) => (
                <div key={rowIndex} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                    {Array.from({ length: columns }).map((__, columnIndex) => (
                        <Skeleton key={columnIndex} className="h-10" />
                    ))}
                </div>
            ))}
        </div>
    );
}
