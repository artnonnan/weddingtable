"use client";

import { useMemo, useState } from "react";
import { guestLabel, partyLabel } from "@/lib/layout";
import { boxesUsed, driftLabel, fmtTime, parseTime, takenGuests } from "@/lib/schedule";
import { useStore, type ScheduleDraft } from "@/lib/store";
import { searchKey } from "@/lib/thai";
import type { Guest, ScheduleItem, ScheduleKind, SchedulePerson } from "@/lib/types";
import { Sheet } from "./Sheet";
import { Button, Field, inputClass } from "./ui";

const KIND_LABEL: Record<ScheduleKind, string> = { section: "ช่วง", step: "ขั้นตอน", break: "พัก / เปลี่ยนผ่าน" };
const UNIT_LABEL: Record<ScheduleItem["count_unit"], string> = { person: "คน", box: "กล่อง" };

const personKey = (p: SchedulePerson, i: number) => ("guest_id" in p ? p.guest_id : "guest_ids" in p ? p.guest_ids.join() : `name-${i}`);

/** Name for one entry: a guest, a whole party ("คุณลุงสาคร - แม่นีย์ (2 คน)"), some of a party, or a typed name. */
function usePersonLabel() {
  const { state, d } = useStore();
  return (p: SchedulePerson): string => {
    if (!state || !d) return "";
    if ("name" in p) return p.name;
    const ids = "guest_id" in p ? [p.guest_id] : p.guest_ids;
    const guests = ids.map((id) => state.guests.find((g) => g.id === id)).filter((g): g is Guest => !!g);
    if (!guests.length) return "(แขกที่ถูกลบไปแล้ว)";
    const party = guests[0].party_id ? d.partyById.get(guests[0].party_id) : undefined;
    const members = party ? (d.membersByParty.get(party.id) ?? []) : [];
    if (party && guests.length > 1 && guests.every((g) => g.party_id === party.id && !g.display_name)) {
      return `${partyLabel(party)} (${guests.length === members.length ? "" : `${guests.length} จาก `}${members.length} คน)`;
    }
    return guests.map((g) => guestLabel(g, g.party_id ? d.partyById.get(g.party_id) : undefined)).join(" + ");
  };
}

/** "20/26 กล่อง" — what the list uses against what the step needs. */
export function countText(item: Pick<ScheduleItem, "people" | "people_count" | "count_unit">): { text: string; tone: "ok" | "short" | "over" } {
  const used = item.count_unit === "box" ? boxesUsed(item.people) : item.people.length;
  const need = item.people_count;
  const text = `${item.count_unit === "box" ? "ของรับไหว้" : "ผู้ร่วมพิธี"} ${used}${need !== null ? `/${need}` : ""} ${UNIT_LABEL[item.count_unit]}`;
  return { text, tone: need === null || used === need ? "ok" : used < need ? "short" : "over" };
}

