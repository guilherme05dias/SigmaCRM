alter table public."Conversation"
  add column if not exists "lastAwaySentAt" timestamptz;
