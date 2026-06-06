-- C3: defesa em profundidade para Supabase/Postgres.
-- As policies usam app.current_company_id para acessos feitos por roles sujeitas a RLS.
-- O backend Prisma continua escopando por companyId nas rotas.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_user" ON "User";
CREATE POLICY "tenant_isolation_user" ON "User"
  FOR ALL
  USING ("company_id" = current_setting('app.current_company_id', true))
  WITH CHECK ("company_id" = current_setting('app.current_company_id', true));

ALTER TABLE "Department" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_department" ON "Department";
CREATE POLICY "tenant_isolation_department" ON "Department"
  FOR ALL
  USING ("company_id" = current_setting('app.current_company_id', true))
  WITH CHECK ("company_id" = current_setting('app.current_company_id', true));

ALTER TABLE "Settings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_settings" ON "Settings";
CREATE POLICY "tenant_isolation_settings" ON "Settings"
  FOR ALL
  USING ("company_id" = current_setting('app.current_company_id', true))
  WITH CHECK ("company_id" = current_setting('app.current_company_id', true));

ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_customer" ON "Customer";
CREATE POLICY "tenant_isolation_customer" ON "Customer"
  FOR ALL
  USING ("companyId" = current_setting('app.current_company_id', true))
  WITH CHECK ("companyId" = current_setting('app.current_company_id', true));

ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_contact" ON "Contact";
CREATE POLICY "tenant_isolation_contact" ON "Contact"
  FOR ALL
  USING ("companyId" = current_setting('app.current_company_id', true))
  WITH CHECK ("companyId" = current_setting('app.current_company_id', true));

ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_conversation" ON "Conversation";
CREATE POLICY "tenant_isolation_conversation" ON "Conversation"
  FOR ALL
  USING ("companyId" = current_setting('app.current_company_id', true))
  WITH CHECK ("companyId" = current_setting('app.current_company_id', true));

ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_message" ON "Message";
CREATE POLICY "tenant_isolation_message" ON "Message"
  FOR ALL
  USING ("companyId" = current_setting('app.current_company_id', true))
  WITH CHECK ("companyId" = current_setting('app.current_company_id', true));

ALTER TABLE "Ticket" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_ticket" ON "Ticket";
CREATE POLICY "tenant_isolation_ticket" ON "Ticket"
  FOR ALL
  USING ("companyId" = current_setting('app.current_company_id', true))
  WITH CHECK ("companyId" = current_setting('app.current_company_id', true));

ALTER TABLE "TicketFieldService" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_ticket_field_service" ON "TicketFieldService";
CREATE POLICY "tenant_isolation_ticket_field_service" ON "TicketFieldService"
  FOR ALL
  USING ("companyId" = current_setting('app.current_company_id', true))
  WITH CHECK ("companyId" = current_setting('app.current_company_id', true));

ALTER TABLE "TicketEvaluation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_ticket_evaluation" ON "TicketEvaluation";
CREATE POLICY "tenant_isolation_ticket_evaluation" ON "TicketEvaluation"
  FOR ALL
  USING ("companyId" = current_setting('app.current_company_id', true))
  WITH CHECK ("companyId" = current_setting('app.current_company_id', true));

ALTER TABLE "TicketTimeline" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_ticket_timeline" ON "TicketTimeline";
CREATE POLICY "tenant_isolation_ticket_timeline" ON "TicketTimeline"
  FOR ALL
  USING ("companyId" = current_setting('app.current_company_id', true))
  WITH CHECK ("companyId" = current_setting('app.current_company_id', true));

ALTER TABLE "Counter" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_counter" ON "Counter";
CREATE POLICY "tenant_isolation_counter" ON "Counter"
  FOR ALL
  USING ("companyId" = current_setting('app.current_company_id', true))
  WITH CHECK ("companyId" = current_setting('app.current_company_id', true));

ALTER TABLE "WhatsAppInboundEvent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_inbound_event" ON "WhatsAppInboundEvent";
CREATE POLICY "tenant_isolation_whatsapp_inbound_event" ON "WhatsAppInboundEvent"
  FOR ALL
  USING ("companyId" = current_setting('app.current_company_id', true))
  WITH CHECK ("companyId" = current_setting('app.current_company_id', true));

ALTER TABLE "WhatsAppOutbox" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_outbox" ON "WhatsAppOutbox";
CREATE POLICY "tenant_isolation_whatsapp_outbox" ON "WhatsAppOutbox"
  FOR ALL
  USING ("companyId" = current_setting('app.current_company_id', true))
  WITH CHECK ("companyId" = current_setting('app.current_company_id', true));
