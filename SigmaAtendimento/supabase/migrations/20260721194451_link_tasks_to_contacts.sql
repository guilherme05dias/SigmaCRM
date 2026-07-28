alter table public."AssistantTask"
add column if not exists contact_id text;

alter table public."AssistantTask"
alter column contact_id type text using contact_id::text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'AssistantTask_contact_id_fkey'
      and conrelid = 'public."AssistantTask"'::regclass
  ) then
    alter table public."AssistantTask"
    add constraint "AssistantTask_contact_id_fkey"
    foreign key (contact_id) references public."Contact"(id) on delete set null;
  end if;
end $$;

create index if not exists "AssistantTask_contact_id_idx"
on public."AssistantTask" (contact_id);
