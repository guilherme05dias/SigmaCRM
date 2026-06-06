/** @type {import('tailwindcss').Config} */
// ─────────────────────────────────────────────────────────────────────────────
// Sigma Design System — Airtable-inspired, com dark mode
// Todas as cores usam CSS Custom Properties para que o dark mode funcione
// automaticamente via classe .dark no <html>, sem precisar de dark: em cada
// componente.  Cores que precisam de modificadores de opacidade (bg-X/20 etc.)
// usam o formato "rgb(var(--c-X) / <alpha-value>)".
// ─────────────────────────────────────────────────────────────────────────────
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // ── Brand — suporta opacidade (rgb channels) ────────────────
                primary: {
                    DEFAULT: 'rgb(var(--c-primary) / <alpha-value>)',
                    fg:  'rgb(var(--c-primary-fg) / <alpha-value>)',
                    50:  'rgb(var(--c-primary-50) / <alpha-value>)',
                    100: 'rgb(var(--c-primary-100) / <alpha-value>)',
                    200: 'rgb(var(--c-primary-200) / <alpha-value>)',
                    300: 'rgb(var(--c-primary-300) / <alpha-value>)',
                    400: 'rgb(var(--c-primary-400) / <alpha-value>)',
                    500: 'rgb(var(--c-primary-500) / <alpha-value>)',
                    600: 'rgb(var(--c-primary-600) / <alpha-value>)',
                    700: 'rgb(var(--c-primary-700) / <alpha-value>)',
                    800: 'rgb(var(--c-primary-800) / <alpha-value>)',
                    900: 'rgb(var(--c-primary-900) / <alpha-value>)',
                },

                // ── Superfícies (sem opacidade — hex direto via var) ─────────
                background:   'var(--c-background)',
                surface:      'var(--c-surface)',
                'surface-alt': 'var(--c-surface-alt)',
                elevated:     'var(--c-elevated)',
                muted:        'var(--c-surface-alt)',

                // ── Conteúdo — suporta opacidade ─────────────────────────────
                foreground:          'rgb(var(--c-foreground) / <alpha-value>)',
                'muted-foreground':  'rgb(var(--c-muted-fg) / <alpha-value>)',
                border:              'var(--c-border)',

                // ── Status ───────────────────────────────────────────────────
                success: {
                    DEFAULT: 'rgb(var(--c-success) / <alpha-value>)',
                    soft:    'var(--c-success-soft)',
                    fg:      'var(--c-success-fg)',
                },
                warning: {
                    DEFAULT: 'rgb(var(--c-warning) / <alpha-value>)',
                    soft:    'var(--c-warning-soft)',
                    fg:      'var(--c-warning-fg)',
                },
                danger: {
                    DEFAULT: 'rgb(var(--c-danger) / <alpha-value>)',
                    soft:    'var(--c-danger-soft)',
                    fg:      'var(--c-danger-fg)',
                },
                info: {
                    DEFAULT: 'rgb(var(--c-info) / <alpha-value>)',
                    soft:    'var(--c-info-soft)',
                    fg:      'var(--c-info-fg)',
                },

                // ── Aliases legados ──────────────────────────────────────────
                'background-dark': 'var(--c-background)',
                app:               'var(--c-background)',
                'sigma-dark':      'var(--c-surface)',
                'dark-slate':      'var(--c-surface-alt)',
                'slate-panel':     'var(--c-surface)',
                'bubble-user':     'rgb(var(--c-primary-50) / 1)',
                secondary:         'rgb(var(--c-primary-700) / <alpha-value>)',
                'sigma-cyan':      'rgb(var(--c-primary-700) / <alpha-value>)',
                'white-alpha-10':  'rgb(var(--c-foreground) / 0.06)',
                'cyan-glow':       'rgb(var(--c-primary) / 0.15)',
            },

            fontFamily: {
                display: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
                sans:    ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
            },

            letterSpacing: {
                tighter: "-0.02em",
                tight:   "-0.01em",
                normal:  "0em",
                wide:    "0.007em",
                wider:   "0.011em",
                widest:  "0.02em",
            },

            borderRadius: {
                default: "8px",
                sm:      "4px",
                lg:      "10px",
                xl:      "12px",
                "2xl":   "16px",
                "3xl":   "24px",
                "4xl":   "32px",
                cta:     "12px",
                pill:    "9999px",
            },

            spacing: {
                "section-py": "96px",
            },

            maxWidth: {
                container: "1440px",
            },

            boxShadow: {
                sm:             "rgba(45,127,249,0.12) 0px 1px 2px",
                card:           "rgba(45,127,249,0.18) 0px 1px 3px, rgba(45,127,249,0.08) 0px 1px 2px",
                premium:        "rgba(45,127,249,0.20) 0px 4px 12px, rgba(45,127,249,0.10) 0px 1px 4px",
                lifted:         "rgba(45,127,249,0.24) 0px 8px 24px, rgba(45,127,249,0.10) 0px 2px 6px",
                "primary-glow": "rgba(27,97,201,0.32) 0px 4px 14px",
                "cyan-glow":    "rgba(37,79,173,0.20) 0px 4px 14px",
                "focus-ring":   "0 0 0 3px rgba(27,97,201,0.28)",
            },

            keyframes: {
                "fade-in": {
                    from: { opacity: "0", transform: "translateY(4px)" },
                    to:   { opacity: "1", transform: "translateY(0)" },
                },
                "sigma-spin": { to: { transform: "rotate(360deg)" } },
            },

            animation: {
                "fade-in": "fade-in 0.2s ease-out both",
            },
        },
    },
    plugins: [],
}
