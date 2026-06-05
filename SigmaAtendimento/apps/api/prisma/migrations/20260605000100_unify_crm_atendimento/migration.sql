-- CreateEnum
CREATE TYPE "TicketChannel" AS ENUM ('WHATSAPP', 'PHONE', 'EMAIL', 'PRESENCIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('REMOTO', 'PRESENCIAL', 'HIBRIDO');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ATIVO', 'NEGOCIACAO', 'INATIVO');

-- CreateEnum
CREATE TYPE "TimelineType" AS ENUM ('CREATED', 'STATUS_CHANGE', 'ASSIGNMENT', 'NOTE', 'MESSAGE', 'FIELD_SERVICE', 'EVALUATION');

-- CreateEnum
CREATE TYPE "WhatsAppProvider" AS ENUM ('WAHA', 'META', 'MOCK');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterEnum
BEGIN;
CREATE TYPE "ConversationStatus_new" AS ENUM ('OPEN', 'ASSIGNED', 'CLOSED');
ALTER TABLE "Conversation" ALTER COLUMN "status" TYPE "ConversationStatus_new" USING ("status"::text::"ConversationStatus_new");
ALTER TYPE "ConversationStatus" RENAME TO "ConversationStatus_old";
ALTER TYPE "ConversationStatus_new" RENAME TO "ConversationStatus";
DROP TYPE "ConversationStatus_old";
COMMIT;

-- AlterEnum
ALTER TYPE "TicketPriority" ADD VALUE 'CRITICAL';

-- AlterEnum
BEGIN;
CREATE TYPE "TicketStatus_new" AS ENUM ('NEW', 'QUEUED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_INTERNAL', 'SCHEDULED_FIELD_SERVICE', 'RESOLVED', 'CLOSED', 'CANCELED');
ALTER TABLE "Ticket" ALTER COLUMN "status" TYPE "TicketStatus_new" USING ("status"::text::"TicketStatus_new");
ALTER TYPE "TicketStatus" RENAME TO "TicketStatus_old";
ALTER TYPE "TicketStatus_new" RENAME TO "TicketStatus";
DROP TYPE "TicketStatus_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_technicianId_fkey";

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "role" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "isTransferred" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "status" SET DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "onSiteRequired",
DROP COLUMN "technicianId",
DROP COLUMN "visitAddress",
DROP COLUMN "visitWindowEnd",
DROP COLUMN "visitWindowStart",
ADD COLUMN     "category" TEXT,
ADD COLUMN     "channel" "TicketChannel" NOT NULL DEFAULT 'WHATSAPP',
ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "protocol" TEXT,
ADD COLUMN     "solvedAt" TIMESTAMP(3),
ALTER COLUMN "priority" SET DEFAULT 'MEDIUM',
ALTER COLUMN "status" SET DEFAULT 'NEW';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "specialty" TEXT;

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "segment" TEXT,
    "city" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ATIVO',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketFieldService" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "ticketId" TEXT NOT NULL,
    "technicianId" TEXT,
    "serviceType" "ServiceType" NOT NULL DEFAULT 'REMOTO',
    "equipment" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "hoursSpent" DOUBLE PRECISION,
    "resolution" TEXT,
    "onSiteRequired" BOOLEAN NOT NULL DEFAULT false,
    "visitAddress" TEXT,
    "visitWindowStart" TIMESTAMP(3),
    "visitWindowEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketFieldService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketEvaluation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "ticketId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTimeline" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "ticketId" TEXT NOT NULL,
    "type" "TimelineType" NOT NULL,
    "actorUserId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "companyId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("companyId","scope")
);

-- CreateTable
CREATE TABLE "WhatsAppInboundEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "provider" "WhatsAppProvider" NOT NULL DEFAULT 'WAHA',
    "providerMessageId" TEXT,
    "phoneNumberId" TEXT,
    "fromPhone" TEXT,
    "rawPayload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppInboundEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppOutbox" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "conversationId" TEXT,
    "messageId" TEXT,
    "provider" "WhatsAppProvider" NOT NULL DEFAULT 'WAHA',
    "phoneNumberId" TEXT,
    "toPhone" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_companyId_idx" ON "Customer"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketFieldService_ticketId_key" ON "TicketFieldService"("ticketId");

-- CreateIndex
CREATE INDEX "TicketFieldService_companyId_idx" ON "TicketFieldService"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketEvaluation_ticketId_key" ON "TicketEvaluation"("ticketId");

-- CreateIndex
CREATE INDEX "TicketEvaluation_companyId_idx" ON "TicketEvaluation"("companyId");

-- CreateIndex
CREATE INDEX "TicketTimeline_companyId_idx" ON "TicketTimeline"("companyId");

-- CreateIndex
CREATE INDEX "TicketTimeline_ticketId_idx" ON "TicketTimeline"("ticketId");

-- CreateIndex
CREATE INDEX "WhatsAppInboundEvent_companyId_idx" ON "WhatsAppInboundEvent"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppInboundEvent_provider_providerMessageId_key" ON "WhatsAppInboundEvent"("provider", "providerMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppOutbox_companyId_idx" ON "WhatsAppOutbox"("companyId");

-- CreateIndex
CREATE INDEX "WhatsAppOutbox_status_idx" ON "WhatsAppOutbox"("status");

-- CreateIndex
CREATE INDEX "Contact_companyId_idx" ON "Contact"("companyId");

-- CreateIndex
CREATE INDEX "Conversation_companyId_idx" ON "Conversation"("companyId");

-- CreateIndex
CREATE INDEX "Conversation_contactId_idx" ON "Conversation"("contactId");

-- CreateIndex
CREATE INDEX "Department_company_id_idx" ON "Department"("company_id");

-- CreateIndex
CREATE INDEX "Message_companyId_idx" ON "Message"("companyId");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "Ticket_companyId_idx" ON "Ticket"("companyId");

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_companyId_protocol_key" ON "Ticket"("companyId", "protocol");

-- CreateIndex
CREATE INDEX "User_company_id_idx" ON "User"("company_id");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketFieldService" ADD CONSTRAINT "TicketFieldService_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketFieldService" ADD CONSTRAINT "TicketFieldService_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEvaluation" ADD CONSTRAINT "TicketEvaluation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTimeline" ADD CONSTRAINT "TicketTimeline_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTimeline" ADD CONSTRAINT "TicketTimeline_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
