select
  count(*)::integer as duplicate_contact_groups,
  coalesce(sum(active_count - 1), 0)::integer as duplicate_conversation_rows,
  (to_regclass('public."Conversation_one_active_per_contact_key"') is not null) as protection_index_active
from (
  select count(*) as active_count
  from public."Conversation"
  where "companyId" is not null
    and status in ('OPEN', 'ASSIGNED')
  group by "companyId", "contactId"
  having count(*) > 1
) duplicate_groups;
