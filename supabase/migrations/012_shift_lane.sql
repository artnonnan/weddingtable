-- Shift p_table and every table behind it in the same lane by one spot.
-- p_delta = 1 leaves an empty spot in front of p_table; p_delta = -1 closes the empty spot in front of it.
-- Tables keep their id, so people, held seats and signs come along; only the numbers recount.
create or replace function shift_lane(p_table uuid, p_delta int) returns void
language plpgsql as $$
declare
  v_lane text;
  v_pos int;
begin
  if p_delta not in (1, -1) then raise exception 'p_delta ต้องเป็น 1 หรือ -1'; end if;
  select lane, pos into v_lane, v_pos from tables where id = p_table for update;
  if v_lane is null then raise exception 'ไม่พบโต๊ะ'; end if;
  perform 1 from tables where lane = v_lane for update;

  if p_delta = -1 and (v_pos = 0 or exists (select 1 from tables where lane = v_lane and pos = v_pos - 1)) then
    raise exception 'ข้างหน้าโต๊ะนี้ไม่มีช่องว่าง';
  end if;

  update tables set pos = pos + p_delta where lane = v_lane and pos >= v_pos;
end $$;

grant execute on function shift_lane(uuid, int) to anon, authenticated;
