alter table public."User"
  add column if not exists can_view_all_conversations boolean not null default false;

update public."User"
set can_view_all_conversations = true
where lower(email) = 'carlos@sigmapdv.com';

comment on column public."User".can_view_all_conversations is
  'Allows read-only access to every conversation in the user company without granting manager roles.';
