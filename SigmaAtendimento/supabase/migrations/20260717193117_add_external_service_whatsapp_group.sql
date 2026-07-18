alter table "Settings"
  add column if not exists "external_service_group_id" text,
  add column if not exists "external_service_group_name" text;
