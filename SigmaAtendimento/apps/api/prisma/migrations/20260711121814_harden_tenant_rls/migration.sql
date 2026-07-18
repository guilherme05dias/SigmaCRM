-- Defense in depth for tenant tables introduced after the initial RLS migration.
-- The application sets app.current_company_id per tenant-aware database session.

ALTER TABLE "ServiceTopic" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_service_topic" ON "ServiceTopic";
CREATE POLICY "tenant_isolation_service_topic" ON "ServiceTopic"
  FOR ALL
  USING (
    "company_id" = NULLIF(current_setting('app.current_company_id', true), '')
  )
  WITH CHECK (
    "company_id" = NULLIF(current_setting('app.current_company_id', true), '')
  );

ALTER TABLE "FieldVisitScheduleChange" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_field_visit_schedule_change" ON "FieldVisitScheduleChange";
CREATE POLICY "tenant_isolation_field_visit_schedule_change" ON "FieldVisitScheduleChange"
  FOR ALL
  USING (
    "company_id" = NULLIF(current_setting('app.current_company_id', true), '')
  )
  WITH CHECK (
    "company_id" = NULLIF(current_setting('app.current_company_id', true), '')
  );

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_notification" ON "Notification";
CREATE POLICY "tenant_isolation_notification" ON "Notification"
  FOR ALL
  USING (
    "company_id" = NULLIF(current_setting('app.current_company_id', true), '')
  )
  WITH CHECK (
    "company_id" = NULLIF(current_setting('app.current_company_id', true), '')
  );

-- These tables are backend-only. Keep them unavailable through the public Data API;
-- service_role retains its privileged server-side access.
REVOKE ALL ON TABLE "ServiceTopic" FROM anon, authenticated;
REVOKE ALL ON TABLE "FieldVisitScheduleChange" FROM anon, authenticated;
REVOKE ALL ON TABLE "Notification" FROM anon, authenticated;
