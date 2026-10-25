// Applies supabase/migrations/*.sql in order, once each. Needs DATABASE_URL in .env.local.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is missing in .env.local");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(
  "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
);
// keep it out of the public Data API
await client.query("alter table _migrations enable row level security");
const done = new Set((await client.query("select name from _migrations")).rows.map((r) => r.name));

const dir = join(import.meta.dirname, "..", "supabase", "migrations");
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(file)) continue;
  process.stdout.write(`applying ${file} ... `);
  try {
    await client.query("begin");
    await client.query(readFileSync(join(dir, file), "utf8"));
    await client.query("insert into _migrations (name) values ($1)", [file]);
    await client.query("commit");
    console.log("ok");
  } catch (err) {
    await client.query("rollback");
    console.log("FAILED");
    console.error(err.message);
    process.exit(1);
  }
}
await client.end();
console.log("migrations up to date");
