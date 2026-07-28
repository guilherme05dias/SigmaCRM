-- Evaluate tenant context once per statement instead of once per row.
ALTER POLICY tenant_isolation_company ON public."Company"
  USING (id = (SELECT current_setting('app.current_company_id', true)))
  WITH CHECK (id = (SELECT current_setting('app.current_company_id', true)));
ALTER POLICY tenant_isolation_user ON public."User"
  USING (company_id = (SELECT current_setting('app.current_company_id', true)))
  WITH CHECK (company_id = (SELECT current_setting('app.current_company_id', true)));
ALTER POLICY tenant_isolation_department ON public."Department"
  USING (company_id = (SELECT current_setting('app.current_company_id', true)))
  WITH CHECK (company_id = (SELECT current_setting('app.current_company_id', true)));
ALTER POLICY tenant_isolation_settings ON public."Settings"
  USING (company_id = (SELECT current_setting('app.current_company_id', true)))
  WITH CHECK (company_id = (SELECT current_setting('app.current_company_id', true)));
ALTER POLICY tenant_isolation_contact ON public."Contact"
  USING ("companyId" = (SELECT current_setting('app.current_company_id', true)))
  WITH CHECK ("companyId" = (SELECT current_setting('app.current_company_id', true)));
ALTER POLICY tenant_isolation_conversation ON public."Conversation"
  USING ("companyId" = (SELECT current_setting('app.current_company_id', true)))
  WITH CHECK ("companyId" = (SELECT current_setting('app.current_company_id', true)));
ALTER POLICY tenant_isolation_message ON public."Message"
  USING ("companyId" = (SELECT current_setting('app.current_company_id', true)))
  WITH CHECK ("companyId" = (SELECT current_setting('app.current_company_id', true)));
ALTER POLICY tenant_isolation_ticket ON public."Ticket"
  USING ("companyId" = (SELECT current_setting('app.current_company_id', true)))
  WITH CHECK ("companyId" = (SELECT current_setting('app.current_company_id', true)));
ALTER POLICY tenant_isolation_customer ON public."Customer"
  USING ("companyId" = (SELECT current_setting('app.current_company_id', true)))
  WITH CHECK ("companyId" = (SELECT current_setting('app.current_company_id', true)));
ALTER POLICY tenant_isolation_ticket_field_service ON public."TicketFieldService"
  USING ("companyId" = (SELECT current_setting('app.current_company_id', true)))
  WITH CHECK ("companyId" = (SELECT current_setting('app.current_company_id', true)));
ALTER POLICY tenant_isolation_ticket_evaluation ON public."TicketEvaluation"
  USING ("companyId" = (SELECT current_setting('app.current_company_id', true)))
  WITH CHECK ("companyId" = (SELECT current_setting('app.current_company_id', true)));
ALTER POLICY tenant_isolation_ticket_timeline ON public."TicketTimeline"
  USING ("companyId" = (SELECT current_setting('app.current_company_id', true)))
  WITH CHECK ("companyId" = (SELECT current_setting('app.current_company_id', true)));
ALTER POLICY tenant_isolation_whatsapp_inbound_event ON public."WhatsAppInboundEvent"
  USING ("companyId" = (SELECT current_setting('app.current_company_id', true)))
  WITH CHECK ("companyId" = (SELECT current_setting('app.current_company_id', true)));
ALTER POLICY tenant_isolation_counter ON public."Counter"
  USING ("companyId" = (SELECT current_setting('app.current_company_id', true)))
  WITH CHECK ("companyId" = (SELECT current_setting('app.current_company_id', true)));
ALTER POLICY tenant_isolation_whatsapp_outbox ON public."WhatsAppOutbox"
  USING ("companyId" = (SELECT current_setting('app.current_company_id', true)))
  WITH CHECK ("companyId" = (SELECT current_setting('app.current_company_id', true)));
ALTER POLICY tenant_isolation_field_visit_schedule_change ON public."FieldVisitScheduleChange"
  USING (company_id = (SELECT NULLIF(current_setting('app.current_company_id', true), '')))
  WITH CHECK (company_id = (SELECT NULLIF(current_setting('app.current_company_id', true), '')));
ALTER POLICY tenant_isolation_notification ON public."Notification"
  USING (company_id = (SELECT NULLIF(current_setting('app.current_company_id', true), '')))
  WITH CHECK (company_id = (SELECT NULLIF(current_setting('app.current_company_id', true), '')));
ALTER POLICY tenant_isolation_service_topic ON public."ServiceTopic"
  USING (company_id = (SELECT NULLIF(current_setting('app.current_company_id', true), '')))
  WITH CHECK (company_id = (SELECT NULLIF(current_setting('app.current_company_id', true), '')));

-- Cover foreign keys whose leading column was not indexed.
CREATE INDEX IF NOT EXISTS "Company_defaultTechnicianId_idx"
  ON public."Company" (default_technician_id);
CREATE INDEX IF NOT EXISTS "Contact_customerId_idx"
  ON public."Contact" ("customerId");
CREATE INDEX IF NOT EXISTS "Conversation_assignedUserId_idx"
  ON public."Conversation" ("assignedUserId");
CREATE INDEX IF NOT EXISTS "Conversation_departmentId_idx"
  ON public."Conversation" ("departmentId");
CREATE INDEX IF NOT EXISTS "FieldVisitScheduleChange_changedByUserId_idx"
  ON public."FieldVisitScheduleChange" (changed_by_user_id);
CREATE INDEX IF NOT EXISTS "Message_userId_idx"
  ON public."Message" ("userId");
CREATE INDEX IF NOT EXISTS "Ticket_assignedUserId_idx"
  ON public."Ticket" ("assignedUserId");
CREATE INDEX IF NOT EXISTS "Ticket_contactId_idx"
  ON public."Ticket" ("contactId");
CREATE INDEX IF NOT EXISTS "Ticket_conversationId_idx"
  ON public."Ticket" ("conversationId");
CREATE INDEX IF NOT EXISTS "Ticket_customerId_idx"
  ON public."Ticket" ("customerId");
CREATE INDEX IF NOT EXISTS "Ticket_departmentId_idx"
  ON public."Ticket" ("departmentId");
CREATE INDEX IF NOT EXISTS "TicketFieldService_technicianId_idx"
  ON public."TicketFieldService" ("technicianId");
CREATE INDEX IF NOT EXISTS "TicketTimeline_actorUserId_idx"
  ON public."TicketTimeline" ("actorUserId");
CREATE INDEX IF NOT EXISTS "User_departmentId_idx"
  ON public."User" (department_id);
