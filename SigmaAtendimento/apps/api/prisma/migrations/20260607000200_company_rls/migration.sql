-- Completa a defesa RLS no tenant raiz.

ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_company" ON "Company";
CREATE POLICY "tenant_isolation_company" ON "Company"
  FOR ALL
  USING ("id" = current_setting('app.current_company_id', true))
  WITH CHECK ("id" = current_setting('app.current_company_id', true));
