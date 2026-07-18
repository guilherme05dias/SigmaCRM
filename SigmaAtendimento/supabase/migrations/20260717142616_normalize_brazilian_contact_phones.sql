-- Canonicalize Brazilian phone numbers and merge contacts created from the
-- national and legacy WhatsApp variants of the same number.
do $migration$
begin
  create temporary table contact_phone_rank on commit drop as
  with normalized as (
    select
      contact.*,
      case
        when length(regexp_replace(contact.phone, '\D', '', 'g')) = 13
          and regexp_replace(contact.phone, '\D', '', 'g') like '55%'
          then regexp_replace(contact.phone, '\D', '', 'g')
        when length(regexp_replace(contact.phone, '\D', '', 'g')) = 12
          and regexp_replace(contact.phone, '\D', '', 'g') like '55%'
          and substring(regexp_replace(contact.phone, '\D', '', 'g') from 5 for 1) in ('6', '7', '8', '9')
          then substring(regexp_replace(contact.phone, '\D', '', 'g') from 1 for 4)
            || '9'
            || substring(regexp_replace(contact.phone, '\D', '', 'g') from 5)
        when length(regexp_replace(contact.phone, '\D', '', 'g')) = 12
          and regexp_replace(contact.phone, '\D', '', 'g') like '55%'
          then regexp_replace(contact.phone, '\D', '', 'g')
        when length(regexp_replace(contact.phone, '\D', '', 'g')) = 11
          then '55' || regexp_replace(contact.phone, '\D', '', 'g')
        when length(regexp_replace(contact.phone, '\D', '', 'g')) = 10
          and substring(regexp_replace(contact.phone, '\D', '', 'g') from 3 for 1) in ('6', '7', '8', '9')
          then '55'
            || substring(regexp_replace(contact.phone, '\D', '', 'g') from 1 for 2)
            || '9'
            || substring(regexp_replace(contact.phone, '\D', '', 'g') from 3)
        when length(regexp_replace(contact.phone, '\D', '', 'g')) = 10
          then '55' || regexp_replace(contact.phone, '\D', '', 'g')
        else regexp_replace(contact.phone, '\D', '', 'g')
      end as canonical_phone
    from public."Contact" contact
  ), ranked as (
    select
      normalized.id,
      normalized."companyId",
      normalized.canonical_phone,
      first_value(normalized.id) over (
        partition by normalized."companyId", normalized.canonical_phone
        order by
          (normalized."customerId" is not null) desc,
          (nullif(btrim(normalized.name), '') is not null) desc,
          (normalized."avatar_url" is not null) desc,
          normalized."createdAt" asc,
          normalized.id asc
      ) as keeper_id,
      row_number() over (
        partition by normalized."companyId", normalized.canonical_phone
        order by
          (normalized."customerId" is not null) desc,
          (nullif(btrim(normalized.name), '') is not null) desc,
          (normalized."avatar_url" is not null) desc,
          normalized."createdAt" asc,
          normalized.id asc
      ) as position
    from normalized
  )
  select * from ranked;

  -- There can be only one active conversation after the contacts converge.
  create temporary table canonical_active_conversation_map on commit drop as
  with ranked as (
    select
      conversation.id,
      first_value(conversation.id) over (
        partition by conversation."companyId", contact_rank.canonical_phone
        order by
          (conversation.status = 'ASSIGNED') desc,
          exists (
            select 1
            from public."Message" message
            where message."conversationId" = conversation.id
          ) desc,
          coalesce(conversation."lastMessageAt", conversation."updatedAt", conversation."createdAt") desc,
          conversation."createdAt" asc,
          conversation.id asc
      ) as keeper_id,
      row_number() over (
        partition by conversation."companyId", contact_rank.canonical_phone
        order by
          (conversation.status = 'ASSIGNED') desc,
          exists (
            select 1
            from public."Message" message
            where message."conversationId" = conversation.id
          ) desc,
          coalesce(conversation."lastMessageAt", conversation."updatedAt", conversation."createdAt") desc,
          conversation."createdAt" asc,
          conversation.id asc
      ) as position
    from public."Conversation" conversation
    join contact_phone_rank contact_rank on contact_rank.id = conversation."contactId"
    where conversation.status in ('OPEN', 'ASSIGNED')
  )
  select id as duplicate_id, keeper_id
  from ranked
  where position > 1;

  update public."Conversation" keeper
  set
    status = case when duplicate_data.has_assigned then 'ASSIGNED'::"ConversationStatus" else keeper.status end,
    "assignedUserId" = coalesce(keeper."assignedUserId", duplicate_data.assigned_user_id),
    "departmentId" = coalesce(keeper."departmentId", duplicate_data.department_id),
    "queuedAt" = coalesce(least(keeper."queuedAt", duplicate_data.first_queued_at), keeper."queuedAt", duplicate_data.first_queued_at),
    "assignedAt" = coalesce(least(keeper."assignedAt", duplicate_data.first_assigned_at), keeper."assignedAt", duplicate_data.first_assigned_at),
    "startedAt" = coalesce(least(keeper."startedAt", duplicate_data.first_started_at), keeper."startedAt", duplicate_data.first_started_at),
    "lastMessageAt" = coalesce(greatest(keeper."lastMessageAt", duplicate_data.last_message_at), keeper."lastMessageAt", duplicate_data.last_message_at),
    "lastWelcomeSentAt" = coalesce(greatest(keeper."lastWelcomeSentAt", duplicate_data.last_welcome_at), keeper."lastWelcomeSentAt", duplicate_data.last_welcome_at),
    "lastAwaySentAt" = coalesce(greatest(keeper."lastAwaySentAt", duplicate_data.last_away_at), keeper."lastAwaySentAt", duplicate_data.last_away_at),
    "unread_count" = keeper."unread_count" + duplicate_data.unread_count,
    "isTransferred" = keeper."isTransferred" or duplicate_data.was_transferred,
    "updatedAt" = now()
  from (
    select
      conversation_map.keeper_id,
      bool_or(duplicate.status = 'ASSIGNED') as has_assigned,
      max(duplicate."assignedUserId") as assigned_user_id,
      max(duplicate."departmentId") as department_id,
      min(duplicate."queuedAt") as first_queued_at,
      min(duplicate."assignedAt") as first_assigned_at,
      min(duplicate."startedAt") as first_started_at,
      max(duplicate."lastMessageAt") as last_message_at,
      max(duplicate."lastWelcomeSentAt") as last_welcome_at,
      max(duplicate."lastAwaySentAt") as last_away_at,
      sum(duplicate."unread_count")::integer as unread_count,
      bool_or(duplicate."isTransferred") as was_transferred
    from canonical_active_conversation_map conversation_map
    join public."Conversation" duplicate on duplicate.id = conversation_map.duplicate_id
    group by conversation_map.keeper_id
  ) duplicate_data
  where keeper.id = duplicate_data.keeper_id;

  update public."Message" message
  set "conversationId" = conversation_map.keeper_id,
      "updatedAt" = now()
  from canonical_active_conversation_map conversation_map
  where message."conversationId" = conversation_map.duplicate_id;

  update public."Ticket" ticket
  set "conversationId" = conversation_map.keeper_id,
      "updatedAt" = now()
  from canonical_active_conversation_map conversation_map
  where ticket."conversationId" = conversation_map.duplicate_id;

  update public."WhatsAppInboundEvent" inbound_event
  set "conversation_id" = conversation_map.keeper_id
  from canonical_active_conversation_map conversation_map
  where inbound_event."conversation_id" = conversation_map.duplicate_id;

  update public."WhatsAppOutbox" outbox
  set "conversationId" = conversation_map.keeper_id,
      "updatedAt" = now()
  from canonical_active_conversation_map conversation_map
  where outbox."conversationId" = conversation_map.duplicate_id;

  delete from public."Conversation" conversation
  using canonical_active_conversation_map conversation_map
  where conversation.id = conversation_map.duplicate_id;

  -- Preserve all closed histories and tickets under the selected contact.
  update public."Conversation" conversation
  set "contactId" = contact_rank.keeper_id,
      "updatedAt" = now()
  from contact_phone_rank contact_rank
  where contact_rank.position > 1
    and conversation."contactId" = contact_rank.id;

  update public."Ticket" ticket
  set "contactId" = contact_rank.keeper_id,
      "updatedAt" = now()
  from contact_phone_rank contact_rank
  where contact_rank.position > 1
    and ticket."contactId" = contact_rank.id;

  -- Keep the richest available profile and honor any explicit opt-out.
  update public."Contact" keeper
  set
    name = coalesce((
      select candidate.name
      from contact_phone_rank member
      join public."Contact" candidate on candidate.id = member.id
      where member.keeper_id = keeper.id and nullif(btrim(candidate.name), '') is not null
      order by length(btrim(candidate.name)) desc, candidate."updatedAt" desc
      limit 1
    ), keeper.name),
    "customerId" = coalesce((
      select candidate."customerId"
      from contact_phone_rank member
      join public."Contact" candidate on candidate.id = member.id
      where member.keeper_id = keeper.id and candidate."customerId" is not null
      order by candidate."updatedAt" desc
      limit 1
    ), keeper."customerId"),
    email = coalesce((
      select candidate.email
      from contact_phone_rank member
      join public."Contact" candidate on candidate.id = member.id
      where member.keeper_id = keeper.id and nullif(btrim(candidate.email), '') is not null
      order by candidate."updatedAt" desc
      limit 1
    ), keeper.email),
    role = coalesce((
      select candidate.role
      from contact_phone_rank member
      join public."Contact" candidate on candidate.id = member.id
      where member.keeper_id = keeper.id and nullif(btrim(candidate.role), '') is not null
      order by candidate."updatedAt" desc
      limit 1
    ), keeper.role),
    notes = coalesce((
      select candidate.notes
      from contact_phone_rank member
      join public."Contact" candidate on candidate.id = member.id
      where member.keeper_id = keeper.id and nullif(btrim(candidate.notes), '') is not null
      order by length(btrim(candidate.notes)) desc
      limit 1
    ), keeper.notes),
    "avatar_url" = coalesce((
      select candidate."avatar_url"
      from contact_phone_rank member
      join public."Contact" candidate on candidate.id = member.id
      where member.keeper_id = keeper.id and candidate."avatar_url" is not null
      order by candidate."updatedAt" desc
      limit 1
    ), keeper."avatar_url"),
    "is_whatsapp_group" = keeper."is_whatsapp_group" or exists (
      select 1
      from contact_phone_rank member
      join public."Contact" candidate on candidate.id = member.id
      where member.keeper_id = keeper.id and candidate."is_whatsapp_group"
    ),
    "welcome_message_enabled" = not exists (
      select 1
      from contact_phone_rank member
      join public."Contact" candidate on candidate.id = member.id
      where member.keeper_id = keeper.id and not candidate."welcome_message_enabled"
    ),
    "include_in_service_reports" = not exists (
      select 1
      from contact_phone_rank member
      join public."Contact" candidate on candidate.id = member.id
      where member.keeper_id = keeper.id and not candidate."include_in_service_reports"
    ),
    "updatedAt" = now()
  where exists (
    select 1
    from contact_phone_rank member
    where member.keeper_id = keeper.id and member.position > 1
  );

  delete from public."Contact" duplicate
  using contact_phone_rank contact_rank
  where contact_rank.position > 1
    and duplicate.id = contact_rank.id;

  update public."Contact" contact
  set phone = canonical.canonical_phone,
      "updatedAt" = now()
  from (
    select distinct keeper_id, canonical_phone
    from contact_phone_rank
  ) canonical
  where contact.id = canonical.keeper_id
    and contact.phone is distinct from canonical.canonical_phone;
end;
$migration$;

comment on column public."Contact".phone is
  'Canonical phone: Brazil uses 55 + DDD + subscriber, restoring the mobile ninth digit when WhatsApp omits it.';
