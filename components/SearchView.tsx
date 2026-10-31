"use client";

import { useEffect, useState } from "react";
import { guestLabel, partyLabel } from "@/lib/layout";
import type { SearchHit } from "@/lib/search";
import { useStore } from "@/lib/store";
import { HOSTS, type Party, type Sign } from "@/lib/types";
import { MapView } from "./MapView";
import { inputClass, SignChip, StatusChip } from "./ui";

const FILTER_KEY = "searchFilter";

interface Filter {
  id: string;
  label: string;
  test: (p: Party) => boolean;
}

/** ฝั่งเจ้าบ่าว / ฝั่งเจ้าสาว come from the party's sign (VIP and unsigned parties are in neither); hosts from the party's host. */
function filters(signById: Map<number, Sign>): Filter[] {
  const side = (s: Sign["side"]) => (p: Party) => p.sign_id != null && signById.get(p.sign_id)?.side === s;
  return [
    { id: "all", label: "ทั้งหมด", test: () => true },
    { id: "side:groom", label: "ฝั่งเจ้าบ่าว", test: side("groom") },
    { id: "side:bride", label: "ฝั่งเจ้าสาว", test: side("bride") },
    ...HOSTS.map((h) => ({ id: `host:${h}`, label: h, test: (p: Party) => p.host === h })),
  ];
}

export function SearchView() {
  const { state, d, openSheet, goToTable } = useStore();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [filterId, setFilterId] = useState("all");

  // remember the chosen filter per device
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTER_KEY);
      if (saved) setFilterId(saved);
    } catch {
      /* ignore */
    }
  }, []);
  const chooseFilter = (id: string) => {
    setFilterId(id);
    setPicked(null);
    try {
      localStorage.setItem(FILTER_KEY, id);
    } catch {
      /* ignore */
    }
  };

  if (!state || !d) return null;
  const all = filters(d.signById);
  const filter = all.find((f) => f.id === filterId) ?? all[0];
  const people = state.guests.filter((g) => g.kind === "guest" && g.party_id && d.partyById.has(g.party_id));
  const count = (f: Filter) => people.filter((g) => f.test(d.partyById.get(g.party_id!)!)).length;
  const shown = all.filter((f) => f.id === "all" || f.id === filter.id || count(f) > 0);

  let hits: SearchHit[];
  if (q.trim()) {
    hits = d.search(q, filter.id === "all" ? 30 : 100, filter.id === "all" ? undefined : (h) => filter.test(h.party));
  } else if (filter.id !== "all") {
    // no name typed: everyone in the group, by table number, people without a table last
    const tableNo = (id: string | null) => (id ? (d.numbers.get(id) ?? Infinity) : Infinity);
    hits = people
      .map((guest) => ({ guest, party: d.partyById.get(guest.party_id!)! }))
      .filter(({ party }) => filter.test(party))
      .map(({ guest, party }) => ({ guest, party, label: guestLabel(guest, party) }))
      .sort(
        (a, b) =>
          tableNo(a.guest.table_id) - tableNo(b.guest.table_id) ||
          partyLabel(a.party).localeCompare(partyLabel(b.party), "th") ||
          (a.guest.member_no ?? 0) - (b.guest.member_no ?? 0),
      );
  } else hits = [];
  const pickedTable = picked ? d.tableById.get(picked) : undefined;

  return (
    <div className="px-3 pb-4">
      <input
        autoFocus
        className={`${inputClass} min-h-14 text-lg`}
        placeholder="พิมพ์ชื่อหรือชื่อเล่น…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPicked(null);
        }}
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {shown.map((f) => {
          const active = f.id === filter.id;
          return (
            <button
              key={f.id}
              onClick={() => chooseFilter(f.id)}
              className={`min-h-9 rounded-full border px-3 text-sm ${active ? "border-ink bg-ink font-medium text-white" : "border-line bg-card text-ink"}`}
            >
              {f.label}
              {f.id !== "all" && <span className={active ? "text-white/70" : "text-muted"}> {count(f)}</span>}
            </button>
          );
        })}
      </div>
      {q && hits.length === 0 && (
        <p className="py-8 text-center text-sm text-muted">{filter.id === "all" ? "ไม่พบชื่อนี้" : `ไม่พบชื่อนี้ใน “${filter.label}”`}</p>
      )}
      {!q.trim() && filter.id !== "all" && (
        <p className="mt-3 text-xs text-muted">
          {filter.label} {hits.length} คน · เรียงตามเลขโต๊ะ
        </p>
      )}

      {pickedTable && (
        <div className="mt-3 rounded-2xl border border-line bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-lg font-bold">โต๊ะ {d.numbers.get(pickedTable.id)}</span>
            <button className="text-sm font-medium text-accent" onClick={() => goToTable(pickedTable.id)}>
              เปิดในผัง ›
            </button>
          </div>
          <MapView compact highlight={pickedTable.id} />
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {hits.map(({ guest, party, label }) => {
          const t = guest.table_id ? d.tableById.get(guest.table_id) : undefined;
          const sign = t?.sign_id ? d.signById.get(t.sign_id) : undefined;
          return (
            <li key={guest.id} className="flex items-stretch gap-2 rounded-2xl border border-line bg-card">
              <button className="min-w-0 flex-1 px-3 py-2.5 text-left" onClick={() => openSheet({ type: "party", id: party.id })}>
                <span className="block truncate font-medium">{label}</span>
                <span className="block truncate text-xs text-muted">
                  {party.name && party.nickname ? `${party.nickname} · ` : ""}
                  {party.host} · {party.village || "-"}
                </span>
                <span className="mt-1 block">
                  <StatusChip status={guest.status} />
                </span>
              </button>
              <button
                disabled={!t}
                onClick={() => t && setPicked(t.id)}
                className="flex w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-r-2xl border-l border-line bg-accent-soft/50 px-1 disabled:bg-paper"
              >
                {t ? (
                  <>
                    <span className="text-[11px] text-muted">โต๊ะ</span>
                    <span className="text-2xl font-bold leading-none text-accent">{d.numbers.get(t.id)}</span>
                    <SignChip sign={sign} small />
                  </>
                ) : (
                  <span className="text-xs text-muted">รอดำเนินการ</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
