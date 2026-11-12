-- The band's sign on three lines: นักดนตรี / และ / ทีมเครื่องเสียง
update settings
set print_specials = (
  select jsonb_agg(case when replace(replace(x #>> '{}', E'\n', ''), ' ', '') = 'นักดนตรีและทีมเครื่องเสียง'
                        then to_jsonb(E'นักดนตรี\nและ\nทีมเครื่องเสียง'::text) else x end order by i)
  from jsonb_array_elements(print_specials) with ordinality as t(x, i)
)
where id = 1 and jsonb_array_length(print_specials) > 0;
alter table settings alter column print_specials set default '["ออแกไนซ์", "นักดนตรี\nและ\nทีมเครื่องเสียง"]';