/** One schedule item: view it, or (editors) change it, its people, or delete it. */
export function ScheduleItemSheet({ id, at, kind }: { id: string | null; at?: number; kind?: ScheduleKind }) {
  const { state, d, closeSheet, canEdit, busy, saveScheduleItem, deleteScheduleItem, notify } = useStore();
  const label = usePersonLabel();
  const item = id ? state?.schedule.find((x) => x.id === id) : undefined;
  const timed = id ? d?.schedule.find((x) => x.item.id === id) : undefined;
  const [draft, setDraft] = useState<ScheduleDraft>(
    item
      ? {
          kind: item.kind,
          title: item.title,
          detail: item.detail,
          minutes: item.minutes,
          target: item.target,
          has_people: item.has_people,
          people_count: item.people_count,
          people: item.people,
          count_unit: item.count_unit,
        }
      : { kind: kind ?? "step", title: "", detail: "", minutes: kind === "section" ? 0 : 5, target: null, has_people: false, people_count: null, people: [], count_unit: "person" },
  );
  const [picking, setPicking] = useState(false);
  const [typed, setTyped] = useState("");
  const [typedSpecial, setTypedSpecial] = useState(false);
  if (!state || !d || (id && !item)) return null;

  const set = (patch: Partial<ScheduleDraft>) => setDraft((x) => ({ ...x, ...patch }));
  const section = draft.kind === "section";
  const box = draft.count_unit === "box";
  const unit = UNIT_LABEL[draft.count_unit];
  const used = box ? boxesUsed(draft.people) : draft.people.length;
  const left = draft.people_count === null ? null : draft.people_count - used;
  const movePerson = (i: number, delta: number) => {
    const people = [...draft.people];
    const [p] = people.splice(i, 1);
    people.splice(i + delta, 0, p);
    set({ people });
  };

  if (picking) {
    return (
      <GuestPicker
        box={box}
        left={left}
        taken={takenGuests(draft.people)}
        onDone={(groups) => {
          const added: SchedulePerson[] = groups.map((ids) => (ids.length === 1 ? { guest_id: ids[0] } : { guest_ids: ids }));
          set({ people: [...draft.people, ...added] });
          setPicking(false);
        }}
        onCancel={() => setPicking(false)}
      />
    );
  }

  if (!canEdit) {
    const count = item ? countText(item) : null;
    return (
      <Sheet onClose={closeSheet} title={item?.title}>
        {timed && (
          <p className="mb-2 text-sm tabular-nums">
            {fmtTime(timed.start)} – {fmtTime(timed.end)} {!section && <span className="text-muted">({item?.minutes} นาที)</span>}
          </p>
        )}
        {item?.target !== null && timed?.drift != null && (
          <p className={`mb-2 text-sm ${timed.drift > 0 ? "text-danger" : "text-muted"}`}>
            กำหนดเริ่ม {fmtTime(item!.target!)} · {driftLabel(timed.drift)}
          </p>
        )}
        {item?.detail && <p className="mb-4 whitespace-pre-line text-sm text-muted">{item.detail}</p>}
        {item?.has_people && count && (
          <>
            <div className="mb-1 text-xs font-medium text-muted">{count.text}</div>
            <ol className="divide-y divide-line rounded-xl border border-line bg-card empty:hidden">
              {item.people.map((p, i) => (
                <li key={personKey(p, i)} className="flex min-h-11 items-center gap-2 px-3 text-sm">
                  <span className="w-6 shrink-0 text-muted tabular-nums">{i + 1}.</span>
                  <span className="min-w-0 flex-1">{label(p)}</span>
                  {p.special && <SpecialTag />}
                </li>
              ))}
            </ol>
          </>
        )}
      </Sheet>
    );
  }

  const save = async () => {
    const people_count = draft.has_people ? draft.people_count : null;
    const people = draft.has_people ? draft.people : [];
    if (await saveScheduleItem(id, { ...draft, title: draft.title.trim(), detail: draft.detail.trim(), minutes: section ? 0 : draft.minutes, people_count, people }, at)) closeSheet();
  };

  const addTyped = () => {
    const special = box && typedSpecial;
    if (box && !special && left !== null && left <= 0) return notify(`ของรับไหว้ครบ ${draft.people_count} กล่องแล้ว`);
    set({ people: [...draft.people, special ? { name: typed.trim(), special } : { name: typed.trim() }] });
    setTyped("");
  };

  return (
    <Sheet
      onClose={closeSheet}
      title={id ? `แก้${KIND_LABEL[draft.kind]}` : `เพิ่ม${KIND_LABEL[draft.kind]}`}
      footer={
        <Button className="w-full" variant="primary" disabled={!draft.title.trim() || busy} onClick={() => void save()}>
          บันทึก
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(KIND_LABEL) as ScheduleKind[]).map((k) => (
            <Button key={k} className="px-2" variant={draft.kind === k ? "primary" : "default"} onClick={() => set({ kind: k })}>
              {KIND_LABEL[k]}
            </Button>
          ))}
        </div>

        <Field label={section ? "ชื่อช่วง" : "ชื่อขั้นตอน"}>
          <input className={inputClass} value={draft.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>

        {!section && (
          <Field label="รายละเอียด">
            <textarea className={`${inputClass} min-h-24 py-2`} value={draft.detail} onChange={(e) => set({ detail: e.target.value })} />
          </Field>
        )}

        {!section && (
          <Field label={`ใช้เวลา (นาที)${timed ? ` · ตอนนี้ ${fmtTime(timed.start)} – ${fmtTime(timed.start + draft.minutes)}` : ""}`}>
            <div className="flex items-center gap-1">
              <button className="size-11 shrink-0 rounded-xl border border-line bg-card" onClick={() => set({ minutes: Math.max(0, draft.minutes - 5) })}>
                −5
              </button>
              <input
                className={`${inputClass} text-center`}
                inputMode="numeric"
                value={draft.minutes}
                onChange={(e) => set({ minutes: Math.min(600, Math.max(0, Number.parseInt(e.target.value || "0", 10) || 0)) })}
              />
              <button className="size-11 shrink-0 rounded-xl border border-line bg-card" onClick={() => set({ minutes: Math.min(600, draft.minutes + 5) })}>
                +5
              </button>
            </div>
            {timed && draft.minutes !== item?.minutes && (
              <span className="mt-1 block text-xs text-accent">
                ขั้นตอนถัดไปทั้งหมดจะ{draft.minutes > (item?.minutes ?? 0) ? "เลื่อนช้าลง" : "เลื่อนเร็วขึ้น"} {Math.abs(draft.minutes - (item?.minutes ?? 0))} นาที
              </span>
            )}
            {box && draft.has_people && draft.people.length > 0 && draft.people.length !== draft.minutes && (
              <span className="mt-1 flex items-center gap-2 text-xs text-muted">
                <span className="min-w-0 flex-1">
                  รายชื่อ {draft.people.length} แถว ≈ {draft.people.length} นาที (ขึ้นผูกแถวละประมาณ 1 นาที)
                </span>
                <button className="min-h-9 shrink-0 rounded-lg border border-line bg-card px-2.5 font-medium text-accent" onClick={() => set({ minutes: draft.people.length })}>
                  ใช้ {draft.people.length} นาที
                </button>
              </span>
            )}
          </Field>
        )}

        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-accent"
            checked={draft.target !== null}
            onChange={(e) => set({ target: e.target.checked ? (timed?.start ?? state.settings.schedule_start) : null })}
          />
          มีเวลาที่ต้องเริ่ม (ฤกษ์ / เวลาในการ์ด)
        </label>
        {draft.target !== null && (
          <div className="-mt-1 flex items-center gap-2 pl-7 text-sm">
            <input
              type="time"
              className="rounded-lg border border-line bg-card px-2 py-1 tabular-nums"
              value={fmtTime(draft.target).padStart(5, "0")}
              onChange={(e) => {
                const min = parseTime(e.target.value);
                if (min !== null) set({ target: min });
              }}
            />
            {timed && <span className={timed.start > draft.target ? "text-danger" : "text-muted"}>ตอนนี้เริ่ม {fmtTime(timed.start)} · {driftLabel(timed.start - draft.target)}</span>}
          </div>
        )}

        {!section && (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5 accent-accent" checked={draft.has_people} onChange={(e) => set({ has_people: e.target.checked })} />
            มีรายชื่อผู้ร่วมพิธี (เลือกคนและจัดลำดับ)
          </label>
        )}

        {!section && draft.has_people && (
          <div className="rounded-xl border border-line bg-card p-3">
            <div className="mb-3 grid grid-cols-2 gap-2">
              <Button className="min-h-10 px-2" variant={box ? "default" : "primary"} onClick={() => set({ count_unit: "person" })}>
                นับเป็นคน
              </Button>
              <Button className="min-h-10 px-2" variant={box ? "primary" : "default"} onClick={() => set({ count_unit: "box" })}>
                นับเป็นของรับไหว้
              </Button>
            </div>
            {box && <p className="mb-2 text-xs text-muted">1 แถว = 1 กล่อง จะมาเป็นคู่หรือคนเดียวก็ได้ 1 กล่อง ส่วนกล่องพิเศษของพ่อแม่ไม่นับรวม</p>}

            <Field label={box ? "ของรับไหว้ทั้งหมด (กล่อง)" : "จำนวนคนทั้งหมด (เว้นว่างได้)"}>
              <input
                className={inputClass}
                inputMode="numeric"
                value={draft.people_count ?? ""}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  set({ people_count: Number.isNaN(n) ? null : Math.min(500, Math.max(0, n)) });
                }}
              />
            </Field>

            <div className="mb-1 mt-3 text-xs font-medium text-muted">
              ลำดับ ({used}
              {draft.people_count !== null && `/${draft.people_count}`} {unit})
              {left !== null && left > 0 && <span className="text-unsure"> · {box ? "เหลือ" : "ยังขาด"} {left} {unit}</span>}
              {left !== null && left < 0 && <span className="text-danger"> · เกิน {-left} {unit}</span>}
            </div>
            <ol className="divide-y divide-line rounded-xl border border-line empty:hidden">
              {draft.people.map((p, i) => (
                <li key={personKey(p, i)} className="flex min-h-11 items-center gap-1 px-2 py-1 text-sm">
                  <span className="w-6 shrink-0 text-muted tabular-nums">{i + 1}.</span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 break-words">{label(p)}</span>
                    {box && (
                      <button
                        aria-pressed={!!p.special}
                        className={`mt-0.5 rounded-full border px-2 text-[11px] font-medium leading-5 ${p.special ? "border-accent bg-accent text-white" : "border-line text-muted"}`}
                        onClick={() => set({ people: draft.people.map((x, j) => (j === i ? { ...x, special: !x.special } : x)) })}
                      >
                        {p.special ? "✓ กล่องพิเศษ (ไม่นับ)" : "กล่องพิเศษ"}
                      </button>
                    )}
                  </span>
                  <button disabled={i === 0} aria-label="เลื่อนขึ้น" className="size-9 shrink-0 rounded-lg disabled:opacity-25 active:bg-paper" onClick={() => movePerson(i, -1)}>
                    ↑
                  </button>
                  <button disabled={i === draft.people.length - 1} aria-label="เลื่อนลง" className="size-9 shrink-0 rounded-lg disabled:opacity-25 active:bg-paper" onClick={() => movePerson(i, 1)}>
                    ↓
                  </button>
                  <button aria-label="เอาออก" className="size-9 shrink-0 rounded-lg text-danger active:bg-danger/5" onClick={() => set({ people: draft.people.filter((_, j) => j !== i) })}>
                    ✕
                  </button>
                </li>
              ))}
            </ol>

            <Button className="mt-2 w-full" disabled={box && left !== null && left <= 0} onClick={() => setPicking(true)}>
              + เลือกจากรายชื่อแขก
            </Button>
            <div className="mt-2 flex gap-2">
              <input className={inputClass} placeholder="หรือพิมพ์ชื่อ (คนที่ไม่อยู่ในรายชื่อแขก)" value={typed} onChange={(e) => setTyped(e.target.value)} />
              <Button className="shrink-0 px-3" disabled={!typed.trim()} onClick={addTyped}>
                เพิ่ม
              </Button>
            </div>
            {box && (
              <label className="mt-1 flex min-h-10 items-center gap-2 text-xs">
                <input type="checkbox" className="size-4 accent-accent" checked={typedSpecial} onChange={(e) => setTypedSpecial(e.target.checked)} />
                ชื่อที่พิมพ์เป็นกล่องพิเศษ (พ่อแม่ ไม่นับรวม)
              </label>
            )}
          </div>
        )}
      </div>

      {/* kept apart from the buttons above so it is not tapped by mistake */}
      {id && (
        <div className="mt-10 flex justify-end border-t border-line pt-4">
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (confirm(`ลบ “${item?.title}”? เวลาของขั้นตอนถัดไปจะเลื่อนเร็วขึ้น ${item?.minutes ?? 0} นาที`)) {
                void deleteScheduleItem(id).then((ok) => ok && closeSheet());
              }
            }}
          >
            ลบ{KIND_LABEL[draft.kind]}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function SpecialTag() {
  return <span className="shrink-0 rounded-full bg-accent-soft px-2 text-[11px] font-medium leading-5 text-accent">กล่องพิเศษ</span>;
}

