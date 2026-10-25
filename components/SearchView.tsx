"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { MapView } from "./MapView";
import { inputClass, SignChip, StatusChip } from "./ui";

export function SearchView() {
  const { d, openSheet, goToTable } = useStore();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  if (!d) return null;
  const hits = d.search(q);
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
      {q && hits.length === 0 && <p className="py-8 text-center text-sm text-muted">ไม่พบชื่อนี้</p>}

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
                  <span className="text-xs text-muted">ยังไม่มีโต๊ะ</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
