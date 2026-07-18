select
  contact.id as contact_id,
  contact.phone,
  conversation.id as conversation_id,
  conversation.status,
  conversation."createdAt",
  conversation."lastMessageAt",
  count(message.id)::integer as message_count
from public."Contact" contact
join public."Conversation" conversation on conversation."contactId" = contact.id
left join public."Message" message on message."conversationId" = conversation.id
where lower(coalesce(contact.name, '')) like 'quantum galthom%'
group by contact.id, contact.phone, conversation.id, conversation.status, conversation."createdAt", conversation."lastMessageAt"
order by conversation."lastMessageAt" desc nulls last, conversation."createdAt" desc;
