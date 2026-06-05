import { TicketStatus } from '@prisma/client';

/**
 * Máquina de estados do Ticket (ADR-04). Transições permitidas; qualquer outra é
 * rejeitada (400). CLOSED/CANCELED são terminais — reabrir CLOSED só via ação ADMIN.
 */
export const TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['QUEUED', 'IN_PROGRESS', 'CANCELED'],
  QUEUED: ['IN_PROGRESS', 'CANCELED'],
  IN_PROGRESS: ['WAITING_CUSTOMER', 'WAITING_INTERNAL', 'SCHEDULED_FIELD_SERVICE', 'RESOLVED', 'CANCELED'],
  WAITING_CUSTOMER: ['IN_PROGRESS', 'RESOLVED', 'CANCELED'],
  WAITING_INTERNAL: ['IN_PROGRESS', 'RESOLVED', 'CANCELED'],
  SCHEDULED_FIELD_SERVICE: ['IN_PROGRESS', 'RESOLVED', 'CANCELED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  CANCELED: [],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return true;
  return (TICKET_TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(
  from: TicketStatus,
  to: TicketStatus,
  opts: { isAdmin?: boolean } = {},
): void {
  if (from === to) return;
  if (canTransition(from, to)) return;
  // Reabertura administrativa explícita
  if (opts.isAdmin && from === 'CLOSED' && to === 'IN_PROGRESS') return;
  const err: any = new Error(`Transição de status inválida: ${from} → ${to}`);
  err.status = 400;
  throw err;
}
