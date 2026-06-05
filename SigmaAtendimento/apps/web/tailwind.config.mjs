/** @type {import('tailwindcss').Config} */
// ─────────────────────────────────────────────────────────────────────────────
// Sigma Design System — "trust-blue" (light SaaS)
// Paleta decidida em docs/ARCHITECTURE_DECISIONS.md: azul de confiança #2563EB,
// superfícies slate, tipografia Montserrat. Tokens semânticos novos +
// aliases legados (tema escuro antigo) remapeados para valores claros, de modo
// que telas ainda não migradas não quebrem o build.
// ─────────────────────────────────────────────────────────────────────────────
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // ── Brand (trust-blue) ──────────────────────────────────────
                primary: {
                    DEFAULT: "#2563EB", // blue-600
                    50: "#EFF6FF",
                    100: "#DBEAFE",
                    200: "#BFDBFE",
                    300: "#93C5FD",
                    400: "#60A5FA",
                    500: "#3B82F6",
                    600: "#2563EB",
                    700: "#1D4ED8",
                    800: "#1E40AF",
                    900: "#1E3A8A",
                    fg: "#FFFFFF", // texto sobre o primary
                },

                // ── Semantic surfaces (light) ───────────────────────────────
                background: "#F8FAFC", // slate-50 — fundo do app
                surface: "#FFFFFF",    // cards, sidebar, topbar
                "surface-alt": "#F1F5F9", // slate-100 — zonas alternadas
                elevated: "#FFFFFF",   // inputs / painéis elevados
                muted: "#F1F5F9",      // slate-100 — fundos sutis

                // ── Content ─────────────────────────────────────────────────
                foreground: "#0F172A",      // slate-900 — texto principal
                "muted-foreground": "#475569", // slate-600 — texto secundário (AA)
                border: "#E2E8F0",          // slate-200

                // ── Status / feedback ───────────────────────────────────────
                success: { DEFAULT: "#16A34A", soft: "#DCFCE7", fg: "#166534" },
                warning: { DEFAULT: "#D97706", soft: "#FEF3C7", fg: "#92400E" },
                danger:  { DEFAULT: "#DC2626", soft: "#FEE2E2", fg: "#991B1B" },
                info:    { DEFAULT: "#2563EB", soft: "#DBEAFE", fg: "#1E40AF" },

                // ── Aliases legados (tema escuro antigo → valores claros) ────
                // Mantidos só para não quebrar telas ainda não migradas.
                "background-dark": "#F8FAFC",
                app: "#F8FAFC",
                "sigma-dark": "#FFFFFF",
                "dark-slate": "#F1F5F9",
                "slate-panel": "#FFFFFF",
                "bubble-user": "#EFF6FF",
                secondary: "#0EA5E9",   // sky-500 — accent secundário
                "sigma-cyan": "#0EA5E9",
                "white-alpha-10": "rgba(15, 23, 42, 0.08)",
                "cyan-glow": "rgba(37, 99, 235, 0.18)",
            },
            fontFamily: {
                display: ["Montserrat", "system-ui", "sans-serif"],
                sans: ["Inter", "system-ui", "sans-serif"],
            },
            borderRadius: {
                default: "8px",
                lg: "10px",
                xl: "14px",
                "2xl": "20px",
                cta: "9999px", // botões "pill"
                pill: "9999px",
            },
            spacing: {
                "section-py": "96px",
            },
            maxWidth: {
                container: "1440px",
            },
            boxShadow: {
                // Elevação suave para tema claro (substitui os "glows" do dark)
                sm: "0 1px 2px 0 rgba(15, 23, 42, 0.05)",
                card: "0 1px 3px 0 rgba(15, 23, 42, 0.08), 0 1px 2px -1px rgba(15, 23, 42, 0.06)",
                premium: "0 4px 12px -2px rgba(15, 23, 42, 0.08), 0 2px 6px -2px rgba(15, 23, 42, 0.05)",
                lifted: "0 10px 24px -6px rgba(15, 23, 42, 0.12)",
                "primary-glow": "0 4px 14px -2px rgba(37, 99, 235, 0.35)",
                "cyan-glow": "0 4px 14px -2px rgba(14, 165, 233, 0.25)",
                "focus-ring": "0 0 0 3px rgba(37, 99, 235, 0.30)",
            },
            keyframes: {
                "fade-in": {
                    from: { opacity: "0", transform: "translateY(4px)" },
                    to: { opacity: "1", transform: "translateY(0)" },
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
