// Start times for the schedule. Pure functions (no DB, no React).
import type { ScheduleItem, SchedulePerson } from "./types";

export interface TimedItem {
  item: ScheduleItem;
  start: number;
  /** a section ends where the next section starts */
  end: number;
  /** step number within its section; null for sections and breaks */
  no: number | null;
  /** start minus target: > 0 late, < 0 early, null when there is no target */
  drift: number | null;
}

/** Each item starts when everything before it is done. */
export function timeline(items: ScheduleItem[], dayStart: number): TimedItem[] {
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);
  let t = dayStart;
  let no = 0;
  const out: TimedItem[] = sorted.map((item) => {
    const start = t;
    if (item.kind === "section") no = 0;
    else t += item.minutes;
    return {
      item,
      start,
      end: t,
      no: item.kind === "step" ? ++no : null,
      drift: item.target === null ? null : start - item.target,
    };
  });
  // a section spans up to the next section (or the end of the day)
  for (let i = 0; i < out.length; i++) {
    if (out[i].item.kind !== "section") continue;
    const next = out.slice(i + 1).find((x) => x.item.kind === "section");
    out[i].end = next ? next.start : t;
  }
  return out;
}

export function fmtTime(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** "8:40", "08.40", "840" → minutes after midnight; null when it is not a time */
export function parseTime(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2})[:.]?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export function driftLabel(drift: number): string {
  if (drift === 0) return "ตรงเวลา";
  return drift > 0 ? `ช้าไป ${drift} นาที` : `เร็วไป ${-drift} นาที`;
}

/** Gift boxes the list uses: one per entry, the parents' special boxes aside. */
export function boxesUsed(people: SchedulePerson[]): number {
  return people.filter((p) => !p.special).length;
}

/** Guest ids already in the list. */
export function takenGuests(people: SchedulePerson[]): string[] {
  return people.flatMap((p) => ("guest_id" in p ? [p.guest_id] : "guest_ids" in p ? p.guest_ids : []));
}
