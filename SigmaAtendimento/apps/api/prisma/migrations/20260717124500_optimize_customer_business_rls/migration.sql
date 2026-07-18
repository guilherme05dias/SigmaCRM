-- Evita recalcular a configuração do tenant para cada linha avaliada pela policy.
DROP POLICY IF EXISTS "tenant_isolation_customer_business" ON "CustomerBusiness";

CREATE POLICY "tenant_isolation_customer_business" ON "CustomerBusiness"
    FOR ALL
    USING ("company_id" = (SELECT current_setting('app.current_company_id', true)))
    WITH CHECK ("company_id" = (SELECT current_setting('app.current_company_id', true)));

-- O índice único (company_id, cnpj) já cobre buscas pelo tenant.
DROP INDEX IF EXISTS "CustomerBusiness_company_id_idx";
