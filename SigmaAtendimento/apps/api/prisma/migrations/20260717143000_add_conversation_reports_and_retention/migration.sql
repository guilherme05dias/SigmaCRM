-- Snapshot mínimo mantido depois que um atendimento é encerrado.
CREATE TABLE "ConversationReport" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "business_name" TEXT,
    "business_cnpj" TEXT,
    "system_name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "rating" INTEGER,
    "observation" TEXT,
    "closed_at" TIMESTAMP(3) NOT NULL,
    "rated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationReport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConversationReport_customer_name_not_blank" CHECK (btrim("customer_name") <> ''),
    CONSTRAINT "ConversationReport_system_name_not_blank" CHECK (btrim("system_name") <> ''),
    CONSTRAINT "ConversationReport_summary_not_blank" CHECK (btrim("summary") <> ''),
    CONSTRAINT "ConversationReport_business_cnpj_format" CHECK ("business_cnpj" IS NULL OR "business_cnpj" ~ '^[0-9]{14}$'),
    CONSTRAINT "ConversationReport_rating_range" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 10)
);

CREATE UNIQUE INDEX "ConversationReport_conversation_id_key"
    ON "ConversationReport"("conversation_id");

CREATE INDEX "ConversationReport_company_id_closed_at_idx"
    ON "ConversationReport"("company_id", "closed_at" DESC);

ALTER TABLE "ConversationReport"
    ADD CONSTRAINT "ConversationReport_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "Company"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConversationReport"
    ADD CONSTRAINT "ConversationReport_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Vincula eventos recebidos ao atendimento para que o payload técnico possa
-- ser removido junto com as mensagens quando o atendimento for finalizado.
ALTER TABLE "WhatsAppInboundEvent"
    ADD COLUMN "conversation_id" TEXT;

CREATE INDEX "WhatsAppInboundEvent_conversation_id_idx"
    ON "WhatsAppInboundEvent"("conversation_id");

ALTER TABLE "WhatsAppInboundEvent"
    ADD CONSTRAINT "WhatsAppInboundEvent_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationReport" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_conversation_report" ON "ConversationReport"
    FOR ALL
    USING ("company_id" = (SELECT current_setting('app.current_company_id', true)))
    WITH CHECK ("company_id" = (SELECT current_setting('app.current_company_id', true)));

-- Os relatórios são acessados pela API Express/Prisma, não diretamente pela Data API.
REVOKE ALL ON TABLE "ConversationReport" FROM anon, authenticated;
