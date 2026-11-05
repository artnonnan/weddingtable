"use client";

import { useMemo, useState } from "react";
import { guestLabel, partyLabel } from "@/lib/layout";
import { driftLabel, fmtTime, parseTime } from "@/lib/schedule";
import { useStore, type ScheduleDraft } from "@/lib/store";
import { searchKey } from "@/lib/thai";
import type { ScheduleKind, SchedulePerson } from "@/lib/types";
import { Sheet } from "./Sheet";
import { Button, Field, inputClass } from "./ui";

const KIND_LABEL: Record<ScheduleKind, string> = { section: "ช่วง", step: "ขั้นตอน", break: "พัก / เปลี่ยนผ่าน" };

const personKey = (p: SchedulePerson, i: number) => ("guest_id" in p ? p.guest_id : `name-${i}`);

/** One schedule item: view it, or (editors) change it, its people, or delete it. */
export function ScheduleItemSheet({ id, at, kind }: { id: string | null; at?: number; kind?: ScheduleKind }) {
  const { state, d, closeSheet, canEdit, busy, saveScheduleItem, deleteScheduleItem } = useStore();
  const item = id ? state?.schedule.find((x) => x.id === id) : undefined;
  const timed = id ? d?.schedule.find((x) => x.item.id === id) : undefined;
  const [draft, setDraft] = useState<ScheduleDraft>(
    item
      ? { kind: item.kind, title: item.title, detail: item.detail, minutes: item.minutes, target: item.target, has_people: item.has_people, people_count: item.people_count, people: item.people }
      : { kind: kind ?? "step", title: "", detail: "", minutes: kind === "section" ? 0 : 5, target: null, has_people: false, people_count: null, people: [] },
  );
  const [picking, setPicking] = useState(false);
  const [typed, setTyped] = useState("");
  if (!state || !d || (id && !item)) return null;

  const set = (patch: Partial<ScheduleDraft>) => setDraft((x) => ({ ...x, ...patch }));
  const section = draft.kind === "section";
  const label = (p: SchedulePerson) => {
    if (!("guest_id" in p)) return p.name;
    const g = state.guests.find((x) => x.id === p.guest_id);
    return g ? guestLabel(g, g.party_id ? d.partyById.get(g.party_id) : undefined) : "(แขกที่ถูกลบไปแล้ว)";
  };
  const movePerson = (i: number, delta: number) => {
    const people = [...draft.people];
    const [p] = people.splice(i, 1);
    people.splice(i + delta, 0, p);
    set({ people });
  };

  if (picking) {
    return (
      <GuestPicker
        taken={draft.people.flatMap((p) => ("guest_id" in p ? [p.guest_id] : []))}
        onDone={(ids) => {
          set({ people: [...draft.people, ...ids.map((guest_id) => ({ guest_id }))] });
          setPicking(false);
        }}
        onCancel={() => setPicking(false)}
      />
    );
  }

  if (!canEdit) {
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
        {item?.has_people && (
          <>
            <div className="mb-1 text-xs font-medium text-muted">
              ผู้ร่วมพิธี {item.people.length}
              {item.people_count !== null && `/${item.people_count}`} คน
            </div>
            <ol className="divide-y divide-line rounded-xl border border-line bg-card empty:hidden">
              {item.people.map((p, i) => (
                <li key={personKey(p, i)} className="flex min-h-11 items-center gap-2 px-3 text-sm">
                  <span className="w-6 text-muted tabular-nums">{i + 1}.</span>
                  {label(p)}
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
            <Field label="จำนวนคนทั้งหมด (เว้นว่างได้)">
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
              ลำดับ ({draft.people.length}
              {draft.people_count !== null && `/${draft.people_count}`} คน)
              {draft.people_count !== null && draft.people.length < draft.people_count && <span className="text-unsure"> · ยังขาด {draft.people_count - draft.people.length} คน</span>}
              {draft.people_count !== null && draft.people.length > draft.people_count && <span className="text-danger"> · เกิน {draft.people.length - draft.people_count} คน</span>}
            </div>
            <ol className="divide-y divide-line rounded-xl border border-line empty:hidden">
              {draft.people.map((p, i) => (
                <li key={personKey(p, i)} className="flex min-h-11 items-center gap-1 px-2 text-sm">
                  <span className="w-6 shrink-0 text-muted tabular-nums">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate">{label(p)}</span>
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

            <Button className="mt-2 w-full" onClick={() => setPicking(true)}>
              + เลือกจากรายชื่อแขก
            </Button>
            <div className="mt-2 flex gap-2">
              <input className={inputClass} placeholder="หรือพิมพ์ชื่อ (คนที่ไม่อยู่ในรายชื่อแขก)" value={typed} onChange={(e) => setTyped(e.target.value)} />
              <Button
                className="shrink-0 px-3"
                disabled={!typed.trim()}
                onClick={() => {
                  set({ people: [...draft.people, { name: typed.trim() }] });
                  setTyped("");
                }}
              >
                เพิ่ม
              </Button>
            </div>
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

/** Every guest, one row per party, one chip per person. Picked in the order tapped. */
function GuestPicker({ taken, onDone, onCancel }: { taken: string[]; onDone: (ids: string[]) => void; onCancel: () => void }) {
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

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Sheet
      onClose={onCancel}
      title="เลือกผู้ร่วมพิธี"
      footer={
        <Button className="w-full" variant="primary" disabled={!selected.length} onClick={() => onDone(selected)}>
          เพิ่ม {selected.length} คน
        </Button>
      }
    >
      <input className={`${inputClass} mb-3`} placeholder="ค้นหาชื่อ / หมู่บ้าน / เจ้าภาพ" value={q} onChange={(e) => setQ(e.target.value)} />
      {rows.length === 0 && <p className="py-6 text-center text-sm text-muted">ไม่พบรายชื่อ</p>}
      <ul className="divide-y divide-line rounded-xl border border-line bg-card empty:hidden">
        {rows.map(({ p, free }) => (
          <li key={p.id} className="px-3 py-2">
            <span className="block truncate text-sm font-medium">{partyLabel(p)}</span>
            <span className="block truncate text-xs text-muted">
              {p.host} · {p.village || "-"}
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {free.map((m) => {
                const n = selected.indexOf(m.id);
                return (
                  <button
                    key={m.id}
                    aria-pressed={n >= 0}
                    onClick={() => toggle(m.id)}
                    className={`min-h-9 max-w-full truncate rounded-lg border px-2.5 text-xs font-medium ${n >= 0 ? "border-accent bg-accent text-white" : "border-line bg-card"}`}
                  >
                    {n >= 0 && `${n + 1}. `}
                    {m.display_name || (p.size > 1 ? `${m.member_no}/${p.size}` : "เลือก")}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
