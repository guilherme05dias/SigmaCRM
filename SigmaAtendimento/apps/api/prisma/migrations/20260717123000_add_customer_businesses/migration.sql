-- Empresas vinculadas a um cliente do CRM.
-- A coluna company_id mantém a defesa em profundidade entre tenants.
CREATE TABLE "CustomerBusiness" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerBusiness_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CustomerBusiness_name_not_blank" CHECK (btrim("name") <> ''),
    CONSTRAINT "CustomerBusiness_cnpj_format" CHECK ("cnpj" ~ '^[0-9]{14}$')
);

CREATE UNIQUE INDEX "CustomerBusiness_company_id_cnpj_key"
    ON "CustomerBusiness"("company_id", "cnpj");

CREATE INDEX "CustomerBusiness_company_id_idx"
    ON "CustomerBusiness"("company_id");

CREATE INDEX "CustomerBusiness_customer_id_idx"
    ON "CustomerBusiness"("customer_id");

ALTER TABLE "CustomerBusiness"
    ADD CONSTRAINT "CustomerBusiness_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "Company"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerBusiness"
    ADD CONSTRAINT "CustomerBusiness_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "Customer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerBusiness" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_customer_business" ON "CustomerBusiness"
    FOR ALL
    USING ("company_id" = current_setting('app.current_company_id', true))
    WITH CHECK ("company_id" = current_setting('app.current_company_id', true));

-- O frontend usa a API Express/Prisma; a tabela não é exposta diretamente pela Data API.
REVOKE ALL ON TABLE "CustomerBusiness" FROM anon, authenticated;
