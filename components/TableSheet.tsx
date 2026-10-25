"use client";

import { groupKey, guestLabel } from "@/lib/layout";
import { useStore } from "@/lib/store";
import { Sheet } from "./Sheet";
import { Button, StatusDot, WarnBadge } from "./ui";

export function TableSheet({ id }: { id: string }) {
  const { state, d, closeSheet, openSheet, setTableSign, reserveSeat, unreserve, deleteTable, busy } = useStore();
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
          {warning && <WarnBadge level={warning.level} />}
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
      {warning?.level === "wrong" && (
        <div className="mb-3 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          ⚠️ มีคนที่ไม่ใช่กลุ่ม “{sign?.label ?? "-"}” นั่งโต๊ะนี้ (ไฮไลต์สีแดง)
        </div>
      )}
      {warning?.level === "mixed" && (
        <div className="mb-3 rounded-xl border border-mixed/30 bg-mixed/5 px-3 py-2 text-sm text-mixed">โต๊ะนี้มีหลายหมู่บ้านหรือหลายเจ้าภาพนั่งรวมกัน</div>
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
          const wrong = warning?.wrongGuestIds.has(g.id);
          const odd = !wrong && warning?.level === "mixed" && p && groupKey(p) !== mainGroup;
          const pSign = p?.sign_id ? d.signById.get(p.sign_id) : undefined;
          return (
            <li key={seat}>
              <button
                onClick={() => p && openSheet({ type: "party", id: p.id })}
                className={`flex min-h-12 w-full items-center gap-3 px-3 py-1.5 text-left text-sm active:bg-paper ${wrong ? "bg-danger/8" : ""}`}
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
                <span className="text-muted">›</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex justify-end">
        <Button
          variant="danger"
          onClick={() => {
            if (confirm(`ลบโต๊ะ ${d.numbers.get(id)}? คนในโต๊ะจะกลับไปอยู่ “ยังไม่มีโต๊ะ”`)) void deleteTable(id);
          }}
        >
          ลบโต๊ะนี้
        </Button>
      </div>
    </Sheet>
  );
}
