ALTER TABLE "User"
  ADD COLUMN "can_view_all_conversations" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User"
SET "can_view_all_conversations" = true
WHERE lower("email") = 'carlos@sigmapdv.com';

COMMENT ON COLUMN "User"."can_view_all_conversations" IS
  'Allows read-only access to every conversation in the user company without granting manager roles.';
