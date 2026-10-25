"use client";

import { guestLabel, physicalLanes } from "@/lib/layout";
import { useStore } from "@/lib/store";

/** Page 1: room plan. Following pages: who sits at each table. */
export default function PrintMap() {
  const { state, d, error } = useStore();
  if (error) return <p className="p-6 text-danger">{error}</p>;
  if (!state || !d) return <p className="p-6 text-muted">กำลังโหลด…</p>;

  const lanes = physicalLanes(state.settings.bride_side);
  const rows = Math.max(0, ...state.tables.map((t) => t.pos + 1));
  const at = new Map(state.tables.map((t) => [`${t.lane}:${t.pos}`, t]));
  const ordered = [...state.tables].sort((a, b) => d.numbers.get(a.id)! - d.numbers.get(b.id)!);

  return (
    <>
      <style>{`@page { size: A4 portrait; margin: 10mm; }`}</style>
      <div className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-paper p-3">
        <button onClick={() => window.print()} className="min-h-11 rounded-xl bg-accent px-5 font-medium text-white">
          พิมพ์
        </button>
        <span className="text-sm text-muted">A4 แนวตั้ง</span>
      </div>

      <div className="mx-auto max-w-[190mm] bg-white p-4 text-ink print:p-0">
        <h1 className="mb-1 text-center text-lg font-bold">ผังโต๊ะ งานแต่งอาท & โดม · 14 พ.ย.</h1>
        <p className="mb-3 text-center text-xs text-muted">
          แขก {d.stats.people} คน · {state.tables.length} โต๊ะ
        </p>
        <div className="mb-2 rounded bg-accent py-1.5 text-center text-sm font-semibold tracking-widest text-white">เวที</div>
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: rows }, (_, pos) =>
            lanes.map((lane) => {
              const t = at.get(`${lane}:${pos}`);
              if (!t) return <div key={`${lane}:${pos}`} />;
              const sign = t.sign_id ? d.signById.get(t.sign_id) : undefined;
              const n = (d.guestsByTable.get(t.id) ?? []).filter((g) => g.kind === "guest").length;
              return (
                <div key={t.id} className="flex items-center gap-2 rounded border-2 px-2 py-1" style={{ borderColor: sign?.color ?? "#ccc" }}>
                  <span className="w-7 text-center text-lg font-bold">{d.numbers.get(t.id)}</span>
                  <span className="min-w-0 flex-1 text-[10pt] leading-tight">
                    <span className="block truncate font-medium" style={{ color: sign?.color }}>
                      {sign?.label ?? "จองไว้"}
                    </span>
                    <span className="text-[8pt] text-muted">{n} คน</span>
                  </span>
                </div>
              );
            }),
          )}
        </div>

        <div className="mt-6 columns-3 gap-3 print:break-before-page">
          {ordered.map((t) => {
            const sign = t.sign_id ? d.signById.get(t.sign_id) : undefined;
            const occ = d.guestsByTable.get(t.id) ?? [];
            return (
              <div key={t.id} className="mb-3 break-inside-avoid rounded border border-line p-2 text-[9pt] leading-snug">
                <div className="mb-1 flex items-baseline gap-1.5 border-b border-line pb-1">
                  <b className="text-[12pt]">โต๊ะ {d.numbers.get(t.id)}</b>
                  <span className="truncate" style={{ color: sign?.color }}>
                    {sign?.label ?? ""}
                  </span>
                </div>
                <ol className="list-decimal pl-4">
                  {occ.map((g) => (
                    <li key={g.id} className={g.kind === "reserved" ? "text-muted" : ""}>
                      {guestLabel(g, g.party_id ? d.partyById.get(g.party_id) : undefined)}
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
