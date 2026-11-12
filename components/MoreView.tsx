"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import type { ChangeLogEntry, SnapshotMeta } from "@/lib/types";
import { Button, inputClass } from "./ui";

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
  const { state, editor, logout } = useStore();
  if (!state) return null;

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

      <SignsCard />

      <Card title="พิมพ์">
        <div className="grid grid-cols-2 gap-2">
          <a href="/print/signs" target="_blank" className="flex min-h-11 items-center justify-center rounded-xl border border-line text-sm font-medium">
            ป้ายโต๊ะ
          </a>
          <a href="/print/map" target="_blank" className="flex min-h-11 items-center justify-center rounded-xl border border-line text-sm font-medium">
            ผังรวม + รายชื่อ
          </a>
        </div>
      </Card>

      <PrintExtrasCard />

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

/** Tent cards printed after the tables only: signs without a number, and spare tables numbered on from the last one. */
function PrintExtrasCard() {
  const { state, d, setPrintExtras, busy } = useStore();
  if (!state || !d) return null;
  const specials = state.settings.print_specials ?? [];
  const spares = state.settings.print_spares ?? [];
  const last = d.numbers.size;
  const saveSpecials = (next: string[]) => void setPrintExtras({ print_specials: next });
  const saveSpares = (next: string[]) => void setPrintExtras({ print_spares: next });

  return (
    <Card title="ป้ายพิเศษ & โต๊ะเผื่อ (เฉพาะตอนพิมพ์ ไม่ขึ้นในผัง)">
      <p className="mb-2 text-xs text-muted">ป้ายพิเศษ ไม่มีเลขโต๊ะ · กด Enter เพื่อขึ้นบรรทัดใหม่บนป้าย</p>
      <ul className="mb-2 space-y-2">
        {specials.map((label, i) => (
          <li key={`${i}-${label}`} className="flex items-start gap-2">
            <textarea
              rows={Math.max(1, label.split("\n").length)}
              className={`${inputClass} py-2`}
              defaultValue={label}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== label) saveSpecials(specials.map((x, j) => (j === i ? v : x)));
              }}
            />
            <Button variant="danger" disabled={busy} onClick={() => saveSpecials(specials.filter((_, j) => j !== i))}>
              ลบ
            </Button>
          </li>
        ))}
      </ul>
      <Button className="mb-4 w-full" disabled={busy} onClick={() => saveSpecials([...specials, "ป้ายใหม่"])}>
        + เพิ่มป้ายพิเศษ
      </Button>

      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm">โต๊ะเผื่อ</span>
        <Button disabled={busy || spares.length === 0} onClick={() => saveSpares(spares.slice(0, -1))}>
          −
        </Button>
        <span className="w-8 text-center font-medium">{spares.length}</span>
        <Button disabled={busy || spares.length >= 20} onClick={() => saveSpares([...spares, ""])}>
          +
        </Button>
        <span className="text-xs text-muted">{spares.length ? `โต๊ะ ${last + 1}–${last + spares.length}` : "ไม่มี"}</span>
      </div>
      <ul className="space-y-2">
        {spares.map((label, i) => (
          <li key={`${i}-${label}`} className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-center text-lg font-semibold">{last + i + 1}</span>
            <input
              className={inputClass}
              placeholder="มีแค่เลข (ใส่ชื่อได้ถ้าต้องการ)"
              defaultValue={label}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== label) saveSpares(spares.map((x, j) => (j === i ? v : x)));
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
