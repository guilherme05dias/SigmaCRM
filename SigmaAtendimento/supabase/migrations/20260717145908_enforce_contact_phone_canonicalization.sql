create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.canonical_brazil_phone(value text)
returns text
language sql
immutable
strict
security invoker
set search_path = ''
as $function$
  select case
    when length(regexp_replace(value, '\D', '', 'g')) = 13
      and regexp_replace(value, '\D', '', 'g') like '55%'
      then regexp_replace(value, '\D', '', 'g')
    when length(regexp_replace(value, '\D', '', 'g')) = 12
      and regexp_replace(value, '\D', '', 'g') like '55%'
      and substring(regexp_replace(value, '\D', '', 'g') from 5 for 1) in ('6', '7', '8', '9')
      then substring(regexp_replace(value, '\D', '', 'g') from 1 for 4)
        || '9'
        || substring(regexp_replace(value, '\D', '', 'g') from 5)
    when length(regexp_replace(value, '\D', '', 'g')) = 12
      and regexp_replace(value, '\D', '', 'g') like '55%'
      then regexp_replace(value, '\D', '', 'g')
    when length(regexp_replace(value, '\D', '', 'g')) = 11
      then '55' || regexp_replace(value, '\D', '', 'g')
    when length(regexp_replace(value, '\D', '', 'g')) = 10
      and substring(regexp_replace(value, '\D', '', 'g') from 3 for 1) in ('6', '7', '8', '9')
      then '55'
        || substring(regexp_replace(value, '\D', '', 'g') from 1 for 2)
        || '9'
        || substring(regexp_replace(value, '\D', '', 'g') from 3)
    when length(regexp_replace(value, '\D', '', 'g')) = 10
      then '55' || regexp_replace(value, '\D', '', 'g')
    else regexp_replace(value, '\D', '', 'g')
  end;
$function$;

create or replace function private.normalize_contact_phone_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.phone := private.canonical_brazil_phone(new.phone);
  return new;
end;
$function$;

revoke all on function private.canonical_brazil_phone(text) from public, anon, authenticated;
revoke all on function private.normalize_contact_phone_before_write() from public, anon, authenticated;

drop trigger if exists normalize_contact_phone_before_write on public."Contact";
create trigger normalize_contact_phone_before_write
before insert or update of phone on public."Contact"
for each row
execute function private.normalize_contact_phone_before_write();

update public."Contact"
set phone = private.canonical_brazil_phone(phone)
where phone is distinct from private.canonical_brazil_phone(phone);

comment on function private.canonical_brazil_phone(text) is
  'Canonicalizes Brazilian phones and restores the mobile ninth digit omitted by legacy WhatsApp identifiers.';
