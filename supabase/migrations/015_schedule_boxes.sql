-- A step can count its list in gift boxes (ของรับไหว้) instead of people: each entry is one box,
-- and an entry can be a couple ({ "guest_ids": [..] }). Entries marked { "special": true }
-- (the parents) get a box of their own that does not count.
alter table schedule_items add column count_unit text not null default 'person' check (count_unit in ('person', 'box'));

drop function add_schedule_item(int, text, text, text, int, int, boolean, int, jsonb);
create or replace function add_schedule_item(p_at int, p_kind text, p_title text, p_detail text, p_minutes int,
  p_target int, p_has_people boolean, p_people_count int, p_people jsonb, p_count_unit text default 'person') returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  update schedule_items set sort_order = sort_order + 1 where sort_order >= p_at;
  insert into schedule_items (sort_order, kind, title, detail, minutes, target, has_people, people_count, people, count_unit)
  values (p_at, p_kind, p_title, p_detail, p_minutes, p_target, p_has_people, p_people_count, coalesce(p_people, '[]'), p_count_unit)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function add_schedule_item(int, text, text, text, int, int, boolean, int, jsonb, text) to anon, authenticated;

-- 26 boxes for the guests called up to tie wrists; the parents' boxes are extra
update schedule_items
set count_unit = 'box', people_count = 26,
    detail = 'ตามลำดับรายชื่อที่จัดไว้ แขกที่ขึ้นผูก 1 คู่หรือ 1 คน ได้ของรับไหว้ 1 กล่อง (พ่อแม่ได้กล่องพิเศษ ไม่นับรวม)'
where title = 'ผูกข้อมือตามรายชื่อ';

-- The list was filled one person per row: rows next to each other from the same party become one entry (one box).
do $$
declare
  v_id uuid; v_people jsonb; v_out jsonb := '[]'; e jsonb; v_party uuid; v_prev uuid; v_last jsonb;
begin
  select id, people into v_id, v_people from schedule_items where title = 'ผูกข้อมือตามรายชื่อ';
  if v_id is null then return; end if;
  for e in select value from jsonb_array_elements(v_people) with ordinality order by ordinality loop
    v_party := null;
    if e ? 'guest_id' then
      select party_id into v_party from guests where id = (e ->> 'guest_id')::uuid;
    end if;
    if v_party is not null and v_party = v_prev then
      v_last := v_out -> -1;
      v_out := (v_out - -1) || jsonb_build_array(jsonb_build_object('guest_ids',
        (case when v_last ? 'guest_ids' then v_last -> 'guest_ids' else jsonb_build_array(v_last -> 'guest_id') end)
        || jsonb_build_array(e -> 'guest_id')));
    else
      v_out := v_out || jsonb_build_array(e);
    end if;
    v_prev := v_party;
  end loop;
  update schedule_items set people = v_out where id = v_id;
end $$;
