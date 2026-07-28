alter table public."AssistantTask"
add column if not exists service_topic_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'AssistantTask_service_topic_id_fkey'
      and conrelid = 'public."AssistantTask"'::regclass
  ) then
    alter table public."AssistantTask"
    add constraint "AssistantTask_service_topic_id_fkey"
    foreign key (service_topic_id) references public."ServiceTopic"(id) on delete set null;
  end if;
end $$;

create index if not exists "AssistantTask_service_topic_id_idx"
on public."AssistantTask" (service_topic_id);
