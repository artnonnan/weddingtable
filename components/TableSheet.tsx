"use client";

import { useState } from "react";
import { groupKey, guestLabel, partyLabel } from "@/lib/layout";
import { SOLO_COLOR } from "@/lib/partyColors";
import { useStore } from "@/lib/store";
import { LANE_LABEL } from "@/lib/types";
import { Sheet } from "./Sheet";
import { Button, StatusDot, WarnBadge } from "./ui";

export function TableSheet({ id }: { id: string }) {
  const { state, d, closeSheet, openSheet, setTableSign, reserveSeat, unreserve, deleteTable, moveTo, ackWarning, startMove, setChecked, setSeatOrder, shiftLane, canEdit, busy } = useStore();
  // guest whose "เอาออก" was tapped and whose party has several people here: ask whole group or just them
  const [askRemove, setAskRemove] = useState<string | null>(null);
  // seat number tapped first when re-ordering; the next seat tapped is where that person goes
  const [pickSeat, setPickSeat] = useState<number | null>(null);
  if (!state || !d) return null;
  const table = d.tableById.get(id);
  if (!table) return null;

  const cap = state.settings.seats_per_table;
  const occ = d.guestsByTable.get(id) ?? [];
  const bySeat = new Map(occ.map((g) => [g.seat_no, g]));
  const warning = d.warnings.get(id);
  const people = occ.filter((g) => g.kind === "guest").length;
  const sign = table.sign_id ? d.signById.get(table.sign_id) : undefined;
  const gapInFront = table.pos > 0 && !state.tables.some((t) => t.lane === table.lane && t.pos === table.pos - 1);

  // the most common group at the table, to point out who is "different"
  const counts = new Map<string, number>();
  for (const g of occ) {
    const p = g.party_id ? d.partyById.get(g.party_id) : undefined;
    if (p) counts.set(groupKey(p), (counts.get(groupKey(p)) ?? 0) + 1);
  }
  const mainGroup = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const occupantName = (seat: number) => {
    const g = bySeat.get(seat);
    if (!g) return "ว่าง";
    return guestLabel(g, g.party_id ? d.partyById.get(g.party_id) : undefined);
  };
  /** Move the occupant of seat `from` to seat `to`; seats in between shift by one. */
  const reorder = (from: number, to: number) => {
    setPickSeat(null);
    if (from === to) return;
    const slots: (string | null)[] = Array.from({ length: cap }, (_, i) => bySeat.get(i + 1)?.id ?? null);
    const [moved] = slots.splice(from - 1, 1);
    slots.splice(to - 1, 0, moved);
    void setSeatOrder(id, slots, `${occupantName(from)} ที่ ${from} → ${to}`);
  };
  const SeatNo = ({ seat }: { seat: number }) => {
    const filled = bySeat.has(seat);
    const picked = pickSeat === seat;
    return (
      <button
        disabled={!canEdit || busy || (!filled && pickSeat === null)}
        onClick={(e) => {
          e.stopPropagation();
          if (pickSeat === null) setPickSeat(seat);
          else reorder(pickSeat, seat);
        }}
        className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-sm tabular-nums ${
          picked ? "border-accent bg-accent text-white" : filled ? "border-line bg-paper text-ink" : "border-transparent text-muted"
        }`}
        aria-label={`ที่นั่ง ${seat}`}
      >
        {seat}
      </button>
    );
  };
  /** While re-ordering, the whole row is a drop target. */
  const DropCover = ({ seat }: { seat: number }) =>
    pickSeat !== null && pickSeat !== seat ? (
      <button className="absolute inset-0 z-10 bg-accent/5 active:bg-accent/15" onClick={() => reorder(pickSeat, seat)} aria-label={`ย้ายไปที่นั่ง ${seat}`} />
    ) : null;

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
          {canEdit ? (
          <button
            disabled={busy}
            onClick={() => void setChecked(id, !table.checked_at)}
            className={`ml-auto min-h-9 shrink-0 rounded-full border-2 px-3 text-sm font-medium disabled:opacity-40 ${
              table.checked_at ? "border-ok bg-ok text-white" : "border-line bg-card text-muted"
            }`}
          >
            {table.checked_at ? "✓ เช็คแล้ว" : "เช็คแล้ว?"}
          </button>
          ) : (
            table.checked_at && <span className="ml-auto rounded-full bg-ok px-3 py-1 text-sm font-medium text-white">✓ เช็คแล้ว</span>
          )}
        </span>
      }
      footer={
        canEdit && (
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => openSheet({ type: "pick", tableId: id })} disabled={people >= cap}>
            + เพิ่มคนลงโต๊ะ
          </Button>
          <Button onClick={() => void reserveSeat(id)} disabled={occ.length >= cap || busy}>
            จองที่
          </Button>
        </div>
        )
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
          {canEdit && (
          <button
            disabled={busy}
            onClick={() => void ackWarning(id, warning.signature)}
            className="min-h-9 shrink-0 rounded-lg border border-current/30 bg-card px-2.5 text-xs font-medium disabled:opacity-40"
          >
            ไม่เป็นไร ซ่อน
          </button>
          )}
        </div>
      )}
      {canEdit && warning && warning.level !== "none" && warning.shown === "none" && (
        <div className="mb-3 flex items-center gap-2 text-xs text-muted">
          <span className="flex-1">ซ่อนคำเตือนโต๊ะนี้แล้ว (จะกลับมาถ้ามีกลุ่มอื่นย้ายเข้ามา)</span>
          <button disabled={busy} onClick={() => void ackWarning(id, null)} className="min-h-9 px-1 font-medium text-accent">
            แสดงอีกครั้ง
          </button>
        </div>
      )}

      <div className="mb-1 text-xs font-medium text-muted">ป้ายโต๊ะ</div>
      <div className="-mx-1 mb-4 flex flex-wrap gap-1.5">
        {state.signs.filter((s) => canEdit || s.id === table.sign_id).map((s) => {
          const active = s.id === table.sign_id;
          return (
            <button
              key={s.id}
              disabled={!canEdit}
              onClick={() => void setTableSign(id, active ? null : s.id)}
              className={`min-h-9 rounded-full border-2 px-3 text-sm font-medium ${active ? "text-white" : "bg-card"}`}
              style={{ borderColor: s.color, background: active ? s.color : undefined, color: active ? "#fff" : s.color }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted">
        <span>ที่นั่ง</span>
        {canEdit && <span className="font-normal">แตะเลขที่นั่งเพื่อเปลี่ยนลำดับ</span>}
      </div>
      {pickSeat !== null && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-ink px-3 py-2 text-sm text-white">
          <span className="min-w-0 flex-1">
            ย้าย <b>{occupantName(pickSeat)}</b> (ที่ {pickSeat}) ไปที่นั่งไหน? แตะแถวปลายทาง
          </span>
          <button onClick={() => setPickSeat(null)} className="min-h-9 shrink-0 rounded-lg bg-white/15 px-3">
            ยกเลิก
          </button>
        </div>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
        {Array.from({ length: cap }, (_, i) => i + 1).map((seat) => {
          const g = bySeat.get(seat);
          if (!g)
            return (
              <li key={seat} className="relative flex min-h-12 items-center gap-3 px-2 text-sm text-muted">
                <SeatNo seat={seat} />
                <span>ว่าง</span>
                <DropCover seat={seat} />
              </li>
            );
          if (g.kind === "reserved")
            return (
              <li key={seat} className="relative flex min-h-12 items-center gap-3 px-2 text-sm">
                <SeatNo seat={seat} />
                <span className="flex-1 rounded-lg border border-dashed border-muted/50 px-2 py-1 text-muted">{g.display_name || "จองไว้"}</span>
                {canEdit && (
                  <button onClick={() => void unreserve(g.id)} className="min-h-10 px-2 text-xs text-accent">
                    ยกเลิก
                  </button>
                )}
                <DropCover seat={seat} />
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
            <li
              key={seat}
              className={`relative flex items-stretch border-l-[5px] ${wrong ? "bg-danger/8" : ""} ${pickSeat === seat ? "bg-accent-soft" : ""}`}
              // same group colour as the pieces in 3D (grey = came alone)
              style={{ borderLeftColor: d.partyColor.get(g.party_id ?? "") ?? SOLO_COLOR }}
            >
              <span className="flex items-center pl-2">
                <SeatNo seat={seat} />
              </span>
              <button
                onClick={() => p && openSheet({ type: "party", id: p.id })}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-1.5 pl-2 text-left text-sm active:bg-paper"
              >
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
              {canEdit && (
                <button
                  disabled={busy}
                  onClick={() => (groupHere.length > 1 ? setAskRemove(g.id) : removeOne())}
                  className="shrink-0 px-3 text-xs font-medium text-accent active:bg-accent-soft disabled:opacity-40"
                >
                  เอาออก
                </button>
              )}
              <DropCover seat={seat} />
            </li>
          );
        })}
      </ul>

      {canEdit && (
        <>
      <Button
        className="mt-5 w-full border-2 border-accent! text-accent!"
        disabled={busy || occ.length === 0}
        onClick={() => startMove({ guestIds: [], label: `ทั้งโต๊ะ ${d.numbers.get(id)} (${people} คน)`, fromTable: id })}
      >
        ⇄ ย้ายทั้งโต๊ะไปแทนที่โต๊ะอื่น
      </Button>
      <Button
        className="mt-2 w-full"
        disabled={busy}
        onClick={() => startMove({ guestIds: [], label: `โต๊ะ ${d.numbers.get(id)}`, relocate: id })}
      >
        ↕ ย้ายตำแหน่งโต๊ะไปช่องว่าง
      </Button>
      <div className="mt-2 flex gap-2">
        <Button className="flex-1" disabled={busy} onClick={() => void shiftLane(id, 1)}>
          ⤓ แทรกช่องว่างก่อนโต๊ะนี้
        </Button>
        <Button className="flex-1" disabled={busy || !gapInFront} onClick={() => void shiftLane(id, -1)}>
          ⤒ ปิดช่องว่างข้างหน้า
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted">โต๊ะนี้และทุกโต๊ะข้างหลังใน{LANE_LABEL[table.lane]}จะเลื่อน 1 ช่อง · คนย้ายไปพร้อมโต๊ะ เลขโต๊ะนับใหม่</p>

      <div className="mt-10 flex justify-end border-t border-line pt-4">
        <Button
          variant="danger"
          onClick={() => {
            if (confirm(`ลบโต๊ะ ${d.numbers.get(id)}? คนในโต๊ะจะไปอยู่ใน “รอดำเนินการ”`)) void deleteTable(id);
          }}
        >
          ลบโต๊ะนี้
        </Button>
      </div>
        </>
      )}
    </Sheet>
  );
}
