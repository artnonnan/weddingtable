-- Move everything at p_from (people, held seats, sign, acknowledged warning) onto p_to.
-- Whoever sat at p_to goes back to "รอดำเนินการ" (no table); p_from is left empty.
-- Returns how many people were bumped from p_to.
create or replace function move_table(p_from uuid, p_to uuid, p_actor text default '') returns int
language plpgsql as $$
declare
  v_bumped int;
  v_sign int;
  v_ack text;
begin
  if p_from = p_to then return 0; end if;
  perform 1 from tables where id in (p_from, p_to) for update;
  if (select count(*) from tables where id in (p_from, p_to)) <> 2 then raise exception 'ไม่พบโต๊ะ'; end if;

  perform create_snapshot('ก่อนย้ายทั้งโต๊ะ', p_actor);

  select count(*) into v_bumped from guests where table_id = p_to and kind = 'guest';
  update guests set table_id = null, seat_no = null where table_id = p_to and kind = 'guest';
  delete from guests where table_id = p_to and kind = 'reserved';

  update guests set table_id = p_to where table_id = p_from; -- seat numbers stay the same

  select sign_id, warn_ack into v_sign, v_ack from tables where id = p_from;
  update tables set sign_id = v_sign, warn_ack = v_ack where id = p_to;
  update tables set sign_id = null, warn_ack = null where id = p_from;
  return v_bumped;
end $$;

grant execute on function move_table(uuid, uuid, text) to anon, authenticated;
