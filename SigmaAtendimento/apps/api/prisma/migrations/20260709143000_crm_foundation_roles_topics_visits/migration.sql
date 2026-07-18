-- CRM foundation for Sigma Atendimento + CRM.
-- Adds explicit product roles, service topics, default technician, conversation closing fields,
-- and the initial structure for field visit scheduling/history.

CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SUPERVISOR', 'ATTENDANT', 'TECHNICIAN');
CREATE TYPE "FieldVisitStatus" AS ENUM ('PENDING', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED');

ALTER TABLE "User"
  ALTER COLUMN "role" DROP DEFAULT;

UPDATE "User"
SET "role" = 'ATTENDANT'
WHERE "role" = 'AGENT';

ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole"
  USING "role"::"UserRole";

ALTER TABLE "User"
  ALTER COLUMN "role" SET DEFAULT 'ATTENDANT';

ALTER TABLE "Company"
  ADD COLUMN "default_technician_id" TEXT;

CREATE TABLE "ServiceTopic" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "descricao" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceTopic_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Conversation"
  ADD COLUMN "serviceTopicId" TEXT,
  ADD COLUMN "otherTopicDescription" TEXT,
  ADD COLUMN "queuedAt" TIMESTAMP(3),
  ADD COLUMN "departmentSelectedAt" TIMESTAMP(3),
  ADD COLUMN "assignedAt" TIMESTAMP(3),
  ADD COLUMN "fallbackAssignedAt" TIMESTAMP(3),
  ADD COLUMN "closeResult" TEXT,
  ADD COLUMN "closeSummary" TEXT,
  ADD COLUMN "closeNotes" TEXT,
  ADD COLUMN "fieldServiceRequired" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Ticket"
  ADD COLUMN "serviceTopicId" TEXT,
  ADD COLUMN "otherTopicDescription" TEXT;

ALTER TABLE "TicketFieldService"
  ADD COLUMN "status" "FieldVisitStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "result" TEXT,
  ADD COLUMN "serviceDescription" TEXT,
  ADD COLUMN "materialsUsed" TEXT,
  ADD COLUMN "photos" JSONB;

CREATE TABLE "FieldVisitScheduleChange" (
  "id" TEXT NOT NULL,
  "company_id" TEXT,
  "field_service_id" TEXT NOT NULL,
  "changed_by_user_id" TEXT,
  "previous_scheduled_at" TIMESTAMP(3),
  "new_scheduled_at" TIMESTAMP(3),
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FieldVisitScheduleChange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceTopic_company_id_nome_key" ON "ServiceTopic"("company_id", "nome");
CREATE INDEX "ServiceTopic_company_id_idx" ON "ServiceTopic"("company_id");
CREATE INDEX "Conversation_serviceTopicId_idx" ON "Conversation"("serviceTopicId");
CREATE INDEX "Ticket_serviceTopicId_idx" ON "Ticket"("serviceTopicId");
CREATE INDEX "TicketFieldService_status_idx" ON "TicketFieldService"("status");
CREATE INDEX "FieldVisitScheduleChange_company_id_idx" ON "FieldVisitScheduleChange"("company_id");
CREATE INDEX "FieldVisitScheduleChange_field_service_id_idx" ON "FieldVisitScheduleChange"("field_service_id");

ALTER TABLE "Company"
  ADD CONSTRAINT "Company_default_technician_id_fkey"
  FOREIGN KEY ("default_technician_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceTopic"
  ADD CONSTRAINT "ServiceTopic_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_serviceTopicId_fkey"
  FOREIGN KEY ("serviceTopicId") REFERENCES "ServiceTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Ticket"
  ADD CONSTRAINT "Ticket_serviceTopicId_fkey"
  FOREIGN KEY ("serviceTopicId") REFERENCES "ServiceTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FieldVisitScheduleChange"
  ADD CONSTRAINT "FieldVisitScheduleChange_field_service_id_fkey"
  FOREIGN KEY ("field_service_id") REFERENCES "TicketFieldService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FieldVisitScheduleChange"
  ADD CONSTRAINT "FieldVisitScheduleChange_changed_by_user_id_fkey"
  FOREIGN KEY ("changed_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
