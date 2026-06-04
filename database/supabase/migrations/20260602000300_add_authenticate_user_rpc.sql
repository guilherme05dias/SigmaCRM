create extension if not exists pgcrypto with schema extensions;

create or replace function public.xor_bytea(left_value bytea, right_value bytea)
returns bytea
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
    result bytea := left_value;
    position integer;
begin
    if length(left_value) <> length(right_value) then
        raise exception 'bytea values must have the same length';
    end if;

    for position in 0..length(left_value) - 1 loop
        result := set_byte(result, position, get_byte(left_value, position) # get_byte(right_value, position));
    end loop;

    return result;
end;
$$;

create or replace function public.pbkdf2_sha256_hex(password text, salt_hex text, iterations integer)
returns text
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
    password_bytes bytea := convert_to(password, 'UTF8');
    salt_bytes bytea := decode(salt_hex, 'hex');
    block_index bytea := decode('00000001', 'hex');
    current_block bytea;
    derived_block bytea;
    counter integer;
begin
    current_block := extensions.hmac(salt_bytes || block_index, password_bytes, 'sha256');
    derived_block := current_block;

    for counter in 2..iterations loop
        current_block := extensions.hmac(current_block, password_bytes, 'sha256');
        derived_block := public.xor_bytea(derived_block, current_block);
    end loop;

    return encode(derived_block, 'hex');
end;
$$;

create or replace function public.authenticate_user(login_username text, login_password text)
returns table (
    id integer,
    username text,
    full_name text,
    role text,
    is_active boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    user_row public.users%rowtype;
    hash_parts text[];
    expected_hash text;
begin
    select *
    into user_row
    from public.users
    where users.username = lower(trim(login_username))
    limit 1;

    if not found or not user_row.is_active then
        return;
    end if;

    hash_parts := string_to_array(user_row.password_hash, '$');

    if array_length(hash_parts, 1) <> 4 or hash_parts[1] <> 'pbkdf2_sha256' then
        return;
    end if;

    expected_hash := public.pbkdf2_sha256_hex(login_password, hash_parts[3], hash_parts[2]::integer);

    if expected_hash <> hash_parts[4] then
        return;
    end if;

    update public.users
    set last_login = to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    where users.id = user_row.id;

    id := user_row.id;
    username := user_row.username;
    full_name := user_row.full_name;
    role := user_row.role;
    is_active := user_row.is_active;
    return next;
end;
$$;

revoke all on function public.xor_bytea(bytea, bytea) from public;
revoke all on function public.pbkdf2_sha256_hex(text, text, integer) from public;
revoke all on function public.authenticate_user(text, text) from public;

grant execute on function public.authenticate_user(text, text) to anon, authenticated;
