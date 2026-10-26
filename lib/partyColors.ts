// One colour per party that came together, shared by the 2D table sheet and the 3D hall.
// People who came alone are light grey so groups stand out. Two groups at the same table never share
// a colour (at most 8 groups per table, 10 colours); neighbouring tables are avoided when possible.
import type { Guest, Party, Table } from "./types";

/** Ten clearly different colours (Okabe-Ito based, colour-blind friendly), ordered for contrast. */
export const GROUP_PALETTE = [
  "#E69F00", // orange
  "#0072B2", // blue
  "#009E73", // green
  "#CC79A7", // pink
  "#D55E00", // vermilion
  "#56B4E9", // sky
  "#7C3AED", // violet
  "#B8A100", // olive yellow
  "#8B4513", // brown
  "#111827", // near black
];
export const SOLO_COLOR = "#C9C5C0";

export function partyColors(parties: Party[], guests: Guest[], tables: Table[]): Map<string, string> {
  const tablesOf = new Map<string, Set<string>>(); // party → tables
  const partiesAt = new Map<string, Set<string>>(); // table → parties
  for (const g of guests) {
    if (g.kind !== "guest" || !g.party_id || !g.table_id) continue;
    if (!tablesOf.has(g.party_id)) tablesOf.set(g.party_id, new Set());
    tablesOf.get(g.party_id)!.add(g.table_id);
    if (!partiesAt.has(g.table_id)) partiesAt.set(g.table_id, new Set());
    partiesAt.get(g.table_id)!.add(g.party_id);
  }

  // tables next to each other (same row or same lane, one step apart)
  const neighbours = new Map<string, string[]>();
  for (const a of tables) {
    neighbours.set(
      a.id,
      tables.filter((b) => b.id !== a.id && ((b.pos === a.pos) || (b.lane === a.lane && Math.abs(b.pos - a.pos) === 1))).map((b) => b.id),
    );
  }

  const colors = new Map<string, string>();
  const groups = parties.filter((p) => p.size > 1);
  for (const p of parties) if (p.size <= 1) colors.set(p.id, SOLO_COLOR);

  // most constrained first (sits with the most other groups), then stable by id
  const conflicts = (p: Party) => {
    let n = 0;
    for (const t of tablesOf.get(p.id) ?? []) n += (partiesAt.get(t)?.size ?? 1) - 1;
    return n;
  };
  groups.sort((a, b) => conflicts(b) - conflicts(a) || a.id.localeCompare(b.id));

  for (const p of groups) {
    const hard = new Set<string>(); // colours of groups at the same table
    const soft = new Set<string>(); // colours of groups at neighbouring tables
    for (const t of tablesOf.get(p.id) ?? []) {
      for (const q of partiesAt.get(t) ?? []) if (q !== p.id && colors.has(q)) hard.add(colors.get(q)!);
      for (const n of neighbours.get(t) ?? []) for (const q of partiesAt.get(n) ?? []) if (colors.has(q)) soft.add(colors.get(q)!);
    }
    // start the search at a stable offset so colours do not all pile onto the first entries
    const start = hash(p.id) % GROUP_PALETTE.length;
    const order = GROUP_PALETTE.map((_, i) => GROUP_PALETTE[(start + i) % GROUP_PALETTE.length]);
    const pick = order.find((c) => !hard.has(c) && !soft.has(c)) ?? order.find((c) => !hard.has(c)) ?? order[0];
    colors.set(p.id, pick);
  }
  return colors;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
