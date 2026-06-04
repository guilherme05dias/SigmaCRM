create table if not exists public.attendance_logs (
    id serial primary key,
    attendance_id integer not null references public.attendances(id) on delete cascade,
    action text not null,
    field_name text,
    message text not null,
    actor_name text not null,
    actor_role text not null,
    previous_value text,
    new_value text,
    created_at text not null default to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

create index if not exists idx_attendance_logs_attendance_created
    on public.attendance_logs (attendance_id, created_at desc);

alter table public.attendance_logs enable row level security;

create or replace function public.log_attendance_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    request_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
    actor_name_value text := coalesce(nullif(request_headers->>'x-app-actor', ''), 'Sistema');
    actor_role_value text := coalesce(nullif(request_headers->>'x-app-role', ''), 'sistema');
    old_client_name text := null;
    new_client_name text := null;
    old_technician_name text := null;
    new_technician_name text := null;
begin
    if tg_op in ('INSERT', 'UPDATE') then
        select name into new_client_name from public.clients where id = new.client_id;
        select name into new_technician_name from public.technicians where id = new.technician_id;
    end if;

    if tg_op = 'UPDATE' then
        select name into old_client_name from public.clients where id = old.client_id;
        select name into old_technician_name from public.technicians where id = old.technician_id;
    end if;

    if tg_op = 'INSERT' then
        insert into public.attendance_logs (
            attendance_id,
            action,
            field_name,
            message,
            actor_name,
            actor_role,
            new_value
        ) values (
            new.id,
            'created',
            null,
            'Atendimento criado.',
            actor_name_value,
            actor_role_value,
            new.protocol
        );

        return new;
    end if;

    if coalesce(old.title, '') is distinct from coalesce(new.title, '') then
        insert into public.attendance_logs (attendance_id, action, field_name, message, actor_name, actor_role, previous_value, new_value)
        values (new.id, 'updated', 'title', format('Título alterado de "%s" para "%s".', coalesce(old.title, 'sem título'), coalesce(new.title, 'sem título')), actor_name_value, actor_role_value, old.title, new.title);
    end if;

    if coalesce(old_client_name, '') is distinct from coalesce(new_client_name, '') then
        insert into public.attendance_logs (attendance_id, action, field_name, message, actor_name, actor_role, previous_value, new_value)
        values (new.id, 'updated', 'client_id', format('Cliente alterado de "%s" para "%s".', coalesce(old_client_name, 'não definido'), coalesce(new_client_name, 'não definido')), actor_name_value, actor_role_value, old_client_name, new_client_name);
    end if;

    if coalesce(old_technician_name, '') is distinct from coalesce(new_technician_name, '') then
        insert into public.attendance_logs (attendance_id, action, field_name, message, actor_name, actor_role, previous_value, new_value)
        values (new.id, 'updated', 'technician_id', format('Técnico alterado de "%s" para "%s".', coalesce(old_technician_name, 'não definido'), coalesce(new_technician_name, 'não definido')), actor_name_value, actor_role_value, old_technician_name, new_technician_name);
    end if;

    if coalesce(old.priority, '') is distinct from coalesce(new.priority, '') then
        insert into public.attendance_logs (attendance_id, action, field_name, message, actor_name, actor_role, previous_value, new_value)
        values (new.id, 'updated', 'priority', format('Prioridade alterada de "%s" para "%s".', coalesce(old.priority, 'não definida'), coalesce(new.priority, 'não definida')), actor_name_value, actor_role_value, old.priority, new.priority);
    end if;

    if coalesce(old.status, '') is distinct from coalesce(new.status, '') then
        insert into public.attendance_logs (attendance_id, action, field_name, message, actor_name, actor_role, previous_value, new_value)
        values (new.id, 'updated', 'status', format('Status alterado de "%s" para "%s".', coalesce(old.status, 'não definido'), coalesce(new.status, 'não definido')), actor_name_value, actor_role_value, old.status, new.status);
    end if;

    if coalesce(old.channel, '') is distinct from coalesce(new.channel, '') then
        insert into public.attendance_logs (attendance_id, action, field_name, message, actor_name, actor_role, previous_value, new_value)
        values (new.id, 'updated', 'channel', format('Canal alterado de "%s" para "%s".', coalesce(old.channel, 'não definido'), coalesce(new.channel, 'não definido')), actor_name_value, actor_role_value, old.channel, new.channel);
    end if;

    if coalesce(old.service_type, '') is distinct from coalesce(new.service_type, '') then
        insert into public.attendance_logs (attendance_id, action, field_name, message, actor_name, actor_role, previous_value, new_value)
        values (new.id, 'updated', 'service_type', format('Modelo de atendimento alterado de "%s" para "%s".', coalesce(old.service_type, 'não definido'), coalesce(new.service_type, 'não definido')), actor_name_value, actor_role_value, old.service_type, new.service_type);
    end if;

    if coalesce(old.due_date, '') is distinct from coalesce(new.due_date, '') then
        insert into public.attendance_logs (attendance_id, action, field_name, message, actor_name, actor_role, previous_value, new_value)
        values (new.id, 'updated', 'due_date', format('Prazo alterado de "%s" para "%s".', coalesce(old.due_date, 'sem prazo'), coalesce(new.due_date, 'sem prazo')), actor_name_value, actor_role_value, old.due_date, new.due_date);
    end if;

    if coalesce(old.next_action, '') is distinct from coalesce(new.next_action, '') then
        insert into public.attendance_logs (attendance_id, action, field_name, message, actor_name, actor_role, previous_value, new_value)
        values (
            new.id,
            'updated',
            'next_action',
            case
                when coalesce(old.next_action, '') = '' then format('Próxima ação definida: "%s".', coalesce(new.next_action, ''))
                when coalesce(new.next_action, '') = '' then format('Próxima ação removida. Valor anterior: "%s".', coalesce(old.next_action, ''))
                else format('Próxima ação alterada de "%s" para "%s".', coalesce(old.next_action, ''), coalesce(new.next_action, ''))
            end,
            actor_name_value,
            actor_role_value,
            old.next_action,
            new.next_action
        );
    end if;

    if coalesce(old.resolution, '') is distinct from coalesce(new.resolution, '') then
        insert into public.attendance_logs (attendance_id, action, field_name, message, actor_name, actor_role, previous_value, new_value)
        values (
            new.id,
            'updated',
            'resolution',
            case
                when coalesce(old.resolution, '') = '' then 'Resolução adicionada.'
                when coalesce(new.resolution, '') = '' then 'Resolução removida.'
                else 'Resolução atualizada.'
            end,
            actor_name_value,
            actor_role_value,
            old.resolution,
            new.resolution
        );
    end if;

    if coalesce(old.time_spent_hours, 0) is distinct from coalesce(new.time_spent_hours, 0) then
        insert into public.attendance_logs (attendance_id, action, field_name, message, actor_name, actor_role, previous_value, new_value)
        values (
            new.id,
            'updated',
            'time_spent_hours',
            format('Horas registradas alteradas de %s para %s.', coalesce(old.time_spent_hours, 0), coalesce(new.time_spent_hours, 0)),
            actor_name_value,
            actor_role_value,
            coalesce(old.time_spent_hours, 0)::text,
            coalesce(new.time_spent_hours, 0)::text
        );
    end if;

    return new;
end;
$$;

drop trigger if exists trg_attendance_logs on public.attendances;

create trigger trg_attendance_logs
after insert or update on public.attendances
for each row
execute function public.log_attendance_changes();

create policy "Public read attendance logs"
on public.attendance_logs
for select
to anon, authenticated
using (true);
