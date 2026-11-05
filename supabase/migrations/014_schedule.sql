-- Ceremony schedule: an ordered list of sections, steps and breaks. Only durations are stored;
-- each start time is settings.schedule_start plus the minutes of everything before it,
-- so changing one item moves everything after it.
alter table settings add column schedule_start int not null default 520 check (schedule_start between 0 and 1439); -- 8:40

create table schedule_items (
  id           uuid primary key default gen_random_uuid(),
  sort_order   int not null,
  kind         text not null default 'step' check (kind in ('section', 'step', 'break')),
  title        text not null default '',
  detail       text not null default '',
  minutes      int not null default 0 check (minutes between 0 and 600),
  -- the time this item should start (a ฤกษ์ or the time printed on the card); a warning shows when it drifts
  target       int check (target is null or target between 0 and 1439),
  -- people taking part, in order: [{ "guest_id": uuid } | { "name": text }]
  has_people   boolean not null default false,
  people_count int check (people_count is null or people_count between 0 and 500),
  people       jsonb not null default '[]',
  created_at   timestamptz not null default now()
);
create index schedule_items_order_idx on schedule_items (sort_order);

alter table schedule_items enable row level security;
create policy read_all on schedule_items for select to anon, authenticated using (true);
create policy editors_insert on schedule_items for insert to anon, authenticated with check (public.is_editor());
create policy editors_update on schedule_items for update to anon, authenticated using (public.is_editor()) with check (public.is_editor());
create policy editors_delete on schedule_items for delete to anon, authenticated using (public.is_editor());
grant select, insert, update, delete on schedule_items to anon, authenticated;

alter publication supabase_realtime add table schedule_items;

-- Insert at position p_at; that item and those after it move down one.
create or replace function add_schedule_item(p_at int, p_kind text, p_title text, p_detail text, p_minutes int,
  p_target int, p_has_people boolean, p_people_count int, p_people jsonb) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  update schedule_items set sort_order = sort_order + 1 where sort_order >= p_at;
  insert into schedule_items (sort_order, kind, title, detail, minutes, target, has_people, people_count, people)
  values (p_at, p_kind, p_title, p_detail, p_minutes, p_target, p_has_people, p_people_count, coalesce(p_people, '[]'))
  returning id into v_id;
  return v_id;
end $$;

-- Swap with the neighbour above (-1) or below (1).
create or replace function move_schedule_item(p_id uuid, p_delta int) returns void
language plpgsql as $$
declare v_sort int; v_other uuid; v_other_sort int;
begin
  select sort_order into v_sort from schedule_items where id = p_id;
  if v_sort is null then raise exception 'ไม่พบรายการนี้'; end if;
  if p_delta < 0 then
    select id, sort_order into v_other, v_other_sort from schedule_items where sort_order < v_sort order by sort_order desc limit 1;
  else
    select id, sort_order into v_other, v_other_sort from schedule_items where sort_order > v_sort order by sort_order limit 1;
  end if;
  if v_other is null then return; end if;
  update schedule_items set sort_order = v_other_sort where id = p_id;
  update schedule_items set sort_order = v_sort where id = v_other;
end $$;

grant execute on function add_schedule_item(int, text, text, text, int, int, boolean, int, jsonb), move_schedule_item(uuid, int) to anon, authenticated;

-- ---------------------------------------------------------------- the plan agreed on 5 Nov

