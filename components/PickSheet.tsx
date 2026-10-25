"use client";

import { useMemo, useState } from "react";
import { partyLabel } from "@/lib/layout";
import { useStore } from "@/lib/store";
import { searchKey } from "@/lib/thai";
import { Sheet } from "./Sheet";
import { inputClass, SignChip } from "./ui";

/** Choose people without a table to seat at the given table. */
export function PickSheet({ tableId }: { tableId: string }) {
  const { state, d, closeSheet, moveTo } = useStore();
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    if (!state || !d) return [];
    const key = searchKey(q);
    return state.parties
      .map((p) => ({ p, free: (d.membersByParty.get(p.id) ?? []).filter((m) => !m.table_id) }))
      .filter(({ p, free }) => free.length > 0 && (!key || searchKey(`${p.name}${p.nickname}${p.village}`).includes(key)));
  }, [state, d, q]);

  if (!state || !d) return null;
  const table = d.tableById.get(tableId);
  const cap = state.settings.seats_per_table;
  const people = (d.guestsByTable.get(tableId) ?? []).filter((g) => g.kind === "guest").length;
  const space = cap - people;

  return (
    <Sheet onClose={closeSheet} title={`เพิ่มคนลงโต๊ะ ${d.numbers.get(tableId)} (ว่าง ${space} ที่)`}>
      <input className={`${inputClass} mb-3`} placeholder="ค้นหาชื่อ / หมู่บ้าน" value={q} onChange={(e) => setQ(e.target.value)} />
      {rows.length === 0 && <p className="py-6 text-center text-sm text-muted">ทุกคนมีโต๊ะแล้ว 🎉</p>}
      <ul className="divide-y divide-line rounded-xl border border-line bg-card">
        {rows.map(({ p, free }) => {
          const fits = free.length <= space;
          const sign = p.sign_id ? d.signById.get(p.sign_id) : undefined;
          const differs = table?.sign_id != null && p.sign_id !== table.sign_id;
          return (
            <li key={p.id}>
              <button
                disabled={!fits}
                onClick={async () => {
                  if (await moveTo(tableId, free.map((m) => m.id), `${partyLabel(p)} (${free.length} คน)`)) closeSheet();
                }}
                className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left text-sm active:bg-paper disabled:opacity-40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{partyLabel(p)}</span>
                  <span className="block truncate text-xs text-muted">
                    {p.host} · {p.village || "-"}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <SignChip sign={sign} small />
                  <span className={`text-xs ${differs ? "text-danger" : "text-muted"}`}>
                    {free.length} คน{differs ? " · ต่างป้าย" : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
