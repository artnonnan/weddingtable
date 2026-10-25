-- Sheet rows deleted in the web (e.g. no longer coming) must not come back on the next import.

create table import_ignore (
  source_sheet text not null,
  name         text not null default '',
  nickname     text not null default '',
  at           timestamptz not null default now(),
  primary key (source_sheet, name, nickname)
);

alter table import_ignore enable row level security;
create policy open_all on import_ignore for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on import_ignore to anon, authenticated;

-- the two parties removed on 2026-10-25 (no longer coming)
insert into import_ignore (source_sheet, name, nickname) values
  ('พ่อถวัลย์', 'คุณมานิตย์ แปงสนิท พร้อมครอบครัว', 'น้านิต'),
  ('พ่อถวัลย์', 'คุณป้า ศรีลานนา สามคำลือ พร้อมครอบครัว', 'แม่นา');
