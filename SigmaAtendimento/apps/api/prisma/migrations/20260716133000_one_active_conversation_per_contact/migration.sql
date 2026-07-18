-- A contact may have many closed conversations, but only one active service.
-- This also serializes concurrent webhook deliveries: the losing insert raises
-- P2002 in Prisma and reuses the active conversation created by the winner.
CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_one_active_per_contact_key"
ON "Conversation" ("companyId", "contactId")
WHERE "status" IN ('OPEN', 'ASSIGNED');
