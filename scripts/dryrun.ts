// Offline check: sheet snapshot → parties → auto-assign, printed per table. No database needed.
//   npx tsx scripts/dryrun.ts [data/sheet-raw.json]
import { readFileSync } from "node:fs";
import { buildParties, type SheetTab } from "../lib/importRules";
import { autoAssign, guestLabel, tableNumbers, tableWarning } from "../lib/layout";
import type { Guest, Party, Settings, Sign } from "../lib/types";

const SIGNS: Sign[] = [
  { id: 1, label: "VIP", color: "", side: "vip", sort_order: 1 },
  { id: 2, label: "ญาติเจ้าสาว", color: "", side: "bride", sort_order: 2 },
  { id: 3, label: "แขกเจ้าสาว", color: "", side: "bride", sort_order: 3 },
  { id: 4, label: "ที่ทำงานเจ้าสาว", color: "", side: "bride", sort_order: 4 },
  { id: 5, label: "ญาติเจ้าบ่าว", color: "", side: "groom", sort_order: 5 },
  { id: 6, label: "แขกเจ้าบ่าว", color: "", side: "groom", sort_order: 6 },
  { id: 7, label: "เพื่อนเจ้าบ่าว", color: "", side: "groom", sort_order: 7 },
];

const tabs: SheetTab[] = JSON.parse(readFileSync(process.argv[2] ?? "data/sheet-raw.json", "utf8"));
const { parties: drafts, skipped } = buildParties(tabs);

let n = 0;
const id = () => `id${++n}`;
const parties: Party[] = drafts.map((d) => ({ ...d, id: id(), note: "", created_at: "" }));
const guests: Guest[] = parties.flatMap((p) =>
  Array.from({ length: p.size }, (_, i) => ({
    id: id(), kind: "guest" as const, party_id: p.id, member_no: i + 1, display_name: null,
    status: "confirmed" as const, table_id: null, seat_no: null,
  })),
);
const settings: Settings = { id: 1, bride_side: "left", rows_per_lane: null, reserve_tables: 0, seats_per_table: 8 };

console.log(`parties ${parties.length}, people ${guests.length}, skipped ${skipped.length}`);
for (const s of skipped) console.log(`  skip ${s.sheet}#${s.row} ${s.label}: ${s.reason}`);
console.log("\nper sign:");
for (const s of SIGNS) {
  const ppl = parties.filter((p) => p.sign_id === s.id).reduce((a, p) => a + p.size, 0);
  console.log(`  ${s.label.padEnd(16)} ${String(ppl).padStart(4)} คน  → ${Math.ceil(ppl / 8)} โต๊ะ (ปัดขึ้น)`);
}

const res = autoAssign({ settings, signs: SIGNS, parties, guests, newId: id });
const nums = tableNumbers(res.tables, settings.bride_side);
const partyById = new Map(parties.map((p) => [p.id, p]));
const guestById = new Map(guests.map((g) => [g.id, g]));
console.log(`\ntables ${res.tables.length}, rows/lane ${res.rowsPerLane}, unseated ${res.unseated.length}\n`);

const sorted = [...res.tables].sort((a, b) => nums.get(a.id)! - nums.get(b.id)!);
for (const t of sorted) {
  const seats = res.seats.filter((s) => s.table_id === t.id);
  const occ: Guest[] = seats.map((s) =>
    s.kind === "guest"
      ? { ...guestById.get(s.guest_id)!, table_id: t.id }
      : { id: "r", kind: "reserved", party_id: null, member_no: null, display_name: s.label, status: "confirmed", table_id: t.id, seat_no: s.seat_no },
  );
  const w = tableWarning(t, occ, partyById, SIGNS);
  const mark = w.level === "wrong" ? "⚠️ " : w.level === "mixed" ? "· " : "  ";
  const label = SIGNS.find((s) => s.id === t.sign_id)?.label ?? "(จองไว้)";
  const people = occ.filter((g) => g.kind === "guest").length;
  console.log(`${mark}โต๊ะ ${String(nums.get(t.id)).padStart(2)} [${t.lane[0]}${t.pos}] ${label} ${people}/8`);
  const byParty = new Map<string, number>();
  for (const g of occ) if (g.party_id) byParty.set(g.party_id, (byParty.get(g.party_id) ?? 0) + 1);
  for (const [pid, cnt] of byParty) {
    const p = partyById.get(pid)!;
    const flag = t.sign_id != null && p.sign_id !== t.sign_id ? "  ← ต่างป้าย" : "";
    console.log(`      ${cnt}× ${guestLabel({ ...guests[0], display_name: null, member_no: 1 }, { ...p, size: 1 })} (${p.host}·${p.village})${flag}`);
  }
}
