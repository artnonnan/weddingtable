// Auto-assignment, table numbering and mixed-group warnings. Pure functions (no DB, no React).
import { HOSTS, type Guest, type Lane, type Party, type Settings, type Sign, type Table } from "./types";

// ---------------------------------------------------------------- names

export function partyLabel(p: Pick<Party, "name" | "nickname">): string {
  return p.name || p.nickname || "(ไม่มีชื่อ)";
}

export function guestLabel(g: Guest, party: Party | undefined): string {
  if (g.display_name) return g.display_name;
  if (g.kind === "reserved" || !party) return "จองไว้";
  const base = partyLabel(party);
  return party.size > 1 ? `${base} ${g.member_no}/${party.size}` : base;
}

/** A printed sign's label, broken before เจ้าสาว / เจ้าบ่าว: "ญาติเจ้าสาว" → ["ญาติ", "เจ้าสาว"]. */
export function signLines(label: string): string[] {
  return label.split(/(?=เจ้า(?:สาว|บ่าว))/).map((l) => l.trim()).filter(Boolean);
}

/** Largest font size (pt) that keeps the longest line inside the template's white panel. Thai marks take no width. */
export function signFontPt(lines: string[]): number {
  const chars = Math.max(1, ...lines.map((l) => l.replace(/[ัิ-ฺ็-๎]/g, "").length));
  return Math.min(56, Math.floor(270 / (chars * 0.67)));
}

export function groupKey(p: Pick<Party, "host" | "village">): string {
  return `${p.host}·${p.village}`;
}

// ---------------------------------------------------------------- numbering

export function physicalLanes(brideSide: Settings["bride_side"]): Lane[] {
  return brideSide === "left" ? ["bride", "middle", "groom"] : ["groom", "middle", "bride"];
}

/** Numbers run row by row from the stage, left to right within a row. */
export function tableNumbers(tables: Table[], brideSide: Settings["bride_side"]): Map<string, number> {
  const order = physicalLanes(brideSide);
  const sorted = [...tables].sort((a, b) => a.pos - b.pos || order.indexOf(a.lane) - order.indexOf(b.lane));
  return new Map(sorted.map((t, i) => [t.id, i + 1]));
}

// ---------------------------------------------------------------- warnings

export type WarnLevel = "none" | "mixed" | "wrong";

export interface TableWarning {
  level: WarnLevel;
  /** level to display: "none" when someone pressed "ไม่เป็นไร" for exactly this mix */
  shown: WarnLevel;
  /** identifies the current mix; stored in tables.warn_ack when acknowledged */
  signature: string;
  /** guest ids whose party belongs to a different sign than the table */
  wrongGuestIds: Set<string>;
}

/**
 * wrong = someone at the table belongs to another sign (or several signs share an unsigned table).
 * mixed = everyone matches the sign but they come from different host/village groups.
 * VIP tables never warn: whoever the couple seats there is meant to be there.
 */
export function tableWarning(table: Table, occupants: Guest[], partyById: Map<string, Party>, signs: Sign[]): TableWarning {
  const make = (level: WarnLevel): TableWarning => {
    const signature = `${table.sign_id ?? "-"}|${[...signIds].sort().join(",")}|${[...groups].sort().join(",")}`;
    const acked = level !== "none" && table.warn_ack === signature;
    return { level, shown: acked ? "none" : level, signature, wrongGuestIds };
  };
  const people = occupants.filter((g) => g.kind === "guest" && g.party_id);
  const wrongGuestIds = new Set<string>();
  const signIds = new Set<number | null>();
  const groups = new Set<string>();
  if (signs.find((s) => s.id === table.sign_id)?.side === "vip") return make("none");
  for (const g of people) {
    const p = partyById.get(g.party_id!);
    if (!p) continue;
    signIds.add(p.sign_id);
    groups.add(groupKey(p));
    if (table.sign_id != null && p.sign_id !== table.sign_id) wrongGuestIds.add(g.id);
  }
  if (wrongGuestIds.size > 0 || (table.sign_id == null && signIds.size > 1)) {
    return make("wrong");
  }
  if (groups.size > 1) return make("mixed");
  return make("none");
}

// ---------------------------------------------------------------- auto-assign

export interface LayoutTable {
  id: string;
  lane: Lane;
  pos: number;
  sign_id: number | null;
}

