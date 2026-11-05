"use client";

import { useState } from "react";
import { driftLabel, fmtTime, parseTime, type TimedItem } from "@/lib/schedule";
import { useStore } from "@/lib/store";
import { Button } from "./ui";

function DriftChip({ drift, target }: { drift: number | null; target: number | null }) {
  if (target === null || drift === null) return null;
  const tone = drift > 0 ? "bg-danger text-white" : drift < 0 ? "bg-unsure/15 text-unsure" : "bg-ok/10 text-ok";
  return (
    <span className={`inline-block rounded-full px-2 text-[11px] font-medium leading-5 ${tone}`}>
      กำหนด {fmtTime(target)}
      {drift !== 0 && ` · ${driftLabel(drift)}`}
    </span>
  );
}

export function ScheduleView() {
  const { state, d, openSheet, canEdit, busy, moveScheduleItem, setScheduleStart } = useStore();
  const [ordering, setOrdering] = useState(false);
  if (!state || !d) return null;

  const items = d.schedule;
  const end = items.length ? items[items.length - 1].end : state.settings.schedule_start;
  const nextSort = (i: number) => {
    const next = items.slice(i + 1).find((x) => x.item.kind === "section");
    return next ? next.item.sort_order : Math.max(0, ...items.map((x) => x.item.sort_order)) + 1;
  };

  const row = (t: TimedItem, i: number) => {
    const { item } = t;
    const arrows = ordering && (
      <span className="flex shrink-0 gap-1 text-ink">
        <button disabled={busy || i === 0} aria-label="เลื่อนขึ้น" className="size-10 rounded-lg border border-line bg-card text-base disabled:opacity-30" onClick={() => void moveScheduleItem(item.id, -1)}>
          ↑
        </button>
        <button disabled={busy || i === items.length - 1} aria-label="เลื่อนลง" className="size-10 rounded-lg border border-line bg-card text-base disabled:opacity-30" onClick={() => void moveScheduleItem(item.id, 1)}>
          ↓
        </button>
      </span>
    );
    const open = () => !ordering && openSheet({ type: "scheduleItem", id: item.id });

    if (item.kind === "section") {
      return (
        <div className={`flex items-center gap-2 rounded-xl bg-accent px-3 py-2 text-white ${i ? "mt-5" : ""}`}>
          <button onClick={open} className="min-w-0 flex-1 text-left">
            <span className="block text-sm font-bold">{item.title || "(ไม่มีชื่อช่วง)"}</span>
            <span className="block text-xs text-white/80 tabular-nums">
              {fmtTime(t.start)} – {fmtTime(t.end)}
            </span>
          </button>
          {t.drift !== null && t.drift !== 0 && !ordering && (
            <span className="shrink-0 rounded-full bg-white px-2 text-[11px] font-medium leading-5 text-danger">{driftLabel(t.drift)}</span>
          )}
          {arrows}
        </div>
      );
    }

    const brk = item.kind === "break";
    const chosen = item.people.length;
    return (
      <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${brk ? "border-dashed border-line bg-paper" : "border-line bg-card"}`}>
        <button onClick={open} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <span className="w-12 shrink-0 pt-0.5 tabular-nums leading-tight">
            <span className="block text-sm font-semibold">{fmtTime(t.start)}</span>
            <span className="block text-xs text-muted">{fmtTime(t.end)}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block text-sm ${brk ? "text-muted" : "font-medium"}`}>
              {t.no !== null ? `${t.no}. ` : "– "}
              {item.title || "(ไม่มีชื่อ)"}
            </span>
            {item.detail && <span className="line-clamp-2 whitespace-pre-line text-xs text-muted">{item.detail}</span>}
            {(item.has_people || item.target !== null) && (
              <span className="mt-1 flex flex-wrap gap-1">
                <DriftChip drift={t.drift} target={item.target} />
                {item.has_people && (
                  <span
                    className={`inline-block rounded-full px-2 text-[11px] font-medium leading-5 ${
                      item.people_count !== null && chosen !== item.people_count ? "bg-unsure/15 text-unsure" : "bg-accent-soft text-accent"
                    }`}
                  >
                    ผู้ร่วมพิธี {chosen}
                    {item.people_count !== null && `/${item.people_count}`} คน
                  </span>
                )}
              </span>
            )}
          </span>
          <span className="shrink-0 pt-0.5 text-xs tabular-nums text-muted">{item.minutes} นาที</span>
        </button>
        {arrows}
      </div>
    );
  };

  return (
    <div className="px-3 pb-4">
      <div className="mb-3 flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-muted">
          เริ่ม{" "}
          {canEdit ? (
            <input
              type="time"
              key={state.settings.schedule_start}
              defaultValue={fmtTime(state.settings.schedule_start).padStart(5, "0")}
              className="rounded-lg border border-line bg-card px-1.5 py-0.5 font-semibold text-ink tabular-nums"
              onBlur={(e) => {
                const min = parseTime(e.target.value);
                if (min !== null && min !== state.settings.schedule_start) void setScheduleStart(min);
              }}
            />
          ) : (
            <b className="text-ink tabular-nums">{fmtTime(state.settings.schedule_start)}</b>
          )}{" "}
          · จบ <b className="text-ink tabular-nums">{fmtTime(end)}</b>
        </p>
        {canEdit && items.length > 1 && (
          <Button variant={ordering ? "primary" : "default"} className="min-h-9 shrink-0 px-3" onClick={() => setOrdering(!ordering)}>
            {ordering ? "เสร็จ" : "จัดลำดับ"}
          </Button>
        )}
      </div>

      {items.length === 0 && <p className="py-10 text-center text-sm text-muted">ยังไม่มีกำหนดการ</p>}

      <ul className="space-y-1.5">
        {items.map((t, i) => {
          const lastInSection = i === items.length - 1 || items[i + 1].item.kind === "section";
          return (
            <li key={t.item.id}>
              {row(t, i)}
              {canEdit && !ordering && lastInSection && (
                <button
                  className="mt-1.5 min-h-10 w-full rounded-xl border border-dashed border-line text-xs font-medium text-accent active:bg-accent-soft"
                  onClick={() => openSheet({ type: "scheduleItem", id: null, at: nextSort(i), kind: "step" })}
                >
                  + เพิ่มขั้นตอนในช่วงนี้
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {canEdit && !ordering && (
        <Button className="mt-5 w-full" variant="primary" onClick={() => openSheet({ type: "scheduleItem", id: null, kind: "section" })}>
          + เพิ่มช่วงใหม่
        </Button>
      )}
    </div>
  );
}
