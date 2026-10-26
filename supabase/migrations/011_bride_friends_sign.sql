-- New sign "เพื่อนเจ้าสาว" (after the other bride signs) and swap colours of ที่ทำงานเจ้าสาว <-> เพื่อนเจ้าบ่าว.
-- Existing guests keep their sign; moving โดม's friends onto the new sign is a separate decision.
select create_snapshot('ก่อนเพิ่มป้ายเพื่อนเจ้าสาว / สลับสีป้าย', 'claude');

update signs set sort_order = sort_order + 1 where sort_order >= 5;
insert into signs (id, label, color, side, sort_order) values (8, 'เพื่อนเจ้าสาว', '#E8743B', 'bride', 5);

update signs s set color = x.color
from (values (4, (select color from signs where id = 7)), (7, (select color from signs where id = 4))) as x (id, color)
where s.id = x.id;

insert into change_log (actor, action, detail) values
  ('claude', 'แก้ป้ายโต๊ะ', 'เพิ่มป้าย “เพื่อนเจ้าสาว”; สลับสี ที่ทำงานเจ้าสาว ↔ เพื่อนเจ้าบ่าว');
