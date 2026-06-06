import { Icon } from './Icon';
import { useTheme } from '../../lib/theme';

export function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const nextThemeLabel = theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro';

    return (
        <button
            type="button"
            onClick={toggleTheme}
            className="p-2 text-muted-foreground hover:bg-surface-alt hover:text-foreground rounded-xl transition-colors"
            title={nextThemeLabel}
            aria-label={nextThemeLabel}
        >
            <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="size-5" />
        </button>
    );
}
