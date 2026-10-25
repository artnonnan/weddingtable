-- View-only by default: anyone can read, only requests carrying a valid edit token (009_edit_pin) can write.
-- The RPCs that change data run as the caller, so they are covered by these policies too.
do $$
declare t text;
begin
  foreach t in array array['settings', 'signs', 'tables', 'parties', 'guests', 'change_log', 'snapshots', 'import_ignore'] loop
    execute format('drop policy if exists open_all on %I', t);
    execute format('create policy read_all on %I for select to anon, authenticated using (true)', t);
    execute format('create policy editors_insert on %I for insert to anon, authenticated with check (public.is_editor())', t);
    execute format('create policy editors_update on %I for update to anon, authenticated using (public.is_editor()) with check (public.is_editor())', t);
    execute format('create policy editors_delete on %I for delete to anon, authenticated using (public.is_editor())', t);
  end loop;
end $$;
