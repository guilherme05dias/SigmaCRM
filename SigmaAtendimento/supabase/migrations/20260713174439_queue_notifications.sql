ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONVERSATION_QUEUED';

ALTER TABLE "Conversation" ADD COLUMN "queueNotifiedAt" TIMESTAMP(3);
CREATE INDEX "Conversation_queue_notification_idx" ON "Conversation" ("companyId", "status", "queueNotifiedAt");

-- Conversas já existentes não geram uma enxurrada de avisos na implantação.
UPDATE "Conversation" SET "queueNotifiedAt" = NOW() WHERE "status" = 'OPEN';
