/*
  Warnings:

  - The values [OPEN] on the enum `ConversationStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ConversationStatus_new" AS ENUM ('NEW', 'IN_PROGRESS', 'CLOSED');
ALTER TABLE "Conversation" ALTER COLUMN "status" TYPE "ConversationStatus_new" USING ("status"::text::"ConversationStatus_new");
ALTER TYPE "ConversationStatus" RENAME TO "ConversationStatus_old";
ALTER TYPE "ConversationStatus_new" RENAME TO "ConversationStatus";
DROP TYPE "ConversationStatus_old";
COMMIT;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "email" TEXT,
ADD COLUMN     "notes" TEXT;