export type LayoutSeat =
  | { kind: "guest"; guest_id: string; table_id: string; seat_no: number }
  | { kind: "reserved"; table_id: string; seat_no: number; label: string };

export interface LayoutResult {
  tables: LayoutTable[];
  seats: LayoutSeat[];
  rowsPerLane: number;
  /** people who could not be seated (should be zero) */
  unseated: string[];
}

interface Unit {
  party: Party;
  guestIds: string[];
}

interface Pack {
  signId: number;
  units: Unit[];
  used: number;
}

const hostRank = (h: string) => {
  const i = (HOSTS as readonly string[]).indexOf(h);
  return i === -1 ? HOSTS.length : i;
};

/** Split parties bigger than a table into table-sized units (rare: nobody in the sheet is > 8). */
function toUnits(party: Party, guestIds: string[], cap: number): Unit[] {
  const out: Unit[] = [];
  for (let i = 0; i < guestIds.length; i += cap) out.push({ party, guestIds: guestIds.slice(i, i + cap) });
  return out;
}

function packSign(signId: number, units: Unit[], cap: number): Pack[] {
  // group by host + village, biggest groups first within a host, biggest parties first within a group
  const groups = new Map<string, Unit[]>();
  for (const u of units) {
    const k = groupKey(u.party);
    groups.set(k, [...(groups.get(k) ?? []), u]);
  }
  const ordered = [...groups.values()].sort((a, b) => {
    const hr = hostRank(a[0].party.host) - hostRank(b[0].party.host);
    if (hr) return hr;
    return sizeOf(b) - sizeOf(a);
  });

  const packs: Pack[] = [];
  for (const group of ordered) {
    const key = groupKey(group[0].party);
    for (const u of [...group].sort((a, b) => b.guestIds.length - a.guestIds.length)) {
      const n = u.guestIds.length;
      const fits = (p: Pack) => cap - p.used >= n;
      const target =
        packs.find((p) => fits(p) && p.units.some((x) => groupKey(x.party) === key)) ??
        (packs.length && fits(packs[packs.length - 1]) ? packs[packs.length - 1] : undefined) ??
        packs.find(fits);
      if (target) {
        target.units.push(u);
        target.used += n;
      } else {
        packs.push({ signId, units: [u], used: n });
      }
    }
  }
  return packs;
}

const sizeOf = (units: Unit[]) => units.reduce((s, u) => s + u.guestIds.length, 0);

/** Empty the emptiest tables into free seats elsewhere on the same side, when they fit completely. */
function consolidate(packs: Pack[], cap: number): Pack[] {
  const live = [...packs];
  const tried = new Set<Pack>();
  for (;;) {
    const donor = live.filter((p) => !tried.has(p)).sort((a, b) => a.used - b.used)[0];
    if (!donor || donor.used >= cap) break;
    tried.add(donor);

    const free = new Map(live.filter((p) => p !== donor).map((p) => [p, cap - p.used]));
    const plan: [Unit, Pack][] = [];
    let ok = true;
    for (const u of [...donor.units].sort((a, b) => b.guestIds.length - a.guestIds.length)) {
      const n = u.guestIds.length;
      const candidates = [...free.entries()].filter(([, f]) => f >= n);
      if (!candidates.length) {
        ok = false;
        break;
      }
      candidates.sort(([a, fa], [b, fb]) => {
        const sa = a.signId === u.party.sign_id ? 0 : 1;
        const sb = b.signId === u.party.sign_id ? 0 : 1;
        if (sa !== sb) return sa - sb;
        const ha = a.units.some((x) => x.party.host === u.party.host) ? 0 : 1;
        const hb = b.units.some((x) => x.party.host === u.party.host) ? 0 : 1;
        if (ha !== hb) return ha - hb;
        return fa - fb; // fullest first
      });
      const [target, f] = candidates[0];
      free.set(target, f - n);
      plan.push([u, target]);
    }
    if (!ok) continue;
    for (const [u, target] of plan) {
      target.units.push(u);
      target.used += u.guestIds.length;
    }
    live.splice(live.indexOf(donor), 1);
  }
  return live;
}

export interface AutoAssignInput {
  settings: Settings;
  signs: Sign[];
  parties: Party[];
  guests: Guest[];
  newId?: () => string;
}

