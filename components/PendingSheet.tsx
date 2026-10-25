"use client";

import { partyLabel } from "@/lib/layout";
import { useStore } from "@/lib/store";
import { Sheet } from "./Sheet";
import { SignChip, StatusDot } from "./ui";

/** "รอดำเนินการ": everyone without a table, ready to be placed. */
export function PendingSheet() {
  const { state, d, closeSheet, openSheet, startMove } = useStore();
  if (!state || !d) return null;

  const rows = state.parties
    .map((p) => ({ p, free: (d.membersByParty.get(p.id) ?? []).filter((m) => !m.table_id) }))
    .filter(({ free }) => free.length > 0)
    .sort((a, b) => (a.p.sign_id ?? 99) - (b.p.sign_id ?? 99));
  const total = rows.reduce((s, r) => s + r.free.length, 0);

  return (
    <Sheet onClose={closeSheet} title={`รอดำเนินการ (${total} คน)`}>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">ทุกคนมีโต๊ะแล้ว 🎉</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">กด “เลือกโต๊ะ” แล้วแตะโต๊ะปลายทางบนผัง</p>
          <ul className="divide-y divide-line rounded-xl border border-line bg-card">
            {rows.map(({ p, free }) => (
              <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => openSheet({ type: "party", id: p.id })}>
                  <StatusDot status={free[0].status} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{partyLabel(p)}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <SignChip sign={p.sign_id ? d.signById.get(p.sign_id) : undefined} small />
                      <span className="truncate">
                        {p.host} · {p.village || "-"} · {free.length} คน
                      </span>
                    </span>
                  </span>
                </button>
                <button
                  className="min-h-10 shrink-0 rounded-xl bg-accent px-3 text-sm font-medium text-white active:opacity-80"
                  onClick={() => startMove({ guestIds: free.map((m) => m.id), label: `${partyLabel(p)} (${free.length} คน)` })}
                >
                  เลือกโต๊ะ
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
