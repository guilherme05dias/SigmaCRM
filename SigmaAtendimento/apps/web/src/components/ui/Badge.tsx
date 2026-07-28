import * as React from "react"
import { cn } from "../../lib/utils"

// ─────────────────────────────────────────────────────────────────────────────
// Badge — pílula de status/rótulo do design system trust-blue.
// Cores "soft" (fundo claro + texto escuro) para contraste AA em tema claro.
// ─────────────────────────────────────────────────────────────────────────────

type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info"

const toneClass: Record<BadgeTone, string> = {
    neutral: "bg-surface-alt text-muted-foreground border-border",
    primary: "bg-primary-50 text-primary-700 border-primary-200",
    success: "bg-success-soft text-success-fg border-success/20",
    warning: "bg-warning-soft text-warning-fg border-warning/20",
    danger: "bg-danger-soft text-danger-fg border-danger/20",
    info: "bg-info-soft text-info-fg border-info/20",
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    tone?: BadgeTone
    /** Mostra um ponto colorido à esquerda. */
    dot?: boolean
}

function Badge({ className, tone = "neutral", dot = false, children, ...props }: BadgeProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-xs font-medium font-sans whitespace-nowrap",
                toneClass[tone],
                className
            )}
            {...props}
        >
            {dot && <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />}
            {children}
        </span>
    )
}

// ── Ticket status ────────────────────────────────────────────────────────────
type TicketStatus =
    | "NEW" | "QUEUED" | "IN_PROGRESS" | "WAITING_CUSTOMER" | "WAITING_INTERNAL"
    | "SCHEDULED_FIELD_SERVICE" | "RESOLVED" | "CLOSED" | "CANCELED"

const statusMap: Record<TicketStatus, { label: string; tone: BadgeTone }> = {
    NEW:                     { label: "Novo",            tone: "info" },
    QUEUED:                  { label: "Na fila",         tone: "info" },
    IN_PROGRESS:             { label: "Em andamento",    tone: "primary" },
    WAITING_CUSTOMER:        { label: "Aguard. cliente", tone: "warning" },
    WAITING_INTERNAL:        { label: "Aguard. interno", tone: "warning" },
    SCHEDULED_FIELD_SERVICE: { label: "Chamado agendado", tone: "primary" },
    RESOLVED:                { label: "Resolvido",       tone: "success" },
    CLOSED:                  { label: "Fechado",         tone: "neutral" },
    CANCELED:                { label: "Cancelado",       tone: "danger" },
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
    const cfg = statusMap[status as TicketStatus] ?? { label: status, tone: "neutral" as BadgeTone }
    return <Badge tone={cfg.tone} dot className={className}>{cfg.label}</Badge>
}

// ── Ticket priority ──────────────────────────────────────────────────────────
type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"

const priorityMap: Record<TicketPriority, { label: string; tone: BadgeTone }> = {
    LOW:      { label: "Baixa",    tone: "neutral" },
    MEDIUM:   { label: "Média",    tone: "info" },
    HIGH:     { label: "Alta",     tone: "warning" },
    CRITICAL: { label: "Crítica",  tone: "danger" },
}

export function PriorityBadge({ priority, className }: { priority: string; className?: string }) {
    const cfg = priorityMap[priority as TicketPriority] ?? { label: priority, tone: "neutral" as BadgeTone }
    return <Badge tone={cfg.tone} dot className={className}>{cfg.label}</Badge>
}

export { Badge }
