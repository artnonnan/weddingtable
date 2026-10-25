-- Telegram digest: every 5 minutes, send new change_log entries (except the groom's own) as one message.
-- Bot token / chat id live in a private schema that the public Data API (anon) cannot read.
-- They are filled in by scripts/notify-setup.mjs, never committed.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.notify_config (
  id          int primary key default 1 check (id = 1),
  bot_token   text,
  chat_id     text,
  skip_actors text[] not null default '{}',
  last_log_id bigint not null default 0,
  enabled     boolean not null default true
);
-- start from now: do not replay the existing history
insert into private.notify_config (id, last_log_id) select 1, coalesce(max(id), 0) from public.change_log;

create or replace function private.send_digest() returns int
language plpgsql security definer set search_path = public, private, extensions as $$
declare
  cfg private.notify_config;
  v_max bigint;
  v_count int;
  v_first timestamptz;
  v_last timestamptz;
  v_lines text[];
  v_text text;
begin
  select * into cfg from private.notify_config where id = 1 for update;
  if not cfg.enabled or cfg.bot_token is null or cfg.chat_id is null then return 0; end if;

  select max(id) into v_max from change_log;
  if v_max is null or v_max <= cfg.last_log_id then return 0; end if;

  select count(*), min(at), max(at) into v_count, v_first, v_last
  from change_log
  where id > cfg.last_log_id and id <= v_max and not (trim(actor) = any (cfg.skip_actors));

  if v_count > 0 then
    select array_agg(line order by id) into v_lines from (
      select id,
        '• ' || coalesce(nullif(trim(actor), ''), 'ไม่ระบุชื่อ') || ': ' || action
          || case when detail <> '' then ' — ' || left(detail, 120) else '' end as line
      from change_log
      where id > cfg.last_log_id and id <= v_max and not (trim(actor) = any (cfg.skip_actors))
      order by id
      limit 40
    ) x;

    v_text := '🔔 มีการแก้ผังโต๊ะ ' || v_count || ' รายการ ('
      || to_char(v_first at time zone 'Asia/Bangkok', 'HH24:MI') || '–'
      || to_char(v_last at time zone 'Asia/Bangkok', 'HH24:MI') || ')' || E'\n'
      || array_to_string(v_lines, E'\n')
      || case when v_count > 40 then E'\n… และอีก ' || (v_count - 40) || ' รายการ' else '' end
      || E'\n\nhttps://weddingtable-flax.vercel.app';

    perform net.http_post(
      url := 'https://api.telegram.org/bot' || cfg.bot_token || '/sendMessage',
      body := jsonb_build_object('chat_id', cfg.chat_id, 'text', v_text, 'disable_web_page_preview', true),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;

  update private.notify_config set last_log_id = v_max where id = 1;
  return v_count;
end $$;

revoke all on function private.send_digest() from public, anon, authenticated;

select cron.schedule('telegram-digest', '*/5 * * * *', $$select private.send_digest()$$);
