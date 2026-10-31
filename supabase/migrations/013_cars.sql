-- Rides for the groom's side: who travels in whose car. A guest with no car_id comes on their own.
-- The driver is either a guest (driver_guest_id, also has car_id set) or a typed name (the groom, a hired van driver).
create table cars (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null default 'car' check (kind in ('car', 'van')),
  driver_guest_id uuid references guests (id) on delete set null,
  driver_name     text not null default '',
  seats           int not null check (seats between 1 and 60),
  created_at      timestamptz not null default now()
);

alter table guests add column car_id uuid references cars (id) on delete set null;
create index guests_car_idx on guests (car_id);

alter table cars enable row level security;
create policy read_all on cars for select to anon, authenticated using (true);
create policy editors_insert on cars for insert to anon, authenticated with check (public.is_editor());
create policy editors_update on cars for update to anon, authenticated using (public.is_editor()) with check (public.is_editor());
create policy editors_delete on cars for delete to anon, authenticated using (public.is_editor());
grant select, insert, update, delete on cars to anon, authenticated;

alter publication supabase_realtime add table cars;

-- Put guests in a car (null = they come on their own). A driver who leaves their car leaves it without a driver.
create or replace function set_guests_car(p_guest_ids uuid[], p_car uuid) returns void
language plpgsql as $$
begin
  update cars set driver_guest_id = null where driver_guest_id = any (p_guest_ids) and id is distinct from p_car;
  update guests set car_id = p_car where id = any (p_guest_ids) and kind = 'guest';
end $$;

-- Create (p_id null) or edit a car. A previous guest driver stays in the car as a passenger.
create or replace function save_car(p_id uuid, p_kind text, p_driver_guest uuid, p_driver_name text, p_seats int) returns uuid
language plpgsql as $$
declare v_id uuid := p_id;
begin
  if p_kind = 'van' and p_driver_guest is not null then raise exception 'คนขับรถตู้ไม่ใช่แขก'; end if;
  if v_id is null then
    insert into cars (kind, seats) values (p_kind, p_seats) returning id into v_id;
  else
    update cars set kind = p_kind, seats = p_seats where id = v_id;
    if not found then raise exception 'ไม่พบรถคันนี้'; end if;
  end if;
  update cars set driver_guest_id = p_driver_guest,
    driver_name = case when p_driver_guest is null then coalesce(trim(p_driver_name), '') else '' end
  where id = v_id;
  if p_driver_guest is not null then
    perform set_guests_car(array[p_driver_guest], v_id);
  end if;
  return v_id;
end $$;

grant execute on function set_guests_car(uuid[], uuid), save_car(uuid, text, uuid, text, int) to anon, authenticated;

-- ---------------------------------------------------------------- snapshots include cars

create or replace function snapshot_data() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'settings', (select to_jsonb(s) from settings s where s.id = 1),
    'signs',    coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from signs x), '[]'),
    'tables',   coalesce((select jsonb_agg(to_jsonb(x)) from tables x), '[]'),
    'parties',  coalesce((select jsonb_agg(to_jsonb(x)) from parties x), '[]'),
    'guests',   coalesce((select jsonb_agg(to_jsonb(x)) from guests x), '[]'),
    'cars',     coalesce((select jsonb_agg(to_jsonb(x)) from cars x), '[]')
  );
$$;

-- cars and guests point at each other: cars go in without a driver, then guests, then the drivers.
create or replace function restore_snapshot(p_id bigint, p_actor text default '') returns void
language plpgsql as $$
declare d jsonb;
begin
  select data into d from snapshots where id = p_id;
  if d is null then raise exception 'ไม่พบ snapshot #%', p_id; end if;

  perform create_snapshot('ก่อนกู้คืน #' || p_id, p_actor);

  delete from guests where id is not null;
  delete from cars where id is not null;
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
  insert into cars (id, kind, driver_name, seats, created_at)
    select id, kind, driver_name, seats, created_at
    from jsonb_populate_recordset(null::cars, coalesce(d -> 'cars', '[]'));
  insert into guests  select * from jsonb_populate_recordset(null::guests,  d -> 'guests');
  update cars c set driver_guest_id = x.driver_guest_id
    from jsonb_populate_recordset(null::cars, coalesce(d -> 'cars', '[]')) x where c.id = x.id;

  insert into change_log (actor, action, detail) values (coalesce(p_actor, ''), 'กู้คืน', 'snapshot #' || p_id);
end $$;
