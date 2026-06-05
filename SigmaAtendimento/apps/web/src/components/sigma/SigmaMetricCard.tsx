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
    secondary: 'bg-sky-500/10 text-sky-600',
    'amber-500': 'bg-amber-500/10 text-amber-600',
    'emerald-500': 'bg-emerald-500/10 text-emerald-600',
    'red-500': 'bg-danger-soft text-danger',
    'violet-500': 'bg-violet-500/10 text-violet-600',
    'slate-500': 'bg-surface-alt text-muted-foreground',
};

export function SigmaMetricCard({ title, value, icon, colorClass = 'primary' }: SigmaMetricCardProps) {
    return (
        <div className="bg-surface p-6 rounded-2xl border border-border shadow-card">
            <div className="flex items-center gap-4">
                <div className={`size-12 rounded-2xl flex items-center justify-center ${toneClass[colorClass]}`}>
                    <Icon name={icon} className="size-6" />
                </div>
                <div>
                    <p className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                        {title}
                    </p>
                    <h3 className="text-2xl font-black text-foreground">{value}</h3>
                </div>
            </div>
        </div>
    );
}