insert into schedule_items (sort_order, kind, title, detail, minutes, target, has_people, people_count) values
  (1,  'section', 'พิธีแห่ขันหมาก', '', 0, null, false, null),
  (2,  'step', 'เตรียมตั้งขบวนขันหมาก', 'เจ้าบ่าว พ่อแม่ ญาติผู้ใหญ่ และเพื่อน', 20, null, false, null),
  (3,  'step', 'เริ่มแห่ขบวนขันหมาก', 'สินสอด ทองหมั้น ของมงคล ต้นอ้อย ต้นกล้วย', 10, 540, false, null),
  (4,  'step', 'กั้นประตูเงินประตูทอง', 'เพื่อนเจ้าสาว ญาติเจ้าสาว และญาติผู้ใหญ่ตั้งขบวนต้อนรับ พ่อแม่และเจ้าสาวรออยู่หลังประตูสุดท้าย', 10, null, false, null),
  (5,  'step', 'ประตูสุดท้าย แลกบายศรี', 'เจ้าบ่าวพูดอะไรกับพ่อแม่เจ้าสาวก่อนผ่านประตู บ่าวสาวเจอกัน แลกบายศรี แล้วเดินนำขบวนเข้าสู่พิธี', 10, null, false, null),

  (6,  'section', 'พิธีหมั้น / สวมแหวน', '', 0, 570, false, null),
  (7,  'step', 'จัดที่นั่งหน้าพิธี', 'พ่อแม่หรือญาติผู้ใหญ่ทั้ง 2 ฝ่ายนั่งเก้าอี้ บ่าวสาวนั่งพื้นด้านหน้า', 5, null, false, null),
  (8,  'step', 'มอบสินสอดทองหมั้น', 'พ่อแม่เจ้าบ่าวมอบให้พ่อแม่เจ้าสาว (เจ้าบ่าวยกพานเงินให้คุณพ่อ พานทองให้คุณแม่)', 10, null, false, null),
  (9,  'step', 'มอบพานเงินพานทอง', 'ผู้ใหญ่ทั้ง 4 ท่านยืน แม่เจ้าบ่าวมอบพานทองให้แม่เจ้าสาว แล้วพ่อเจ้าบ่าวมอบพานเงินให้พ่อเจ้าสาว จากนั้นกลับนั่งที่เดิม', 5, null, false, null),
  (10, 'step', 'โปรยสินสอด', 'พ่อแม่ทั้ง 4 ท่าน (ข้าวตอก ดอกไม้ เมล็ดพืชพันธุ์ ธัญญาหาร)', 5, null, false, null),
  (11, 'step', 'ห่อสินสอด', 'แม่เจ้าสาวห่อแล้วแบกขึ้นไหล่ (ถ่ายภาพ)', 5, null, false, null),
  (12, 'step', 'กราบขอขมาพ่อแม่', 'เริ่มจากพ่อแม่เจ้าสาว ตามด้วยพ่อแม่เจ้าบ่าว', 10, null, false, null),
  (13, 'step', 'สวมแหวน', 'เจ้าบ่าวสวมให้เจ้าสาว เจ้าสาวกราบตักเจ้าบ่าว จากนั้นเจ้าสาวสวมให้เจ้าบ่าว (ถ่ายภาพ)', 10, null, false, null),
  (14, 'break', 'พัก ปรับสถานที่', 'ถ่ายภาพบรรยากาศ แขกพักผ่อน ปรับสถานที่สำหรับพิธีผูกข้อมือ', 10, null, false, null),

  (15, 'section', 'พิธีผูกข้อมือ / รดน้ำสังข์', '', 0, 630, false, null),
  (16, 'step', 'บ่าวสาวนั่งประจำที่', 'เก้าอี้และโต๊ะทำพิธี', 5, null, false, null),
  (17, 'step', 'สวมมาลัยมงคล', 'เชิญญาติผู้ใหญ่', 5, null, true, null),
  (18, 'step', 'สวมด้ายมงคลแฝด', 'เชิญพ่อแม่เจ้าสาวหรือญาติผู้ใหญ่', 5, null, true, null),
  (19, 'step', 'ผูกข้อมือตามรายชื่อ', 'ตามลำดับรายชื่อที่จัดไว้', 20, null, true, 18),
  (20, 'step', 'แขกที่ต้องการผูกข้อมือ', E'พิธีกรเรียกทีละกลุ่ม เช่น แขกฝั่งเจ้าสาว แล้วตามด้วยแขกฝั่งเจ้าบ่าว ช่วงนี้ต้องจบตรงเวลา\nเปิดช่วง: บอกแขกว่ามีประมาณ 15 นาที ใครผูกไม่ทัน เชิญผูกตอนบ่าวสาวเดินทักทายตามโต๊ะ\nก่อนจบ 5 นาที: พิธีกรเตือนรอบสุดท้าย ทีมงานท้ายแถวบอกคนที่เพิ่งมาต่อแถวให้ไปผูกตอนงานเลี้ยงแทน\nถึงฤกษ์: ให้คนสุดท้ายผูกจนเสร็จ แล้วเชิญพ่อแม่ขึ้นมาถอดด้ายมงคลแฝดเลย', 15, null, false, null),
  (21, 'step', 'ส่งตัวเข้าห้องหอ', 'พ่อแม่ทั้งสองฝ่ายถอดด้ายมงคลแฝด จูงมือบ่าวสาวเข้าห้องหอ พี่น้องหรือเพื่อนถือบายศรี 2 อันเดินตาม', 10, 680, false, null),

  (22, 'section', 'งานเลี้ยงฉลองมงคลสมรส', '', 0, 690, false, null),
  (23, 'break', 'ช่วงเปลี่ยนผ่าน', 'วงดนตรีขึ้นเล่น โต๊ะจีนทยอยนำอาหารมาวาง แขกเข้าประจำโต๊ะ ส่วนบ่าวสาวพักหลังพิธีส่งตัว เติมหน้า และเตรียมตัว', 20, null, false, null),
  (24, 'step', 'ต้อนรับแขกหน้างาน', 'บ่าวสาวถ่ายภาพกับแขกหน้า Backdrop (วงดนตรีเล่นต่อ)', 20, null, false, null),
  (25, 'step', 'พิธีกรกล่าวทักทาย', 'บ่าวสาว stand by พร้อมเปิดตัว ถ้ามีเพื่อนตั้งขบวนต้อนรับ ให้เตรียมพร้อม', 5, null, false, null),
  (26, 'step', 'Presentation เรื่องราวความรัก', '(ถ้ามี)', 5, null, false, null),
  (27, 'step', 'เปิดตัวบ่าวสาวขึ้นเวที', 'พร้อมเพลง เพื่อนเจ้าสาวตั้งขบวนต้อนรับและโปรยกลีบดอกไม้ (ถ้ามี)', 5, null, false, null),
  (28, 'step', 'บ่าวสาวอยู่บนเวทีเรียบร้อย', '', 2, null, false, null),
  (29, 'step', 'เชิญพ่อแม่ทั้งสองฝ่ายขึ้นเวที', '', 3, null, false, null),
  (30, 'step', 'ประธานในพิธีกล่าวอวยพร', 'สวมมาลัยมงคลและกล่าวอวยพร ดื่มอวยพร (ถ้ามี)', 10, null, false, null),
  (31, 'step', 'แขกผู้ใหญ่กล่าวอวยพร', 'เพิ่มเติม (ถ้ามี)', 10, null, false, null),
  (32, 'step', 'ตัวแทนพ่อแม่กล่าวอวยพรและขอบคุณแขก', 'เริ่มจากฝ่ายเจ้าบ่าว แล้วเชิญลงพักผ่อน', 10, null, false, null),
  (33, 'step', 'โยนช่อดอกไม้', 'ให้เพื่อน (เพลงประกอบ)', 10, null, false, null),
  (34, 'step', 'สัมภาษณ์ผู้ได้รับดอกไม้', 'และอวยพรในนามตัวแทนเพื่อน', 5, null, false, null),
  (35, 'step', 'บ่าวสาวกล่าวขอบคุณ', 'อย่างเป็นทางการ', 5, null, false, null),
  (36, 'step', 'บ่าวสาวทักทายแขกตามโต๊ะ', 'ลงเวทีไปทักทาย ถ่ายภาพ และขอบคุณแขกตามโต๊ะ ทีมงานพกด้ายผูกข้อมือสำรองไว้ให้แขกที่ผูกไม่ทัน', 25, null, false, null),
  (37, 'step', 'ปิดช่วงพิธีการ', 'พิธีกรกล่าวขอบคุณ แล้วส่งต่อให้วงดนตรี', 0, null, false, null);

