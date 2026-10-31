import Fuse from "fuse.js";
import { guestLabel } from "./layout";
import { searchKey } from "./thai";
import type { Guest, Party } from "./types";

export interface SearchHit {
  guest: Guest;
  party: Party;
  label: string;
}

interface Doc extends SearchHit {
  keys: string[];
}

export function buildSearch(guests: Guest[], partyById: Map<string, Party>) {
  const docs: Doc[] = [];
  for (const g of guests) {
    if (g.kind !== "guest" || !g.party_id) continue;
    const party = partyById.get(g.party_id);
    if (!party) continue;
    const label = guestLabel(g, party);
    docs.push({ guest: g, party, label, keys: [label, party.name, party.nickname, g.display_name ?? ""].map(searchKey).filter(Boolean) });
  }
  const fuse = new Fuse(docs, { keys: ["keys"], threshold: 0.35, ignoreLocation: true });

  /** `keep` narrows the hits (e.g. one side or one host); fuzzy matches are filtered before the limit applies. */
  return (query: string, limit = 30, keep?: (h: SearchHit) => boolean): SearchHit[] => {
    const q = searchKey(query);
    if (!q) return [];
    const ok = (d: Doc) => !keep || keep(d);
    const exact = docs.filter((d) => ok(d) && d.keys.some((k) => k.includes(q)));
    const seen = new Set(exact.map((d) => d.guest.id));
    const fuzzy =
      exact.length >= limit
        ? []
        : fuse
            .search(q, keep ? undefined : { limit })
            .map((r) => r.item)
            .filter((d) => ok(d) && !seen.has(d.guest.id));
    return [...exact, ...fuzzy].slice(0, limit);
  };
}
