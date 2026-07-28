-- Composite indexes supporting tenant-scoped report date ranges and keyset pagination.
CREATE INDEX IF NOT EXISTS "Conversation_companyId_createdAt_idx"
  ON public."Conversation" ("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "Conversation_companyId_closedAt_idx"
  ON public."Conversation" ("companyId", "closedAt");
CREATE INDEX IF NOT EXISTS "Conversation_companyId_assignedUserId_createdAt_idx"
  ON public."Conversation" ("companyId", "assignedUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "Message_companyId_createdAt_idx"
  ON public."Message" ("companyId", "createdAt");

CREATE INDEX IF NOT EXISTS "Ticket_companyId_createdAt_idx"
  ON public."Ticket" ("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "Ticket_companyId_status_createdAt_idx"
  ON public."Ticket" ("companyId", status, "createdAt");
CREATE INDEX IF NOT EXISTS "Ticket_companyId_conversationId_idx"
  ON public."Ticket" ("companyId", "conversationId");

CREATE INDEX IF NOT EXISTS "TicketFieldService_companyId_scheduledAt_idx"
  ON public."TicketFieldService" ("companyId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "TicketFieldService_companyId_finishedAt_idx"
  ON public."TicketFieldService" ("companyId", "finishedAt");
CREATE INDEX IF NOT EXISTS "TicketFieldService_companyId_status_scheduledAt_idx"
  ON public."TicketFieldService" ("companyId", status, "scheduledAt");
CREATE INDEX IF NOT EXISTS "TicketFieldService_companyId_technicianId_scheduledAt_idx"
  ON public."TicketFieldService" ("companyId", "technicianId", "scheduledAt");
