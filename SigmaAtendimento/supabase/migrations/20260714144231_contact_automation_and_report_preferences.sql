ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "is_whatsapp_group" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "welcome_message_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "include_in_service_reports" BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN "Contact"."is_whatsapp_group" IS
  'Identifica conversas de grupo para impedir respostas automaticas.';

COMMENT ON COLUMN "Contact"."welcome_message_enabled" IS
  'Permite desativar a mensagem de boas-vindas para contatos internos.';

COMMENT ON COLUMN "Contact"."include_in_service_reports" IS
  'Define se conversas e chamados do contato entram nos relatorios de atendimento.';
