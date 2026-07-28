-- Composite indexes supporting tenant-scoped report date ranges and keyset pagination.
CREATE INDEX "Conversation_companyId_createdAt_idx" ON "Conversation"("companyId", "createdAt");
CREATE INDEX "Conversation_companyId_closedAt_idx" ON "Conversation"("companyId", "closedAt");
CREATE INDEX "Conversation_companyId_assignedUserId_createdAt_idx" ON "Conversation"("companyId", "assignedUserId", "createdAt");

CREATE INDEX "Message_companyId_createdAt_idx" ON "Message"("companyId", "createdAt");

CREATE INDEX "Ticket_companyId_createdAt_idx" ON "Ticket"("companyId", "createdAt");
CREATE INDEX "Ticket_companyId_status_createdAt_idx" ON "Ticket"("companyId", "status", "createdAt");
CREATE INDEX "Ticket_companyId_conversationId_idx" ON "Ticket"("companyId", "conversationId");

CREATE INDEX "TicketFieldService_companyId_scheduledAt_idx" ON "TicketFieldService"("companyId", "scheduledAt");
CREATE INDEX "TicketFieldService_companyId_finishedAt_idx" ON "TicketFieldService"("companyId", "finishedAt");
CREATE INDEX "TicketFieldService_companyId_status_scheduledAt_idx" ON "TicketFieldService"("companyId", "status", "scheduledAt");
CREATE INDEX "TicketFieldService_companyId_technicianId_scheduledAt_idx" ON "TicketFieldService"("companyId", "technicianId", "scheduledAt");
