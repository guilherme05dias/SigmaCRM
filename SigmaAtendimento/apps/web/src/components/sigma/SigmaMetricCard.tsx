import { Icon, type IconName } from '../ui/Icon';

interface SigmaMetricCardProps {
    title: string;
    value: string | number;
    icon: IconName;
    /** Tom do ícone — mapeado para classes estáticas (Tailwind não gera classes dinâmicas). */
    colorClass?: 'primary' | 'secondary' | 'amber-500' | 'emerald-500' | 'red-500' | 'violet-500' | 'slate-500';
}

const toneClass: Record<NonNullable<SigmaMetricCardProps['colorClass']>, string> = {
    primary: 'bg-primary/10 text-primary',
    secondary: 'bg-accent-soft text-accent',
    'amber-500': 'bg-warning-soft text-warning-fg',
    'emerald-500': 'bg-success-soft text-success-fg',
    'red-500': 'bg-danger-soft text-danger',
    'violet-500': 'bg-accent-soft text-accent',
    'slate-500': 'bg-surface-alt text-muted-foreground',
};

export function SigmaMetricCard({ title, value, icon, colorClass = 'primary' }: SigmaMetricCardProps) {
    return (
        <div className="rounded-xl border border-border bg-surface px-5 py-4">
            <div className="flex items-center gap-3">
                <div className={`flex size-10 items-center justify-center rounded-lg ${toneClass[colorClass]}`}>
                    <Icon name={icon} className="size-5" />
                </div>
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-muted-foreground">
                        {title}
                    </p>
                    <p className="mt-0.5 text-2xl font-bold tracking-tight text-foreground">{value}</p>
                </div>
            </div>
        </div>
    );
}
