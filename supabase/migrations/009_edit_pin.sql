-- Edit mode by PIN. Entering the right PIN (checked here, never in the browser) gives the device a random
-- session token; requests carry it in the "x-edit-token" header. Changing the PIN bumps pin_version and
-- invalidates every session. Tables are locked to editors in 010_lock_writes.sql.

create table private.edit_pin (
  id          int primary key default 1 check (id = 1),
  pin_hash    text,
  pin_version int not null default 1
);
insert into private.edit_pin (id) values (1);

create table private.edit_sessions (
  token_hash  text primary key,
  name        text not null,
  pin_version int not null,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

create table private.pin_failures (
  id bigserial primary key,
  ip text not null,
  at timestamptz not null default now()
);

create or replace function private.header(p_name text) returns text
language sql stable as $$
  select nullif(current_setting('request.headers', true), '')::json ->> p_name
$$;

-- Name of the editor whose token came with this request, or null.
create or replace function public.editor_name() returns text
language sql stable security definer set search_path = private, extensions, public as $$
  select s.name
  from private.edit_sessions s
  join private.edit_pin p on p.id = 1
  where s.token_hash = encode(digest(private.header('x-edit-token'), 'sha256'), 'hex')
    and s.pin_version = p.pin_version
$$;

create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = private, extensions, public as $$
  select public.editor_name() is not null
$$;

-- Returns {ok, token, name} or {ok:false, error}. Never raises on a wrong PIN so the failure is recorded.
create or replace function public.login_edit(p_pin text, p_name text) returns jsonb
language plpgsql security definer set search_path = private, extensions, public as $$
declare
  v_ip text := coalesce(nullif(trim(split_part(private.header('x-forwarded-for'), ',', 1)), ''), 'unknown');
  v_name text := left(trim(coalesce(p_name, '')), 40);
  v_hash text;
  v_ver int;
  v_token text;
begin
  if v_name = '' then return jsonb_build_object('ok', false, 'error', 'กรุณาใส่ชื่อ'); end if;
  if (select count(*) from private.pin_failures where ip = v_ip and at > now() - interval '15 minutes') >= 5 then
    return jsonb_build_object('ok', false, 'error', 'กรอกผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่');
  end if;

  select pin_hash, pin_version into v_hash, v_ver from private.edit_pin where id = 1;
  if v_hash is null or crypt(coalesce(p_pin, ''), v_hash) <> v_hash then
    insert into private.pin_failures (ip) values (v_ip);
    return jsonb_build_object('ok', false, 'error', 'PIN ไม่ถูกต้อง');
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  insert into private.edit_sessions (token_hash, name, pin_version)
  values (encode(digest(v_token, 'sha256'), 'hex'), v_name, v_ver);
  delete from private.pin_failures where ip = v_ip;
  insert into public.change_log (actor, action, detail) values (v_name, 'เข้าโหมดแก้ไข', '');
  return jsonb_build_object('ok', true, 'token', v_token, 'name', v_name);
end $$;

-- Validates the header token (and touches last_seen). Returns the editor name or null.
create or replace function public.check_edit_session() returns text
language plpgsql security definer set search_path = private, extensions, public as $$
declare v_name text := public.editor_name();
begin
  if v_name is not null then
    update private.edit_sessions set last_seen = now()
    where token_hash = encode(digest(private.header('x-edit-token'), 'sha256'), 'hex');
  end if;
  return v_name;
end $$;

create or replace function public.logout_edit() returns void
language sql security definer set search_path = private, extensions, public as $$
  delete from private.edit_sessions where token_hash = encode(digest(private.header('x-edit-token'), 'sha256'), 'hex')
$$;

-- The editor's name always wins over whatever the browser sent as "actor".
create or replace function private.set_actor() returns trigger
language plpgsql security definer set search_path = private, extensions, public as $$
begin
  new.actor := coalesce(public.editor_name(), new.actor);
  return new;
end $$;
create trigger change_log_actor before insert on public.change_log for each row execute function private.set_actor();
create trigger snapshots_actor before insert on public.snapshots for each row execute function private.set_actor();

revoke all on function private.header(text), private.set_actor() from public, anon, authenticated;
grant execute on function public.editor_name(), public.is_editor(), public.login_edit(text, text),
  public.check_edit_session(), public.logout_edit() to anon, authenticated;
