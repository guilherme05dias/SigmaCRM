alter table public."Conversation"
add column if not exists "unread_count" integer not null default 0;
