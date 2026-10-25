"use client";

import { useEffect, useRef } from "react";
import { physicalLanes } from "@/lib/layout";
import { useStore } from "@/lib/store";
import type { Lane, Table } from "@/lib/types";
import { WarnBadge } from "./ui";

const LANE_TITLE: Record<Lane, string> = { bride: "ฝั่งเจ้าสาว", middle: "แถวกลาง", groom: "ฝั่งเจ้าบ่าว" };

export function MapView({ highlight, compact }: { highlight?: string | null; compact?: boolean }) {
  const { state, d, moving, canEdit } = useStore();
  if (!state || !d) return null;
  const lanes = physicalLanes(state.settings.bride_side);
  // "+ เพิ่มโต๊ะ" sits in the first empty cell after the end of each lane
  const laneEnd = Object.fromEntries(lanes.map((l) => [l, Math.max(-1, ...state.tables.filter((t) => t.lane === l).map((t) => t.pos)) + 1]));
  const showAdd = canEdit && !compact && !moving;
  const rows = Math.max(0, ...state.tables.map((t) => t.pos + 1), ...(showAdd ? lanes.map((l) => laneEnd[l] + 1) : []));
  const at = new Map(state.tables.map((t) => [`${t.lane}:${t.pos}`, t]));

  return (
    <div className={compact ? "" : "px-3 pb-4"}>
      <div className={`mx-auto mb-3 rounded-xl bg-accent text-center font-semibold tracking-widest text-white ${compact ? "py-1 text-xs" : "py-2.5 text-sm"}`}>
        เวที
      </div>
      {!compact && state.tables.length > 0 && (
        <div className="mb-2 text-center text-xs text-muted">
          เช็คแล้ว <b className="text-ok">{state.tables.filter((t) => t.checked_at).length}</b> / {state.tables.length} โต๊ะ
        </div>
      )}
      {!compact && (
        <div className="mb-1 grid grid-cols-3 gap-2 text-center text-[11px] font-medium text-muted">
          {lanes.map((l) => (
            <div key={l}>{LANE_TITLE[l]}</div>
          ))}
        </div>
      )}
      {rows === 0 && !compact && (
        <p className="py-10 text-center text-sm text-muted">ยังไม่มีโต๊ะ</p>
      )}
      <div className={`grid grid-cols-3 ${compact ? "gap-1" : "gap-2"}`}>
        {Array.from({ length: rows }, (_, pos) =>
          lanes.map((lane) => {
            const t = at.get(`${lane}:${pos}`);
            if (t) return <TableCard key={t.id} table={t} compact={compact} highlight={highlight === t.id} />;
            if (showAdd && pos === laneEnd[lane]) return <AddTableCell key={`add:${lane}`} lane={lane} />;
            return <div key={`${lane}:${pos}`} />;
          }),
        )}
      </div>
    </div>
  );
}

function AddTableCell({ lane }: { lane: Lane }) {
  const { addTable, notify, busy } = useStore();
  return (
    <button
      disabled={busy}
      onClick={async () => {
        await addTable(lane);
        notify(`เพิ่มโต๊ะต่อท้าย${LANE_TITLE[lane]}แล้ว — แตะโต๊ะเพื่อเลือกป้าย`);
      }}
      className="flex min-h-[92px] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line text-muted active:bg-card disabled:opacity-40"
    >
      <span className="text-2xl leading-none">+</span>
      <span className="text-xs">เพิ่มโต๊ะ</span>
    </button>
  );
}

function TableCard({ table, compact, highlight }: { table: Table; compact?: boolean; highlight?: boolean }) {
  const { state, d, openSheet, moving, moveTo, moveTable, focusTable } = useStore();
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
  const warn = d.warnings.get(table.id)?.shown ?? "none";
  const num = d.numbers.get(table.id);
  const free = cap - people;
  const canDrop = !moving ? false : moving.fromTable ? moving.fromTable !== table.id : free >= moving.guestIds.length;

  const onTap = () => {
    if (!moving) return openSheet({ type: "table", id: table.id });
    if (!moving.fromTable) return void moveTo(table.id);
    if (moving.fromTable === table.id) return;
    const from = d.numbers.get(moving.fromTable);
    if (people > 0 && !confirm(`ย้ายทั้งโต๊ะ ${from} ไปแทนที่โต๊ะ ${num}?
คนเดิมในโต๊ะ ${num} (${people} คน) จะไปอยู่ใน “รอดำเนินการ”`)) return;
    void moveTable(moving.fromTable, table.id);
  };

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
      onClick={onTap}
      className={`relative flex min-h-[92px] flex-col items-center justify-center gap-1 rounded-2xl border-2 bg-card px-1 py-2 text-center shadow-sm active:scale-[0.97] ${
        focused || highlight ? "flash" : ""
      } ${moving && !canDrop ? "opacity-35" : ""} ${moving && canDrop ? "ring-2 ring-accent/50" : ""}`}
      style={{
        borderColor: border,
        background:
          warn === "wrong"
            ? "color-mix(in srgb, var(--color-danger) 7%, white)"
            : table.checked_at
              ? "color-mix(in srgb, var(--color-ok) 9%, white)"
              : undefined,
      }}
    >
      <span className="absolute right-1.5 top-1.5">
        <WarnBadge level={warn} />
      </span>
      {table.checked_at && (
        <span className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-ok text-[11px] font-bold text-white" title="เช็คแล้ว">
          ✓
        </span>
      )}
      <span className="text-xl font-bold leading-none">{num}</span>
      <span
        className="max-w-full truncate rounded-full px-1.5 text-[11px] font-medium leading-5 text-white"
        style={{ background: sign?.color ?? "#a8a29e" }}
      >
        {sign?.label ?? "ไม่มีป้าย"}
      </span>
      <span className={`text-xs ${people > cap ? "font-bold text-danger" : people === cap ? "text-muted" : "font-semibold text-ink"}`}>
        {people}/{cap}
        {reserved > 0 && <span className="text-muted"> +จอง {reserved}</span>}
      </span>
    </button>
  );
}
