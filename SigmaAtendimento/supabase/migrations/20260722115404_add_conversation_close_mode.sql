do $$
begin
  create type public."ConversationCloseMode" as enum ('WITH_RATING', 'INACTIVITY', 'SILENT');
exception
  when duplicate_object then null;
end $$;

alter table public."Conversation"
  add column if not exists "closeMode" public."ConversationCloseMode";

alter table public."ConversationReport"
  add column if not exists close_mode public."ConversationCloseMode";
