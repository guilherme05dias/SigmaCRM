-- ServiçoCRM — schema inicial para Supabase/PostgreSQL
-- Mantém compatibilidade com as consultas SQLAlchemy e com o bridge REST do WhatsApp.

create table if not exists public.technicians (
    id serial primary key,
    name text not null,
    specialty text not null default '',
    phone text not null default '',
    email text not null default '',
    active boolean not null default true,
    created_at text not null,
    updated_at text
);

alter table public.technicians
    add column if not exists updated_at text;

create unique index if not exists uq_technicians_name
    on public.technicians (name);

create index if not exists idx_technicians_active_name
    on public.technicians (active, name);

create table if not exists public.clients (
    id serial primary key,
    name text not null,
    company text not null default '',
    phone text not null default '',
    email text not null default '',
    city text not null default '',
    segment text not null default '',
    notes text not null default '',
    status text not null default 'Ativo',
    created_at text not null,
    updated_at text
);

alter table public.clients
    add column if not exists updated_at text;

create index if not exists idx_clients_status_name
    on public.clients (status, name);

create index if not exists idx_clients_name
    on public.clients (name);

create table if not exists public.attendances (
    id serial primary key,
    protocol text not null,
    title text not null,
    description text not null default '',
    technician_id integer not null references public.technicians(id) on update cascade,
    client_id integer not null references public.clients(id) on update cascade,
    status text not null,
    priority text not null,
    channel text not null,
    service_type text not null,
    opened_at text not null,
    due_date text,
    solved_at text,
    time_spent_hours double precision not null default 0,
    equipment text not null default '',
    category text not null default '',
    next_action text not null default '',
    resolution text not null default '',
    customer_rating integer default 0,
    created_at text not null,
    updated_at text not null,
    constraint attendances_customer_rating_range
        check (customer_rating is null or customer_rating between 0 and 5)
);

create unique index if not exists uq_attendances_protocol
    on public.attendances (protocol);

create index if not exists idx_att_opened
    on public.attendances (opened_at desc);

create index if not exists idx_att_status
    on public.attendances (status);

create index if not exists idx_att_technician
    on public.attendances (technician_id);

create index if not exists idx_att_client
    on public.attendances (client_id);

create table if not exists public.users (
    id serial primary key,
    username text not null,
    full_name text not null,
    role text not null,
    password_hash text not null,
    is_active boolean not null default true,
    allowed_pages text,
    can_actions text,
    created_at text not null,
    last_login text
);

create unique index if not exists uq_users_username
    on public.users (username);

create index if not exists idx_users_role_active
    on public.users (role, is_active);

create table if not exists public.whatsapp_conversations (
    id serial primary key,
    contact_name text not null,
    contact_number text not null,
    first_message_at text not null,
    last_message_at text not null,
    message_count integer not null default 0,
    our_message_count integer not null default 0,
    status text not null default 'aberto',
    linked_attendance_id integer references public.attendances(id) on update cascade on delete set null,
    notes text,
    created_at text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    updated_at text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

create unique index if not exists uq_whatsapp_conversations_contact_number
    on public.whatsapp_conversations (contact_number);

create index if not exists idx_waconv_last_message
    on public.whatsapp_conversations (last_message_at desc);

create index if not exists idx_waconv_status
    on public.whatsapp_conversations (status);

create table if not exists public.whatsapp_messages (
    id serial primary key,
    conversation_id integer not null references public.whatsapp_conversations(id) on delete cascade,
    contact_number text not null,
    direction text not null check (direction in ('in', 'out')),
    body text not null,
    timestamp text not null,
    wa_message_id text
);

create unique index if not exists uq_whatsapp_messages_wa_message_id
    on public.whatsapp_messages (wa_message_id)
    where wa_message_id is not null;

create index if not exists idx_wamsg_conv
    on public.whatsapp_messages (conversation_id);

create index if not exists idx_wamsg_ts
    on public.whatsapp_messages (timestamp);
