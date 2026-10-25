-- Re-order seats inside one table. p_order[i] is the occupant (guest or held seat) for seat i, or null = empty.
-- Fails if the table changed meanwhile (someone else moved people), so nobody gets dropped.
create or replace function set_seat_order(p_table uuid, p_order uuid[]) returns void
language plpgsql as $$
declare v_cap int;
begin
  select seats_per_table into v_cap from settings where id = 1;
  if coalesce(array_length(p_order, 1), 0) > v_cap then raise exception 'เกิน % ที่นั่ง', v_cap; end if;
  perform 1 from tables where id = p_table for update;

  if (select array_agg(x order by x) from unnest(p_order) x where x is not null)
     is distinct from (select array_agg(id order by id) from guests where table_id = p_table) then
    raise exception 'ข้อมูลโต๊ะนี้เพิ่งถูกแก้ ลองใหม่อีกครั้ง';
  end if;

  update guests g set seat_no = t.ord
  from unnest(p_order) with ordinality as t (gid, ord)
  where t.gid is not null and g.id = t.gid;
end $$;

grant execute on function set_seat_order(uuid, uuid[]) to anon, authenticated;
