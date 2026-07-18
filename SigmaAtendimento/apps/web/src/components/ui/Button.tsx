import * as React from "react"
import { cn } from "../../lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "outline" | "ghost" | "danger"
    size?: "sm" | "md" | "lg" | "icon"
    /** Mostra spinner e desabilita o botão durante operações async. */
    loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "primary", size = "md", loading = false, disabled, children, ...props }, ref) => {
        return (
            <button
                ref={ref}
                disabled={disabled || loading}
                aria-busy={loading || undefined}
                className={cn(
                    // base — Airtable: 12px radius, 500 weight, 0.08px tracking, 16×24px padding
                    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-sans font-medium tracking-wide",
                    "rounded-xl transition-colors duration-200 cursor-pointer select-none",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    "disabled:pointer-events-none disabled:opacity-50",
                    {
                        // variants
                        "bg-primary-solid text-primary-solid-fg shadow-none hover:bg-primary-solid-hover": variant === "primary",
                        "bg-primary-50 text-primary-700 border border-primary-200 hover:bg-primary-100": variant === "secondary",
                        "border border-border bg-surface text-foreground shadow-none hover:bg-surface-alt": variant === "outline",
                        "bg-transparent text-muted-foreground hover:bg-surface-alt hover:text-foreground": variant === "ghost",
                        "bg-danger-solid text-danger-solid-fg hover:bg-danger-solid-hover": variant === "danger",
                        // sizes (min 44px toque em md/lg)
                        "min-h-11 px-4 text-sm": size === "sm",
                        "h-11 px-6 text-sm": size === "md",
                        "h-12 px-8 text-base": size === "lg",
                        "h-11 w-11 p-0": size === "icon",
                    },
                    className
                )}
                {...props}
            >
                {loading && (
                    <span
                        className="size-4 shrink-0 rounded-full border-2 border-current border-r-transparent animate-spin"
                        aria-hidden="true"
                    />
                )}
                {children}
            </button>
        )
    }
)
Button.displayName = "Button"

export { Button }
