"use client";

import { useEffect, useRef } from "react";
import { physicalLanes } from "@/lib/layout";
import { useStore } from "@/lib/store";
import type { Lane, Table } from "@/lib/types";
import { WarnBadge } from "./ui";

const LANE_TITLE: Record<Lane, string> = { bride: "ฝั่งเจ้าสาว", middle: "แถวกลาง", groom: "ฝั่งเจ้าบ่าว" };

export function MapView({ highlight, compact }: { highlight?: string | null; compact?: boolean }) {
  const { state, d } = useStore();
  if (!state || !d) return null;
  const lanes = physicalLanes(state.settings.bride_side);
  const rows = Math.max(0, ...state.tables.map((t) => t.pos + 1));
  const at = new Map(state.tables.map((t) => [`${t.lane}:${t.pos}`, t]));

  return (
    <div className={compact ? "" : "px-3 pb-4"}>
      <div className={`mx-auto mb-3 rounded-xl bg-accent text-center font-semibold tracking-widest text-white ${compact ? "py-1 text-xs" : "py-2.5 text-sm"}`}>
        เวที
      </div>
      {!compact && (
        <div className="mb-1 grid grid-cols-3 gap-2 text-center text-[11px] font-medium text-muted">
          {lanes.map((l) => (
            <div key={l}>{LANE_TITLE[l]}</div>
          ))}
        </div>
      )}
      {rows === 0 && !compact && (
        <p className="py-10 text-center text-sm text-muted">ยังไม่มีโต๊ะ — ไปที่แท็บ “เพิ่มเติม” แล้วกด “จัดอัตโนมัติ”</p>
      )}
      <div className={`grid grid-cols-3 ${compact ? "gap-1" : "gap-2"}`}>
        {Array.from({ length: rows }, (_, pos) =>
          lanes.map((lane) => {
            const t = at.get(`${lane}:${pos}`);
            return t ? (
              <TableCard key={t.id} table={t} compact={compact} highlight={highlight === t.id} />
            ) : (
              <div key={`${lane}:${pos}`} />
            );
          }),
        )}
      </div>
    </div>
  );
}

function TableCard({ table, compact, highlight }: { table: Table; compact?: boolean; highlight?: boolean }) {
  const { state, d, openSheet, moving, moveTo, focusTable } = useStore();
  const ref = useRef<HTMLButtonElement>(null);
  const focused = focusTable === table.id;

  useEffect(() => {
    if ((focused || highlight) && ref.current) ref.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused, highlight]);

  if (!state || !d) return null;
  const cap = state.settings.seats_per_table;
  const occ = d.guestsByTable.get(table.id) ?? [];
  const people = occ.filter((g) => g.kind === "guest").length;
  const reserved = occ.length - people;
  const sign = table.sign_id ? d.signById.get(table.sign_id) : undefined;
  const warn = d.warnings.get(table.id)?.level ?? "none";
  const num = d.numbers.get(table.id);
  const free = cap - people;
  const canDrop = moving ? free >= moving.guestIds.length : false;

  const border = warn === "wrong" ? "var(--color-danger)" : warn === "mixed" ? "var(--color-mixed)" : (sign?.color ?? "var(--color-line)");

  if (compact) {
    return (
      <div
        className={`flex h-7 items-center justify-center rounded-md text-[11px] font-semibold ${highlight ? "flash text-white" : "text-ink"}`}
        style={{ background: highlight ? "var(--color-accent)" : `color-mix(in srgb, ${sign?.color ?? "#ccc"} 22%, white)` }}
      >
        {num}
      </div>
    );
  }

  return (
    <button
      ref={ref}
      onClick={() => (moving ? void moveTo(table.id) : openSheet({ type: "table", id: table.id }))}
      className={`relative flex min-h-[92px] flex-col items-center justify-center gap-1 rounded-2xl border-2 bg-card px-1 py-2 text-center shadow-sm active:scale-[0.97] ${
        focused || highlight ? "flash" : ""
      } ${moving && !canDrop ? "opacity-35" : ""} ${moving && canDrop ? "ring-2 ring-accent/50" : ""}`}
      style={{ borderColor: border, background: warn === "wrong" ? "color-mix(in srgb, var(--color-danger) 7%, white)" : undefined }}
    >
      <span className="absolute right-1.5 top-1.5">
        <WarnBadge level={warn} />
      </span>
      <span className="text-xl font-bold leading-none">{num}</span>
      <span
        className="max-w-full truncate rounded-full px-1.5 text-[11px] font-medium leading-5 text-white"
        style={{ background: sign?.color ?? "#a8a29e" }}
      >
        {sign?.label ?? "จองไว้/ว่าง"}
      </span>
      <span className={`text-xs ${people > cap ? "font-bold text-danger" : people === cap ? "text-muted" : "font-semibold text-ink"}`}>
        {people}/{cap}
        {reserved > 0 && <span className="text-muted"> +จอง {reserved}</span>}
      </span>
    </button>
  );
}
