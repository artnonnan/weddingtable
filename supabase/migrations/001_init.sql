-- Wedding seating: schema, open (no-login) access, realtime, and atomic RPCs.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table settings (
  id              int primary key default 1 check (id = 1),
  bride_side      text not null default 'left' check (bride_side in ('left', 'right')),
  rows_per_lane   int check (rows_per_lane is null or rows_per_lane between 1 and 50), -- null = auto
  reserve_tables  int not null default 0 check (reserve_tables between 0 and 20),
  seats_per_table int not null default 8
);
insert into settings (id) values (1);

create table signs (
  id         int primary key,
  label      text not null,
  color      text not null,
  side       text not null check (side in ('vip', 'bride', 'groom')),
  sort_order int not null
);
insert into signs (id, label, color, side, sort_order) values
  (1, 'VIP',             '#B8860B', 'vip',   1),
  (2, 'ญาติเจ้าสาว',      '#C2185B', 'bride', 2),
  (3, 'แขกเจ้าสาว',       '#E0679A', 'bride', 3),
  (4, 'ที่ทำงานเจ้าสาว',   '#8E5BB5', 'bride', 4),
  (5, 'ญาติเจ้าบ่าว',     '#1F4E8C', 'groom', 5),
  (6, 'แขกเจ้าบ่าว',      '#4A90D9', 'groom', 6),
  (7, 'เพื่อนเจ้าบ่าว',    '#1E9C8A', 'groom', 7);

-- lane = logical column (bride / middle / groom); physical left/right comes from settings.bride_side.
-- Table numbers are derived on the client from (pos, physical column), so they are never stored.
create table tables (
  id         uuid primary key default gen_random_uuid(),
  lane       text not null check (lane in ('bride', 'middle', 'groom')),
  pos        int not null check (pos >= 0),
  sign_id    int references signs (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint tables_lane_pos_key unique (lane, pos) deferrable initially deferred
);

-- One row in the guest sheet = one party (may be several people).
create table parties (
  id           uuid primary key default gen_random_uuid(),
  host         text not null,
  village      text not null default '',
  sign_id      int references signs (id) on delete set null,
  name         text not null default '',
  nickname     text not null default '',
  size         int not null check (size between 1 and 50),
  note         text not null default '',
  source_sheet text,
  source_row   int,
  created_at   timestamptz not null default now()
);

-- One row per seat occupant: a real person (kind=guest, belongs to a party)
-- or a held seat (kind=reserved, no party).
create table guests (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default 'guest' check (kind in ('guest', 'reserved')),
  party_id     uuid references parties (id) on delete cascade,
  member_no    int,
  display_name text,
  status       text not null default 'confirmed' check (status in ('confirmed', 'unsure', 'seated')),
  table_id     uuid references tables (id) on delete set null,
  seat_no      int check (seat_no between 1 and 20),
  created_at   timestamptz not null default now(),
  constraint guests_kind_party check ((kind = 'guest') = (party_id is not null)),
  constraint guests_table_seat_key unique (table_id, seat_no) deferrable initially deferred
);
create index guests_party_idx on guests (party_id);
create index guests_table_idx on guests (table_id);

create table change_log (
  id     bigserial primary key,
  at     timestamptz not null default now(),
  actor  text not null default '',
  action text not null,
  detail text not null default ''
);

create table snapshots (
  id     bigserial primary key,
  at     timestamptz not null default now(),
  reason text not null default '',
  actor  text not null default '',
  data   jsonb not null
);

-- ---------------------------------------------------------------- access (no login: anon may do everything)

do $$
declare t text;
begin
  foreach t in array array['settings', 'signs', 'tables', 'parties', 'guests', 'change_log', 'snapshots'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy open_all on %I for all to anon, authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on %I to anon, authenticated', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to anon, authenticated;

alter publication supabase_realtime add table settings, signs, tables, parties, guests, snapshots;

-- ---------------------------------------------------------------- snapshots

create or replace function snapshot_data() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'settings', (select to_jsonb(s) from settings s where s.id = 1),
    'signs',    coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from signs x), '[]'),
    'tables',   coalesce((select jsonb_agg(to_jsonb(x)) from tables x), '[]'),
    'parties',  coalesce((select jsonb_agg(to_jsonb(x)) from parties x), '[]'),
    'guests',   coalesce((select jsonb_agg(to_jsonb(x)) from guests x), '[]')
  );
$$;

create or replace function create_snapshot(p_reason text, p_actor text default '') returns bigint
language plpgsql as $$
declare v_id bigint;
begin
  insert into snapshots (reason, actor, data) values (p_reason, coalesce(p_actor, ''), snapshot_data())
  returning id into v_id;
  -- keep the newest 300
  delete from snapshots where id in (select id from snapshots order by id desc offset 300);
  return v_id;
end $$;

create or replace function restore_snapshot(p_id bigint, p_actor text default '') returns void
language plpgsql as $$
declare d jsonb;
begin
  select data into d from snapshots where id = p_id;
  if d is null then raise exception 'ไม่พบ snapshot #%', p_id; end if;

  perform create_snapshot('ก่อนกู้คืน #' || p_id, p_actor);

  delete from guests where id is not null;
  delete from tables where id is not null;
  delete from parties where id is not null;

  insert into signs select * from jsonb_populate_recordset(null::signs, d -> 'signs')
  on conflict (id) do update set label = excluded.label, color = excluded.color,
    side = excluded.side, sort_order = excluded.sort_order;

  update settings s set bride_side = x.bride_side, rows_per_lane = x.rows_per_lane,
    reserve_tables = x.reserve_tables, seats_per_table = x.seats_per_table
  from jsonb_populate_record(null::settings, d -> 'settings') x where s.id = 1;

  insert into parties select * from jsonb_populate_recordset(null::parties, d -> 'parties');
  insert into tables  select * from jsonb_populate_recordset(null::tables,  d -> 'tables');
  insert into guests  select * from jsonb_populate_recordset(null::guests,  d -> 'guests');

  insert into change_log (actor, action, detail) values (coalesce(p_actor, ''), 'กู้คืน', 'snapshot #' || p_id);
