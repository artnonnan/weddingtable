-- "เช็คแล้ว" mark per table (reviewed, done). Follows the table's content when a whole table is moved.
alter table tables add column checked_at timestamptz;
alter table tables add column checked_by text;

create or replace function move_table(p_from uuid, p_to uuid, p_actor text default '') returns int
language plpgsql as $$
declare
  v_bumped int;
  f tables%rowtype;
  t tables%rowtype;
begin
  if p_from = p_to then return 0; end if;
  perform 1 from tables where id in (p_from, p_to) for update;
  select * into f from tables where id = p_from;
  select * into t from tables where id = p_to;
  if f.id is null or t.id is null then raise exception 'ไม่พบโต๊ะ'; end if;

  perform create_snapshot('ก่อนย้ายทั้งโต๊ะ', p_actor);

  select count(*) into v_bumped from guests where table_id = p_to and kind = 'guest';
  update guests set table_id = null, seat_no = null where table_id = p_to and kind = 'guest';
  delete from guests where table_id = p_to and kind = 'reserved';

  update guests set table_id = p_to where table_id = p_from; -- seat numbers stay the same

  -- target takes the source's sign / ack / checked; the emptied source keeps the target's old sign
  update tables set sign_id = f.sign_id, warn_ack = f.warn_ack, checked_at = f.checked_at, checked_by = f.checked_by where id = p_to;
  update tables set sign_id = t.sign_id, warn_ack = null, checked_at = null, checked_by = null where id = p_from;
  return v_bumped;
end $$;
