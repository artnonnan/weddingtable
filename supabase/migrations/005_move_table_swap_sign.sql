-- move_table: the emptied source table now takes the target's old sign (signs swap),
-- so no sign is lost and moving back restores both tables.
create or replace function move_table(p_from uuid, p_to uuid, p_actor text default '') returns int
language plpgsql as $$
declare
  v_bumped int;
  v_from_sign int;
  v_from_ack text;
  v_to_sign int;
begin
  if p_from = p_to then return 0; end if;
  perform 1 from tables where id in (p_from, p_to) for update;
  if (select count(*) from tables where id in (p_from, p_to)) <> 2 then raise exception 'ไม่พบโต๊ะ'; end if;

  perform create_snapshot('ก่อนย้ายทั้งโต๊ะ', p_actor);

  select count(*) into v_bumped from guests where table_id = p_to and kind = 'guest';
  update guests set table_id = null, seat_no = null where table_id = p_to and kind = 'guest';
  delete from guests where table_id = p_to and kind = 'reserved';

  update guests set table_id = p_to where table_id = p_from; -- seat numbers stay the same

  select sign_id, warn_ack into v_from_sign, v_from_ack from tables where id = p_from;
  select sign_id into v_to_sign from tables where id = p_to;
  update tables set sign_id = v_from_sign, warn_ack = v_from_ack where id = p_to;
  update tables set sign_id = v_to_sign, warn_ack = null where id = p_from;
  return v_bumped;
end $$;
