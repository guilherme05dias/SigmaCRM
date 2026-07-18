import { Icon } from './Icon';
import { useTheme } from '../../lib/theme';

export function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const nextThemeLabel = theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro';

    return (
        <button
            type="button"
            onClick={toggleTheme}
            className="flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            title={nextThemeLabel}
            aria-label={nextThemeLabel}
        >
            <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="size-5" />
        </button>
    );
}
