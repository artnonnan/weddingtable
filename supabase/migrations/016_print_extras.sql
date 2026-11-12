-- Extra tent cards printed after the tables (they never appear on the map):
-- print_specials = signs with no table number (a line break in a label starts a new line on the card),
-- print_spares   = spare tables numbered on from the last table, one entry per table ('' = number only).
alter table settings
  add column print_specials jsonb not null default '["ออแกไนซ์", "นักดนตรี\nและทีมเครื่องเสียง"]',
  add column print_spares   jsonb not null default '["", "", ""]';