end $$;

-- ---------------------------------------------------------------- seating RPCs

-- Seat the given guests at p_table (null = take them off their table).
-- Reserved seats at the target are released when needed; fails if real guests would exceed capacity.
create or replace function move_guests(p_guest_ids uuid[], p_table uuid) returns void
language plpgsql as $$
declare
  v_cap int;
  v_occupied int;
  v_reserved int;
  v_need int := coalesce(array_length(p_guest_ids, 1), 0);
begin
  if v_need = 0 then return; end if;
  if p_table is null then
    update guests set table_id = null, seat_no = null where id = any (p_guest_ids);
    return;
  end if;

  perform 1 from tables where id = p_table for update;
  if not found then raise exception 'ไม่พบโต๊ะนี้'; end if;
  select seats_per_table into v_cap from settings where id = 1;

  update guests set table_id = null, seat_no = null where id = any (p_guest_ids) and table_id = p_table;

  select count(*) filter (where kind = 'guest'), count(*) filter (where kind = 'reserved')
    into v_occupied, v_reserved from guests where table_id = p_table;

  if v_occupied + v_need > v_cap then
    raise exception 'โต๊ะนี้ว่างแค่ % ที่ (ต้องการ % ที่)', v_cap - v_occupied, v_need;
  end if;

  if v_occupied + v_reserved + v_need > v_cap then
    delete from guests where id in (
      select id from guests where table_id = p_table and kind = 'reserved'
      order by seat_no desc limit (v_occupied + v_reserved + v_need - v_cap));
  end if;

  with free as (
    select s as seat_no, row_number() over (order by s) as rn
    from generate_series(1, v_cap) s
    where s not in (select g.seat_no from guests g where g.table_id = p_table and g.seat_no is not null)
  ), mv as (
    select t.gid, row_number() over (order by t.ord) as rn
    from unnest(p_guest_ids) with ordinality as t (gid, ord)
  )
  update guests set table_id = p_table, seat_no = free.seat_no
  from mv join free using (rn)
  where guests.id = mv.gid;
end $$;

-- Change how many people a party has: adds or removes members (highest member_no first).
create or replace function set_party_size(p_party uuid, p_size int) returns void
language plpgsql as $$
declare v_max int;
begin
  if p_size < 1 then raise exception 'จำนวนคนต้องอย่างน้อย 1'; end if;
  update parties set size = p_size where id = p_party;
  select coalesce(max(member_no), 0) into v_max from guests where party_id = p_party;
  if p_size > v_max then
    insert into guests (kind, party_id, member_no, status)
    select 'guest', p_party, n,
      coalesce((select status from guests where party_id = p_party order by member_no limit 1), 'confirmed')
    from generate_series(v_max + 1, p_size) n;
  else
    delete from guests where party_id = p_party and member_no > p_size;
  end if;
end $$;

create or replace function delete_table(p_table uuid) returns void
language plpgsql as $$
begin
  update guests set table_id = null, seat_no = null where table_id = p_table and kind = 'guest';
  delete from guests where table_id = p_table and kind = 'reserved';
  delete from tables where id = p_table;
end $$;

-- Replace the whole layout in one transaction (used by auto-assign). Snapshots first.
-- p_tables: [{id, lane, pos, sign_id}]
-- p_seats:  [{kind:'guest', guest_id, table_id, seat_no} | {kind:'reserved', table_id, seat_no, label}]
create or replace function apply_layout(p_tables jsonb, p_seats jsonb, p_actor text default '') returns void
language plpgsql as $$
begin
  perform create_snapshot('ก่อนจัดอัตโนมัติ', p_actor);

  delete from guests where kind = 'reserved';
  update guests set table_id = null, seat_no = null where table_id is not null;
  delete from tables where id is not null;

  insert into tables (id, lane, pos, sign_id)
  select (x ->> 'id')::uuid, x ->> 'lane', (x ->> 'pos')::int, nullif(x ->> 'sign_id', '')::int
  from jsonb_array_elements(p_tables) x;

  update guests g set table_id = (x ->> 'table_id')::uuid, seat_no = (x ->> 'seat_no')::int
  from jsonb_array_elements(p_seats) x
  where x ->> 'kind' = 'guest' and g.id = (x ->> 'guest_id')::uuid;

  insert into guests (kind, display_name, table_id, seat_no)
  select 'reserved', coalesce(nullif(x ->> 'label', ''), 'จองไว้'), (x ->> 'table_id')::uuid, (x ->> 'seat_no')::int
  from jsonb_array_elements(p_seats) x
  where x ->> 'kind' = 'reserved';

  insert into change_log (actor, action, detail)
  values (coalesce(p_actor, ''), 'จัดอัตโนมัติ', jsonb_array_length(p_tables) || ' โต๊ะ');
end $$;

grant execute on function snapshot_data(), create_snapshot(text, text), restore_snapshot(bigint, text),
  move_guests(uuid[], uuid), set_party_size(uuid, int), delete_table(uuid), apply_layout(jsonb, jsonb, text)
  to anon, authenticated;
