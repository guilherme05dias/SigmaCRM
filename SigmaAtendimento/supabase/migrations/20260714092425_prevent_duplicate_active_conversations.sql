-- Consolidate duplicate active conversations before enforcing the invariant.
-- The keeper is the assigned conversation, then the one with messages, then
-- the most recently active record.
do $migration$
begin
create temporary table duplicate_active_conversation_map on commit drop as
with ranked as (
  select
    conversation.id,
    first_value(conversation.id) over (
      partition by conversation."companyId", conversation."contactId"
      order by
        (conversation.status = 'ASSIGNED') desc,
        exists (
          select 1
          from public."Message" message
          where message."conversationId" = conversation.id
        ) desc,
        coalesce(conversation."lastMessageAt", conversation."updatedAt", conversation."createdAt") desc,
        conversation."createdAt" desc,
        conversation.id desc
    ) as keeper_id,
    row_number() over (
      partition by conversation."companyId", conversation."contactId"
      order by
        (conversation.status = 'ASSIGNED') desc,
        exists (
          select 1
          from public."Message" message
          where message."conversationId" = conversation.id
        ) desc,
        coalesce(conversation."lastMessageAt", conversation."updatedAt", conversation."createdAt") desc,
        conversation."createdAt" desc,
        conversation.id desc
    ) as position
  from public."Conversation" conversation
  where conversation."companyId" is not null
    and conversation.status in ('OPEN', 'ASSIGNED')
)
select id as duplicate_id, keeper_id
from ranked
where position > 1;

update public."Conversation" keeper
set
  "startedAt" = coalesce(least(keeper."startedAt", duplicate_dates.first_started_at), keeper."startedAt", duplicate_dates.first_started_at),
  "lastMessageAt" = coalesce(greatest(keeper."lastMessageAt", duplicate_dates.last_message_at), keeper."lastMessageAt", duplicate_dates.last_message_at),
  "lastWelcomeSentAt" = coalesce(greatest(keeper."lastWelcomeSentAt", duplicate_dates.last_welcome_at), keeper."lastWelcomeSentAt", duplicate_dates.last_welcome_at),
  "lastAwaySentAt" = coalesce(greatest(keeper."lastAwaySentAt", duplicate_dates.last_away_at), keeper."lastAwaySentAt", duplicate_dates.last_away_at),
  "updatedAt" = now()
from (
  select
    duplicate_map.keeper_id,
    min(duplicate."startedAt") as first_started_at,
    max(duplicate."lastMessageAt") as last_message_at,
    max(duplicate."lastWelcomeSentAt") as last_welcome_at,
    max(duplicate."lastAwaySentAt") as last_away_at
  from duplicate_active_conversation_map duplicate_map
  join public."Conversation" duplicate on duplicate.id = duplicate_map.duplicate_id
  group by duplicate_map.keeper_id
) duplicate_dates
where keeper.id = duplicate_dates.keeper_id;

update public."Message" message
set "conversationId" = duplicate_map.keeper_id,
    "updatedAt" = now()
from duplicate_active_conversation_map duplicate_map
where message."conversationId" = duplicate_map.duplicate_id;

update public."Ticket" ticket
set "conversationId" = duplicate_map.keeper_id,
    "updatedAt" = now()
from duplicate_active_conversation_map duplicate_map
where ticket."conversationId" = duplicate_map.duplicate_id;

update public."WhatsAppOutbox" outbox
set "conversationId" = duplicate_map.keeper_id,
    "updatedAt" = now()
from duplicate_active_conversation_map duplicate_map
where outbox."conversationId" = duplicate_map.duplicate_id;

delete from public."Conversation" conversation
using duplicate_active_conversation_map duplicate_map
where conversation.id = duplicate_map.duplicate_id;

create unique index if not exists "Conversation_one_active_per_contact_key"
  on public."Conversation" ("companyId", "contactId")
  where status in ('OPEN', 'ASSIGNED');

comment on index public."Conversation_one_active_per_contact_key" is
  'Ensures that each contact has at most one OPEN or ASSIGNED conversation per company.';
end;
$migration$;
