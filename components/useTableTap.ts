"use client";

import { useStore } from "@/lib/store";

/** What tapping a table does, shared by the 2D map and the 3D hall. */
export function useTableTap() {
  const { state, d, moving, moveTo, moveTable, openSheet } = useStore();

  const canDrop = (tableId: string): boolean => {
    if (!moving || !state || !d) return false;
    if (moving.relocate) return false;
    if (moving.fromTable) return moving.fromTable !== tableId;
    const people = (d.guestsByTable.get(tableId) ?? []).filter((g) => g.kind === "guest" && !moving.guestIds.includes(g.id)).length;
    return state.settings.seats_per_table - people >= moving.guestIds.length;
  };

  const tap = (tableId: string) => {
    if (!d) return;
    if (!moving) return openSheet({ type: "table", id: tableId });
    if (moving.relocate) return;
    if (!moving.fromTable) return void moveTo(tableId);
    if (moving.fromTable === tableId) return;
    const from = d.numbers.get(moving.fromTable);
    const num = d.numbers.get(tableId);
    const people = (d.guestsByTable.get(tableId) ?? []).filter((g) => g.kind === "guest").length;
    if (people > 0 && !confirm(`ย้ายทั้งโต๊ะ ${from} ไปแทนที่โต๊ะ ${num}?\nคนเดิมในโต๊ะ ${num} (${people} คน) จะไปอยู่ใน “รอดำเนินการ”`)) return;
    void moveTable(moving.fromTable, tableId);
  };

  return { tap, canDrop };
}
