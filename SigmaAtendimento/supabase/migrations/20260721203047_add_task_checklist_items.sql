create table if not exists public."AssistantTaskChecklistItem" (
  id text primary key default gen_random_uuid()::text,
  company_id text not null references public."Company"(id) on delete cascade,
  task_id text not null references public."AssistantTask"(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 240),
  position integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists "AssistantTaskChecklistItem_companyId_createdAt_idx"
  on public."AssistantTaskChecklistItem"(company_id, created_at);

create index if not exists "AssistantTaskChecklistItem_taskId_position_idx"
  on public."AssistantTaskChecklistItem"(task_id, position);

alter table public."AssistantTaskChecklistItem" enable row level security;

drop policy if exists tenant_isolation_assistant_task_checklist on public."AssistantTaskChecklistItem";
create policy tenant_isolation_assistant_task_checklist
  on public."AssistantTaskChecklistItem"
  for all
  using (company_id = (select current_setting('app.current_company_id', true)))
  with check (company_id = (select current_setting('app.current_company_id', true)));
