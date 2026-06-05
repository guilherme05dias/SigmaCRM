-- AlterEnum
ALTER TYPE "MessageDirection" ADD VALUE 'SYSTEM';

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "businessHours" JSONB NOT NULL,
    "welcomeMessage" TEXT,
    "awayMessage" TEXT,
    "closingMessage" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Settings_company_id_key" ON "Settings"("company_id");

-- AddForeignKey
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
