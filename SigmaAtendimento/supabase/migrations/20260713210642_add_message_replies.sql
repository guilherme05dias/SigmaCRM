alter table public."Message"
  add column if not exists "replyToMessageId" text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'Message_replyToMessageId_fkey'
      and conrelid = 'public."Message"'::regclass
  ) then
    alter table public."Message"
      add constraint "Message_replyToMessageId_fkey"
      foreign key ("replyToMessageId")
      references public."Message"(id)
      on update cascade
      on delete set null;
  end if;
end $$;

create index if not exists "Message_replyToMessageId_idx"
  on public."Message" ("replyToMessageId");

-- Reconstroi respostas ja existentes a partir dos payloads brutos da UAZAPI.
with raw_candidates as (
  select item
  from public."WhatsAppInboundEvent" event
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(event."rawPayload"->'messages') = 'array'
        then event."rawPayload"->'messages'
      else '[]'::jsonb
    end
  ) item

  union all

  select item
  from public."WhatsAppInboundEvent" event
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(event."rawPayload"#>'{data,messages}') = 'array'
        then event."rawPayload"#>'{data,messages}'
      else '[]'::jsonb
    end
  ) item

  union all

  select event."rawPayload"->'message'
  from public."WhatsAppInboundEvent" event
  where jsonb_typeof(event."rawPayload"->'message') = 'object'

  union all

  select event."rawPayload"->'data'
  from public."WhatsAppInboundEvent" event
  where jsonb_typeof(event."rawPayload"->'data') = 'object'
),
raw_links as (
  select distinct
    regexp_replace(
      coalesce(item->>'messageid', item->>'messageId', item#>>'{key,id}', item->>'id'),
      '^.*:',
      ''
    ) as child_provider_id,
    regexp_replace(
      coalesce(
        item->>'quoted',
        item->>'quotedMessageId',
        item#>>'{contextInfo,stanzaId}',
        item#>>'{content,contextInfo,stanzaId}'
      ),
      '^.*:',
      ''
    ) as parent_provider_id
  from raw_candidates
  where nullif(
    coalesce(
      item->>'quoted',
      item->>'quotedMessageId',
      item#>>'{contextInfo,stanzaId}',
      item#>>'{content,contextInfo,stanzaId}'
    ),
    ''
  ) is not null
),
resolved as (
  select child.id as child_id, parent.id as parent_id
  from raw_links link
  join public."Message" child
    on regexp_replace(child."waMessageId", '^.*:', '') = link.child_provider_id
  join public."Message" parent
    on parent."conversationId" = child."conversationId"
   and regexp_replace(parent."waMessageId", '^.*:', '') = link.parent_provider_id
  where child.id <> parent.id
)
update public."Message" message
set "replyToMessageId" = resolved.parent_id
from resolved
where message.id = resolved.child_id
  and message."replyToMessageId" is null;