export function autoAssign({ settings, signs, parties, guests, newId = () => crypto.randomUUID() }: AutoAssignInput): LayoutResult {
  const cap = settings.seats_per_table;
  const signsSorted = [...signs].sort((a, b) => a.sort_order - b.sort_order);
  const membersByParty = new Map<string, Guest[]>();
  for (const g of guests) {
    if (g.kind !== "guest" || !g.party_id) continue;
    membersByParty.set(g.party_id, [...(membersByParty.get(g.party_id) ?? []), g]);
  }

  const unitsBySign = new Map<number, Unit[]>();
  const unseated: string[] = [];
  for (const p of parties) {
    const ids = (membersByParty.get(p.id) ?? []).sort((a, b) => (a.member_no ?? 0) - (b.member_no ?? 0)).map((g) => g.id);
    if (!ids.length) continue;
    if (p.sign_id == null || !signs.some((s) => s.id === p.sign_id)) {
      unseated.push(...ids);
      continue;
    }
    unitsBySign.set(p.sign_id, [...(unitsBySign.get(p.sign_id) ?? []), ...toUnits(p, ids, cap)]);
  }

  const vipPacks: Pack[] = [];
  const side: Record<"bride" | "groom", Pack[]> = { bride: [], groom: [] };
  for (const s of signsSorted) {
    const packs = packSign(s.id, unitsBySign.get(s.id) ?? [], cap);
    if (s.side === "vip") vipPacks.push(...packs);
    else side[s.side].push(...packs);
  }
  const bride = consolidate(side.bride, cap);
  const groom = consolidate(side.groom, cap);
  // consolidate keeps relative order of survivors; re-sort by sign order to be safe
  const signOrder = (id: number) => signsSorted.findIndex((s) => s.id === id);
  bride.sort((a, b) => signOrder(a.signId) - signOrder(b.signId));
  groom.sort((a, b) => signOrder(a.signId) - signOrder(b.signId));

  const vipSign = signsSorted.find((s) => s.side === "vip");
  if (!vipPacks.length && vipSign) vipPacks.push({ signId: vipSign.id, units: [], used: 0 });

  const reserveTables = Math.max(0, settings.reserve_tables);
  const total = vipPacks.length + bride.length + groom.length + reserveTables;
  const auto = Math.max(1, Math.ceil(total / 3));
  const rows = Math.max(settings.rows_per_lane ?? auto, auto);

  type Slot = Pack | "reserve";
  const lanes: Record<Lane, Slot[]> = { bride: [], middle: [...vipPacks], groom: [] };
  const bq = [...bride];
  const gq = [...groom];
  while (lanes.bride.length < rows && bq.length) lanes.bride.push(bq.shift()!);
  while (lanes.groom.length < rows && gq.length) lanes.groom.push(gq.shift()!);
  // middle: bride overflow first (bride side is bigger), then groom overflow
  while (lanes.middle.length < rows && bq.length) lanes.middle.push(bq.shift()!);
  while (lanes.middle.length < rows && gq.length) lanes.middle.push(gq.shift()!);
  // anything still left goes to the tail of the groom lane, then the bride lane
  for (const lane of ["groom", "bride", "middle"] as Lane[]) {
    while (lanes[lane].length < rows && (bq.length || gq.length)) lanes[lane].push((bq.length ? bq : gq).shift()!);
  }
  for (let i = 0; i < reserveTables; i++) {
    const lane = (["bride", "middle", "groom"] as Lane[]).sort((a, b) => lanes[a].length - lanes[b].length)[0];
    lanes[lane].push("reserve");
  }

  const tables: LayoutTable[] = [];
  const seats: LayoutSeat[] = [];
  for (const lane of ["bride", "middle", "groom"] as Lane[]) {
    lanes[lane].forEach((slot, pos) => {
      const id = newId();
      if (slot === "reserve") {
        tables.push({ id, lane, pos, sign_id: null });
        for (let s = 1; s <= cap; s++) seats.push({ kind: "reserved", table_id: id, seat_no: s, label: "จองไว้" });
        return;
      }
      tables.push({ id, lane, pos, sign_id: slot.signId });
      let seat = 1;
      for (const u of slot.units) for (const gid of u.guestIds) seats.push({ kind: "guest", guest_id: gid, table_id: id, seat_no: seat++ });
      // VIP table: hold the remaining seats for the groom to fill by hand
      if (slot === vipPacks[0]) {
        for (; seat <= cap; seat++) seats.push({ kind: "reserved", table_id: id, seat_no: seat, label: "จองไว้" });
      }
    });
  }
  return { tables, seats, rowsPerLane: rows, unseated };
}
