"use client";

import { useEffect, useState } from "react";
import { guestLabel, partyLabel } from "@/lib/layout";
import { useStore } from "@/lib/store";
import { HOSTS, STATUS_LABEL, type GuestStatus, type Party } from "@/lib/types";
import { Sheet } from "./Sheet";
import { Button, Field, inputClass, StatusChip } from "./ui";

type Form = Pick<Party, "name" | "nickname" | "host" | "village" | "sign_id" | "note" | "size">;

const toForm = (p: Party): Form => ({
  name: p.name,
  nickname: p.nickname,
  host: p.host,
  village: p.village,
  sign_id: p.sign_id,
  note: p.note,
  size: p.size,
});

/** Record info for one sheet row (party): edit in the web only, never written back to Google Sheets. */
export function PartySheet({ id }: { id: string }) {
  const { state, d, closeSheet, updateParty, setPartySize, setPartyStatus, updateGuest, startMove, moveTo, deleteParty, goToTable, busy } = useStore();
  const party = d?.partyById.get(id);
  const [form, setForm] = useState<Form | null>(party ? toForm(party) : null);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (party) setForm(toForm(party));
  }, [id]);

  if (!state || !d || !party || !form) return null;
  const members = d.membersByParty.get(id) ?? [];
  const label = partyLabel(party);
  const tables = [...new Set(members.map((m) => m.table_id))];
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(party));
  const allStatus = members.every((m) => m.status === members[0]?.status) ? members[0]?.status : undefined;

  const save = async () => {
    const { size, ...rest } = form;
    await updateParty(id, rest);
    if (size !== party.size) {
      const seated = members.filter((m) => (m.member_no ?? 0) > size && m.table_id).length;
      if (size < party.size && seated && !confirm(`ลดจำนวนคน จะเอา ${seated} คนออกจากโต๊ะ ต่อเลยไหม?`)) return;
      await setPartySize(id, size);
    }
  };

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });

  return (
    <Sheet
      onClose={closeSheet}
      title={<span className="block truncate">{label}</span>}
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" variant="primary" disabled={!dirty || busy || form.size < 1} onClick={() => void save()}>
            บันทึก
          </Button>
          <Button onClick={() => startMove({ guestIds: members.map((m) => m.id), label: `${label} (${members.length} คน)` })}>ย้ายทั้งกลุ่ม</Button>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {tables.map((t) =>
          t ? (
            <button key={t} onClick={() => goToTable(t)} className="rounded-full bg-accent-soft px-3 py-1 font-medium text-accent">
              โต๊ะ {d.numbers.get(t)} ›
            </button>
          ) : (
            <span key="none" className="rounded-full bg-line px-3 py-1 text-muted">
              รอดำเนินการ
            </span>
          ),
        )}
        {party.source_sheet && <span className="text-xs text-muted">จากชีต “{party.source_sheet}” แถว {party.source_row}</span>}
      </div>

      <div className="space-y-3">
        <Field label="ชื่อจริง">
          <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="ชื่อเล่น">
          <input className={inputClass} value={form.nickname} onChange={(e) => set("nickname", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="แขกของ">
            <select className={inputClass} value={form.host} onChange={(e) => set("host", e.target.value)}>
              {[...new Set([...HOSTS, form.host])].map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </Field>
          <Field label="หมู่บ้าน / กลุ่ม">
            <input className={inputClass} value={form.village} onChange={(e) => set("village", e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ป้าย (กลุ่มโต๊ะ)">
            <select className={inputClass} value={form.sign_id ?? ""} onChange={(e) => set("sign_id", e.target.value ? Number(e.target.value) : null)}>
              <option value="">— ไม่มี —</option>
              {state.signs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="จำนวนคน">
            <div className="flex items-center gap-1">
              <button className="size-11 rounded-xl border border-line bg-card text-lg" onClick={() => set("size", Math.max(1, form.size - 1))}>
                −
              </button>
              <input
                className={`${inputClass} text-center`}
                inputMode="numeric"
                value={form.size}
                onChange={(e) => set("size", Math.max(0, Number.parseInt(e.target.value || "0", 10)))}
              />
              <button className="size-11 rounded-xl border border-line bg-card text-lg" onClick={() => set("size", form.size + 1)}>
                +
              </button>
            </div>
          </Field>
        </div>
        <Field label="หมายเหตุ">
          <textarea className={`${inputClass} py-2`} rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} />
        </Field>
      </div>

      <div className="mb-1 mt-5 flex items-center justify-between">
        <span className="text-xs font-medium text-muted">สถานะทั้งกลุ่ม</span>
        {allStatus && <StatusChip status={allStatus} />}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(STATUS_LABEL) as GuestStatus[]).map((s) => (
          <Button key={s} variant={allStatus === s ? "primary" : "default"} onClick={() => void setPartyStatus(id, s)} disabled={busy}>
            {STATUS_LABEL[s]}
          </Button>
        ))}
      </div>

      <div className="mb-1 mt-5 text-xs font-medium text-muted">รายคน ({members.length})</div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-card">
        {members.map((m) => {
          const value = names[m.id] ?? m.display_name ?? "";
          return (
            <li key={m.id} className="space-y-2 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <input
                  className={`${inputClass} min-h-10 flex-1 text-sm`}
                  placeholder={guestLabel({ ...m, display_name: null }, party)}
                  value={value}
                  onChange={(e) => setNames({ ...names, [m.id]: e.target.value })}
                  onBlur={() => {
                    const next = value.trim() || null;
                    if (next !== (m.display_name ?? null)) void updateGuest(m.id, { display_name: next });
                  }}
                />
                {m.table_id ? (
                  <button onClick={() => goToTable(m.table_id!)} className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
                    โต๊ะ {d.numbers.get(m.table_id)}
                  </button>
                ) : (
                  <span className="shrink-0 text-xs text-muted">รอดำเนินการ</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  className="min-h-9 rounded-lg border border-line bg-card px-2 text-xs"
                  value={m.status}
                  onChange={(e) => void updateGuest(m.id, { status: e.target.value as GuestStatus })}
                >
                  {(Object.keys(STATUS_LABEL) as GuestStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <span className="flex-1" />
                <button className="min-h-9 px-2 text-xs text-accent" onClick={() => startMove({ guestIds: [m.id], label: guestLabel(m, party) })}>
                  ย้ายคนนี้
                </button>
                {m.table_id && (
                  <button className="min-h-9 px-2 text-xs text-muted" onClick={() => void moveTo(null, [m.id], guestLabel(m, party))}>
                    เอาออกจากโต๊ะ
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex justify-between gap-2">
        {members.some((m) => m.table_id) && (
          <Button variant="ghost" onClick={() => void moveTo(null, members.map((m) => m.id), label)}>
            เอาทั้งกลุ่มออกจากโต๊ะ
          </Button>
        )}
        <Button
          variant="danger"
          className="ml-auto"
          onClick={() => {
            if (confirm(`ลบ “${label}” (${party.size} คน) ออกจากรายชื่อ?`)) {
              void deleteParty(id).then(closeSheet);
            }
          }}
        >
          ลบรายชื่อ
        </Button>
      </div>
    </Sheet>
  );
}