/**
 * Every guest, one row per party, one chip per person, picked in the order tapped.
 * Counting boxes, the people picked from one party come up together as one entry (one box).
 */
function GuestPicker({ box, left, taken, onDone, onCancel }: { box: boolean; left: number | null; taken: string[]; onDone: (groups: string[][]) => void; onCancel: () => void }) {
  const { state, d } = useStore();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const rows = useMemo(() => {
    if (!state || !d) return [];
    const key = searchKey(q);
    return state.parties
      .map((p) => ({ p, free: (d.membersByParty.get(p.id) ?? []).filter((m) => !taken.includes(m.id)) }))
      .filter(({ p, free }) => free.length > 0 && (!key || searchKey(`${p.name}${p.nickname}${p.village}${p.host}${free.map((m) => m.display_name ?? "").join("")}`).includes(key)));
  }, [state, d, q, taken]);

  if (!state || !d) return null;
  const partyOf = (id: string) => state.guests.find((g) => g.id === id)?.party_id ?? id;
  // in tap order; counting boxes, one group per party
  const groups: string[][] = [];
  if (box) {
    const byParty = new Map<string, string[]>();
    for (const id of selected) {
      const key = partyOf(id);
      if (!byParty.has(key)) groups.push(byParty.set(key, []).get(key)!);
      byParty.get(key)!.push(id);
    }
  } else {
    for (const id of selected) groups.push([id]);
  }
  const groupNo = new Map(groups.flatMap((g, i) => g.map((id) => [id, i + 1] as const)));
  const over = box && left !== null && groups.length > left;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Sheet
      onClose={onCancel}
      title={box ? `เลือกผู้ขึ้นผูกข้อมือ${left !== null ? ` (เหลือ ${left} กล่อง)` : ""}` : "เลือกผู้ร่วมพิธี"}
      footer={
        <Button className="w-full" variant="primary" disabled={!selected.length || over} onClick={() => onDone(groups)}>
          {over ? `เกินไป ${groups.length - left!} กล่อง` : box ? `เพิ่ม ${groups.length} กล่อง (${selected.length} คน)` : `เพิ่ม ${selected.length} คน`}
        </Button>
      }
    >
      <input className={`${inputClass} mb-3`} placeholder="ค้นหาชื่อ / หมู่บ้าน / เจ้าภาพ" value={q} onChange={(e) => setQ(e.target.value)} />
      {box && <p className="mb-2 text-xs text-muted">คนที่เลือกจากกลุ่มเดียวกันจะขึ้นมาด้วยกัน ได้ 1 กล่อง ถ้าจะแยกเป็นหลายกล่อง ให้เพิ่มทีละรอบ</p>}
      {rows.length === 0 && <p className="py-6 text-center text-sm text-muted">ไม่พบรายชื่อ</p>}
      <ul className="divide-y divide-line rounded-xl border border-line bg-card empty:hidden">
        {rows.map(({ p, free }) => {
          const ids = free.map((m) => m.id);
          const all = ids.every((x) => selected.includes(x));
          return (
            <li key={p.id} className="px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{partyLabel(p)}</span>
                  <span className="block truncate text-xs text-muted">
                    {p.host} · {p.village || "-"}
                  </span>
                </span>
                {ids.length > 1 && (
                  <button
                    className="min-h-9 shrink-0 rounded-lg border border-line px-2.5 text-xs font-medium text-accent"
                    onClick={() => setSelected(all ? selected.filter((x) => !ids.includes(x)) : [...selected, ...ids.filter((x) => !selected.includes(x))])}
                  >
                    {all ? "ไม่เลือก" : "ทั้งกลุ่ม"}
                  </button>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {free.map((m) => {
                  const n = groupNo.get(m.id);
                  return (
                    <button
                      key={m.id}
                      aria-pressed={n !== undefined}
                      onClick={() => toggle(m.id)}
                      className={`min-h-9 max-w-full truncate rounded-lg border px-2.5 text-xs font-medium ${n !== undefined ? "border-accent bg-accent text-white" : "border-line bg-card"}`}
                    >
                      {n !== undefined && `${n}. `}
                      {m.display_name || (p.size > 1 ? `${m.member_no}/${p.size}` : "เลือก")}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
