CREATE TYPE "NotificationType" AS ENUM (
    'FIELD_VISIT_ASSIGNED',
    'FIELD_VISIT_SCHEDULE_CHANGED',
    'FIELD_VISIT_STATUS_CHANGED',
    'TICKET_ASSIGNED'
);

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "payload" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Notification_company_id_idx" ON "Notification"("company_id");
CREATE INDEX "Notification_user_id_read_at_created_at_idx" ON "Notification"("user_id", "read_at", "created_at");
CREATE INDEX "Notification_company_id_user_id_read_at_idx" ON "Notification"("company_id", "user_id", "read_at");
