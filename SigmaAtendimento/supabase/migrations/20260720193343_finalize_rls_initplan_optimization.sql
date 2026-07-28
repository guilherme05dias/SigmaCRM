ALTER POLICY tenant_isolation_field_visit_schedule_change ON public."FieldVisitScheduleChange"
  USING (company_id = NULLIF((SELECT current_setting('app.current_company_id', true)), ''))
  WITH CHECK (company_id = NULLIF((SELECT current_setting('app.current_company_id', true)), ''));

ALTER POLICY tenant_isolation_notification ON public."Notification"
  USING (company_id = NULLIF((SELECT current_setting('app.current_company_id', true)), ''))
  WITH CHECK (company_id = NULLIF((SELECT current_setting('app.current_company_id', true)), ''));

ALTER POLICY tenant_isolation_service_topic ON public."ServiceTopic"
  USING (company_id = NULLIF((SELECT current_setting('app.current_company_id', true)), ''))
  WITH CHECK (company_id = NULLIF((SELECT current_setting('app.current_company_id', true)), ''));
