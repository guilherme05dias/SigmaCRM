import * as React from "react"
import { cn } from "../../lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    /** Rótulo acessível associado via htmlFor/id. */
    label?: string
    /** Mensagem de erro exibida abaixo do campo. */
    error?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, label, error, id, ...props }, ref) => {
        const reactId = React.useId()
        const inputId = id ?? reactId
        const errorId = error ? `${inputId}-error` : undefined

        const field = (
            <input
                id={inputId}
                type={type}
                ref={ref}
                aria-invalid={error ? true : undefined}
                aria-describedby={errorId}
                className={cn(
                    "flex h-11 w-full rounded-lg border bg-surface px-3 py-2 text-sm text-foreground font-sans transition-colors",
                    "placeholder:text-muted-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    error ? "border-danger focus-visible:ring-danger/30" : "border-border",
                    className
                )}
                {...props}
            />
        )

        if (!label && !error) return field

        return (
            <div className="space-y-1.5">
                {label && (
                    <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
                        {label}
                    </label>
                )}
                {field}
                {error && (
                    <p id={errorId} className="text-xs text-danger">
                        {error}
                    </p>
                )}
            </div>
        )
    }
)
Input.displayName = "Input"

export { Input }
