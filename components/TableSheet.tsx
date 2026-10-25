"use client";

import { useState } from "react";
import { groupKey, guestLabel, partyLabel } from "@/lib/layout";
import { useStore } from "@/lib/store";
import { Sheet } from "./Sheet";
import { Button, StatusDot, WarnBadge } from "./ui";

export function TableSheet({ id }: { id: string }) {
  const { state, d, closeSheet, openSheet, setTableSign, reserveSeat, unreserve, deleteTable, moveTo, ackWarning, busy } = useStore();
  // guest whose "เอาออก" was tapped and whose party has several people here: ask whole group or just them
  const [askRemove, setAskRemove] = useState<string | null>(null);
  if (!state || !d) return null;
  const table = d.tableById.get(id);
  if (!table) return null;

  const cap = state.settings.seats_per_table;
  const occ = d.guestsByTable.get(id) ?? [];
  const bySeat = new Map(occ.map((g) => [g.seat_no, g]));
  const warning = d.warnings.get(id);
  const people = occ.filter((g) => g.kind === "guest").length;
  const sign = table.sign_id ? d.signById.get(table.sign_id) : undefined;

  // the most common group at the table, to point out who is "different"
  const counts = new Map<string, number>();
  for (const g of occ) {
    const p = g.party_id ? d.partyById.get(g.party_id) : undefined;
    if (p) counts.set(groupKey(p), (counts.get(groupKey(p)) ?? 0) + 1);
  }
  const mainGroup = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  return (
    <Sheet
      onClose={closeSheet}
      title={
        <span className="flex items-center gap-2">
          โต๊ะ {d.numbers.get(id)}
          <span className="text-sm font-normal text-muted">
            {people}/{cap} คน
          </span>
          {warning && <WarnBadge level={warning.shown} />}
        </span>
      }
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => openSheet({ type: "pick", tableId: id })} disabled={people >= cap}>
            + เพิ่มคนลงโต๊ะ
          </Button>
          <Button onClick={() => void reserveSeat(id)} disabled={occ.length >= cap || busy}>
            จองที่
          </Button>
        </div>
      }
    >
      {warning && warning.shown !== "none" && (
        <div
          className={`mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
            warning.shown === "wrong" ? "border-danger/30 bg-danger/5 text-danger" : "border-mixed/30 bg-mixed/5 text-mixed"
          }`}
        >
          <span className="flex-1">
            {warning.shown === "wrong"
              ? `⚠️ มีคนที่ไม่ใช่กลุ่ม “${sign?.label ?? "-"}” นั่งโต๊ะนี้ (ไฮไลต์สีแดง)`
              : "โต๊ะนี้มีหลายหมู่บ้านหรือหลายเจ้าภาพนั่งรวมกัน"}
          </span>
          <button
            disabled={busy}
            onClick={() => void ackWarning(id, warning.signature)}
            className="min-h-9 shrink-0 rounded-lg border border-current/30 bg-card px-2.5 text-xs font-medium disabled:opacity-40"
          >
            ไม่เป็นไร ซ่อน
          </button>
        </div>
      )}
      {warning && warning.level !== "none" && warning.shown === "none" && (
        <div className="mb-3 flex items-center gap-2 text-xs text-muted">
          <span className="flex-1">ซ่อนคำเตือนโต๊ะนี้แล้ว (จะกลับมาถ้ามีกลุ่มอื่นย้ายเข้ามา)</span>
          <button disabled={busy} onClick={() => void ackWarning(id, null)} className="min-h-9 px-1 font-medium text-accent">
            แสดงอีกครั้ง
          </button>
        </div>
      )}

      <div className="mb-1 text-xs font-medium text-muted">ป้ายโต๊ะ</div>
      <div className="-mx-1 mb-4 flex flex-wrap gap-1.5">
        {state.signs.map((s) => {
          const active = s.id === table.sign_id;
          return (
            <button
              key={s.id}
              onClick={() => void setTableSign(id, active ? null : s.id)}
              className={`min-h-9 rounded-full border-2 px-3 text-sm font-medium ${active ? "text-white" : "bg-card"}`}
              style={{ borderColor: s.color, background: active ? s.color : undefined, color: active ? "#fff" : s.color }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="mb-1 text-xs font-medium text-muted">ที่นั่ง</div>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
        {Array.from({ length: cap }, (_, i) => i + 1).map((seat) => {
          const g = bySeat.get(seat);
          if (!g)
            return (
              <li key={seat} className="flex min-h-12 items-center gap-3 px-3 text-sm text-muted">
                <span className="w-5 text-right tabular-nums">{seat}</span>
                <span>ว่าง</span>
              </li>
            );
          if (g.kind === "reserved")
            return (
              <li key={seat} className="flex min-h-12 items-center gap-3 px-3 text-sm">
                <span className="w-5 text-right tabular-nums text-muted">{seat}</span>
                <span className="flex-1 rounded-lg border border-dashed border-muted/50 px-2 py-1 text-muted">{g.display_name || "จองไว้"}</span>
                <button onClick={() => void unreserve(g.id)} className="min-h-10 px-2 text-xs text-accent">
                  ยกเลิก
                </button>
              </li>
            );
          const p = g.party_id ? d.partyById.get(g.party_id) : undefined;
          const wrong = warning?.shown === "wrong" && warning.wrongGuestIds.has(g.id);
          const odd = !wrong && warning?.shown === "mixed" && p && groupKey(p) !== mainGroup;
          const pSign = p?.sign_id ? d.signById.get(p.sign_id) : undefined;
          const groupHere = occ.filter((x) => x.party_id && x.party_id === g.party_id);
          const removeOne = () => void moveTo(null, [g.id], guestLabel(g, p));
          const removeGroup = () => void moveTo(null, groupHere.map((x) => x.id), `${p ? partyLabel(p) : ""} (${groupHere.length} คน)`);
          if (askRemove === g.id)
            return (
              <li key={seat} className="flex min-h-12 flex-wrap items-center gap-2 bg-paper px-3 py-2 text-sm">
                <span className="w-full truncate text-xs text-muted">เอา “{guestLabel(g, p)}” ออกจากโต๊ะ:</span>
                <button onClick={() => { setAskRemove(null); removeGroup(); }} className="min-h-10 rounded-lg bg-accent px-3 font-medium text-white">
                  ทั้งกลุ่ม ({groupHere.length} คน)
                </button>
                <button onClick={() => { setAskRemove(null); removeOne(); }} className="min-h-10 rounded-lg border border-line bg-card px-3">
                  เฉพาะคนนี้
                </button>
                <button onClick={() => setAskRemove(null)} className="ml-auto min-h-10 px-2 text-muted">
                  ยกเลิก
                </button>
              </li>
            );
          return (
            <li key={seat} className={`flex items-stretch ${wrong ? "bg-danger/8" : ""}`}>
              <button
                onClick={() => p && openSheet({ type: "party", id: p.id })}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-1.5 pl-3 text-left text-sm active:bg-paper"
              >
                <span className="w-5 text-right tabular-nums text-muted">{seat}</span>
                <StatusDot status={g.status} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${wrong ? "font-semibold text-danger" : ""}`}>{guestLabel(g, p)}</span>
                  <span className={`block truncate text-xs ${wrong ? "text-danger" : odd ? "text-mixed" : "text-muted"}`}>
                    {p?.nickname && p.name ? `${p.nickname} · ` : ""}
                    {p?.host} · {p?.village || "-"}
                    {wrong && ` · ${pSign?.label ?? "ไม่มีป้าย"}`}
                  </span>
                </span>
              </button>
              <button
                disabled={busy}
                onClick={() => (groupHere.length > 1 ? setAskRemove(g.id) : removeOne())}
                className="shrink-0 px-3 text-xs font-medium text-accent active:bg-accent-soft disabled:opacity-40"
              >
                เอาออก
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex justify-end">
        <Button
          variant="danger"
          onClick={() => {
            if (confirm(`ลบโต๊ะ ${d.numbers.get(id)}? คนในโต๊ะจะไปอยู่ใน “รอดำเนินการ”`)) void deleteTable(id);
          }}
        >
          ลบโต๊ะนี้
        </Button>
      </div>
    </Sheet>
  );
}
