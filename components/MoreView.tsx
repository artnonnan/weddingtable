"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import type { ChangeLogEntry, SnapshotMeta } from "@/lib/types";
import { Button, Field, inputClass } from "./ui";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-2xl border border-line bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function MoreView() {
  const { state, editor, logout, updateSettings, addTable, runAutoAssign, busy } = useStore();
  if (!state) return null;
  const s = state.settings;

  return (
    <div className="px-3 pb-6">
      <Card title="โหมดแก้ไข">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm">
            กำลังแก้ไขในชื่อ <b>{editor}</b>
            <span className="block text-xs text-muted">ชื่อนี้จะขึ้นในประวัติการแก้ไขและแจ้งเตือน</span>
          </span>
          <Button onClick={() => void logout()}>ออกจากโหมดแก้ไข</Button>
        </div>
      </Card>

      <Card title="ผังห้อง">
        <div className="space-y-4">
          <Field label="ฝั่งเจ้าสาว (มองไปทางเวที)">
            <div className="grid grid-cols-2 gap-2">
              {(["left", "right"] as const).map((side) => (
                <Button key={side} variant={s.bride_side === side ? "primary" : "default"} onClick={() => void updateSettings({ bride_side: side })}>
                  {side === "left" ? "ซ้าย" : "ขวา"}
                </Button>
              ))}
            </div>
          </Field>
          <Field label="โต๊ะต่อแถว (เว้นว่าง = ให้ระบบคำนวณ)">
            <input
              className={inputClass}
              inputMode="numeric"
              placeholder="อัตโนมัติ"
              defaultValue={s.rows_per_lane ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim() ? Number.parseInt(e.target.value, 10) : null;
                if (v !== s.rows_per_lane && (v === null || (v > 0 && v <= 50))) void updateSettings({ rows_per_lane: v });
              }}
            />
          </Field>
          <Field label="โต๊ะเผื่อแขกนอกรายชื่อ (ทั้งโต๊ะเป็น “จองไว้” วางท้ายแถว)">
            <div className="flex items-center gap-2">
              <Button onClick={() => void updateSettings({ reserve_tables: Math.max(0, s.reserve_tables - 1) })}>−</Button>
              <span className="w-10 text-center text-lg font-semibold tabular-nums">{s.reserve_tables}</span>
              <Button onClick={() => void updateSettings({ reserve_tables: Math.min(20, s.reserve_tables + 1) })}>+</Button>
              <span className="text-xs text-muted">ใช้ตอนกดจัดอัตโนมัติ</span>
            </div>
          </Field>
          <div>
            <div className="mb-1 text-xs font-medium text-muted">เพิ่มโต๊ะเปล่าต่อท้ายแถว</div>
            <div className="grid grid-cols-3 gap-2">
              <Button onClick={() => void addTable("bride")}>เจ้าสาว</Button>
              <Button onClick={() => void addTable("middle")}>กลาง</Button>
              <Button onClick={() => void addTable("groom")}>เจ้าบ่าว</Button>
            </div>
          </div>
          <div className="rounded-xl bg-accent-soft p-3">
            <p className="mb-2 text-sm">
              <b>จัดอัตโนมัติ</b> จะจัดทุกคนลงโต๊ะใหม่ทั้งหมดตามป้าย/หมู่บ้าน (ผังเดิมถูกเขียนทับ แต่ระบบเก็บ snapshot ไว้ให้กู้คืนได้)
            </p>
            <Button
              variant="primary"
              className="w-full"
              disabled={busy}
              onClick={() => {
                if (confirm("จัดที่นั่งใหม่ทั้งหมด? ผังปัจจุบันจะถูกเขียนทับ (กู้คืนได้จาก snapshot)")) void runAutoAssign();
              }}
            >
              จัดอัตโนมัติ
            </Button>
          </div>
        </div>
      </Card>

      <SignsCard />

      <Card title="พิมพ์">
        <div className="grid grid-cols-2 gap-2">
          <a href="/print/signs" target="_blank" className="flex min-h-11 items-center justify-center rounded-xl border border-line text-sm font-medium">
            ป้ายโต๊ะ (A4)
          </a>
          <a href="/print/map" target="_blank" className="flex min-h-11 items-center justify-center rounded-xl border border-line text-sm font-medium">
            ผังรวม + รายชื่อ
          </a>
        </div>
      </Card>

      <HistoryCard />
    </div>
  );
}

function SignsCard() {
  const { state, updateSign } = useStore();
  if (!state) return null;
  return (
    <Card title="ป้ายโต๊ะ">
      <ul className="space-y-2">
        {state.signs.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <input
              type="color"
              className="size-11 shrink-0 cursor-pointer rounded-xl border border-line bg-card p-1"
              defaultValue={s.color}
              onBlur={(e) => e.target.value !== s.color && void updateSign(s.id, { color: e.target.value })}
            />
            <input
              className={inputClass}
              defaultValue={s.label}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== s.label) void updateSign(s.id, { label: v });
              }}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function HistoryCard() {
  const { listSnapshots, listChanges, restoreSnapshot, createSnapshot, busy } = useStore();
  const [view, setView] = useState<"snap" | "log">("snap");
  const [snaps, setSnaps] = useState<SnapshotMeta[] | null>(null);
  const [log, setLog] = useState<ChangeLogEntry[] | null>(null);

  const load = async () => {
    try {
      if (view === "snap") setSnaps(await listSnapshots());
      else setLog(await listChanges());
    } catch {
      /* toast already shown elsewhere; keep list as is */
    }
  };
  useEffect(() => {
    void load();
  }, [view]);

  return (
    <Card title="ประวัติ & กู้คืน">
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Button variant={view === "snap" ? "primary" : "default"} onClick={() => setView("snap")}>
          Snapshot
        </Button>
        <Button variant={view === "log" ? "primary" : "default"} onClick={() => setView("log")}>
          การแก้ไขล่าสุด
        </Button>
      </div>

      {view === "snap" && (
        <>
          <Button className="mb-3 w-full" onClick={async () => { await createSnapshot("บันทึกเอง"); await load(); }}>
            + บันทึก snapshot ตอนนี้
          </Button>
          <ul className="divide-y divide-line text-sm">
            {snaps?.length === 0 && <li className="py-3 text-muted">ยังไม่มี snapshot</li>}
            {snaps?.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    #{s.id} {s.reason}
                  </span>
                  <span className="text-xs text-muted">
                    {fmt(s.at)}
                    {s.actor && ` · ${s.actor}`}
                  </span>
                </span>
                <Button
                  disabled={busy}
                  onClick={async () => {
                    if (confirm(`กู้คืนผังเป็น snapshot #${s.id} (${fmt(s.at)})? สถานะปัจจุบันจะถูกเก็บเป็น snapshot ก่อน`)) {
                      await restoreSnapshot(s.id);
                      await load();
                    }
                  }}
                >
                  กู้คืน
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      {view === "log" && (
        <ul className="divide-y divide-line text-sm">
          {log?.length === 0 && <li className="py-3 text-muted">ยังไม่มีการแก้ไข</li>}
          {log?.map((c) => (
            <li key={c.id} className="py-2">
              <span className="block">
                <b className="font-medium">{c.action}</b> {c.detail}
              </span>
              <span className="text-xs text-muted">
                {fmt(c.at)}
                {c.actor && ` · ${c.actor}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
