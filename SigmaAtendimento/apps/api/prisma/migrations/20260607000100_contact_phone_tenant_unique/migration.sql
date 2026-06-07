-- Telefones de contato devem ser únicos por empresa, não globalmente.
-- Isso evita mover contatos entre tenants quando o mesmo número existir em empresas diferentes.

DROP INDEX IF EXISTS "Contact_phone_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Contact_companyId_phone_key" ON "Contact"("companyId", "phone");
