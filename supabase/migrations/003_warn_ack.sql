-- "ไม่เป็นไร" on a table's mixed-group warning. Stores which mix was accepted (group signature),
-- so the warning comes back by itself if a different group joins the table later.
alter table tables add column warn_ack text;
