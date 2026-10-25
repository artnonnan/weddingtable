// Load the guest-sheet snapshot (data/sheet-raw.json, never committed) into Supabase.
//   npm run import              → dry run: show what would be added
//   npm run import -- --apply   → insert new parties + their guests (existing ones are left alone)
//   npm run import -- --apply --assign → also run auto-assign (snapshots first)
//
// Re-running is safe: a party is "existing" when sheet + name + nickname match.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildParties, type SheetTab } from "../lib/importRules";
import { autoAssign } from "../lib/layout";
import type { Guest, Party, Settings, Sign } from "../lib/types";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const assign = args.has("--assign");
const file = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "data/sheet-raw.json";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY missing in .env.local");
const db = createClient(url, key, { auth: { persistSession: false } });

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const tabs: SheetTab[] = JSON.parse(readFileSync(file, "utf8"));
const { parties: drafts, skipped } = buildParties(tabs);

const existing = must(await db.from("parties").select("source_sheet,name,nickname")) as Pick<Party, "source_sheet" | "name" | "nickname">[];
const seen = new Set(existing.map((p) => `${p.source_sheet}|${p.name}|${p.nickname}`));
const fresh = drafts.filter((d) => !seen.has(`${d.source_sheet}|${d.name}|${d.nickname}`));

console.log(`sheet: ${drafts.length} parties / ${drafts.reduce((s, d) => s + d.size, 0)} people, skipped ${skipped.length} (not coming)`);
console.log(`database: ${existing.length} parties already there → ${fresh.length} new`);
for (const d of fresh) console.log(`  + ${d.source_sheet}#${d.source_row} ${d.name || d.nickname} ×${d.size} [sign ${d.sign_id}]`);

if (!apply) {
  console.log("\ndry run — add --apply to write");
  process.exit(0);
}

if (fresh.length) {
  const inserted = must(await db.from("parties").insert(fresh).select("id,size")) as Pick<Party, "id" | "size">[];
  const guestRows = inserted.flatMap((p) =>
    Array.from({ length: p.size }, (_, i) => ({ kind: "guest", party_id: p.id, member_no: i + 1, status: "confirmed" })),
  );
  must(await db.from("guests").insert(guestRows));
  must(
    await db.from("change_log").insert({
      actor: "import",
      action: "นำเข้ารายชื่อ",
      detail: `${inserted.length} รายการ / ${guestRows.length} คน`,
    }),
  );
  console.log(`inserted ${inserted.length} parties, ${guestRows.length} guests`);
}

if (assign) {
  const settings = must(await db.from("settings").select("*").eq("id", 1).single()) as Settings;
  const signs = must(await db.from("signs").select("*")) as Sign[];
  const parties = must(await db.from("parties").select("*")) as Party[];
  const guests = must(await db.from("guests").select("*")) as Guest[];
  const res = autoAssign({ settings, signs, parties, guests });
  must(await db.rpc("apply_layout", { p_tables: res.tables, p_seats: res.seats, p_actor: "import" }));
  console.log(`auto-assigned: ${res.tables.length} tables, ${res.rowsPerLane} rows per lane, unseated ${res.unseated.length}`);
}