-- ---------------------------------------------------------------- snapshots include the schedule

create or replace function snapshot_data() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'settings', (select to_jsonb(s) from settings s where s.id = 1),
    'signs',    coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from signs x), '[]'),
    'tables',   coalesce((select jsonb_agg(to_jsonb(x)) from tables x), '[]'),
    'parties',  coalesce((select jsonb_agg(to_jsonb(x)) from parties x), '[]'),
    'guests',   coalesce((select jsonb_agg(to_jsonb(x)) from guests x), '[]'),
    'cars',     coalesce((select jsonb_agg(to_jsonb(x)) from cars x), '[]'),
    'schedule', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order) from schedule_items x), '[]')
  );
$$;

-- Snapshots taken before the schedule existed leave it as it is.
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
    reserve_tables = x.reserve_tables, seats_per_table = x.seats_per_table,
    schedule_start = coalesce((d -> 'settings' ->> 'schedule_start')::int, s.schedule_start)
  from jsonb_populate_record(null::settings, d -> 'settings') x where s.id = 1;

  insert into parties select * from jsonb_populate_recordset(null::parties, d -> 'parties');
  insert into tables  select * from jsonb_populate_recordset(null::tables,  d -> 'tables');
  insert into cars (id, kind, driver_name, seats, created_at)
    select id, kind, driver_name, seats, created_at
    from jsonb_populate_recordset(null::cars, coalesce(d -> 'cars', '[]'));
  insert into guests  select * from jsonb_populate_recordset(null::guests,  d -> 'guests');
  update cars c set driver_guest_id = x.driver_guest_id
    from jsonb_populate_recordset(null::cars, coalesce(d -> 'cars', '[]')) x where c.id = x.id;

  if d ? 'schedule' then
    delete from schedule_items where id is not null;
    insert into schedule_items select * from jsonb_populate_recordset(null::schedule_items, d -> 'schedule');
  end if;

  insert into change_log (actor, action, detail) values (coalesce(p_actor, ''), 'กู้คืน', 'snapshot #' || p_id);
end $$;
