ALTER TABLE "Conversation"
  ADD COLUMN "lastWelcomeSentAt" TIMESTAMP(3),
  ADD COLUMN "ratingRequestedAt" TIMESTAMP(3),
  ADD COLUMN "rating" INTEGER,
  ADD COLUMN "ratedAt" TIMESTAMP(3),
  ADD CONSTRAINT "Conversation_rating_range" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 10);

CREATE INDEX "Conversation_feedback_lookup_idx"
  ON "Conversation" ("companyId", "contactId", "status", "ratingRequestedAt");
