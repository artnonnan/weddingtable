"use client";

import { useState } from "react";
import { CarFormSheet, CarPickSheet, CarSheet } from "@/components/CarSheet";
import { CarsView } from "@/components/CarsView";
import { ListView } from "@/components/ListView";
import { MapView } from "@/components/MapView";
import { MoreView } from "@/components/MoreView";
import { PartySheet } from "@/components/PartySheet";
import { PendingSheet } from "@/components/PendingSheet";
import { PinSheet } from "@/components/PinSheet";
import { PickSheet } from "@/components/PickSheet";
import { SearchView } from "@/components/SearchView";
import { TableSheet } from "@/components/TableSheet";
import { useStore, type Tab } from "@/lib/store";

const TABS: [Tab, string, string][] = [
  ["map", "ผัง", "▦"],
  ["list", "รายชื่อ", "☰"],
  ["search", "ค้นหา", "⌕"],
  ["cars", "รถ", "🚐"],
  ["more", "เพิ่มเติม", "⋯"],
];

export default function Home() {
  const { state, d, error, tab, setTab, sheets, openSheet, moving, cancelMove, toast, editor, canEdit } = useStore();
  const [pinOpen, setPinOpen] = useState(false);
  const tabs = canEdit ? TABS : TABS.filter(([t]) => t !== "more");

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-base font-bold text-accent">
            ผังโต๊ะ อาท & โดม <span className="text-xs font-normal text-muted">14 พ.ย.</span>
          </h1>
          {canEdit ? (
            <button onClick={() => setTab("more")} className="min-h-8 max-w-[45%] truncate rounded-full bg-accent-soft px-3 text-xs font-medium text-accent">
              ✏️ {editor}
            </button>
          ) : (
            <button onClick={() => setPinOpen(true)} className="min-h-8 shrink-0 rounded-full border border-line bg-card px-3 text-xs font-medium text-muted">
              🔒 ดูอย่างเดียว · แก้ไข
            </button>
          )}
        </div>
        {d && (
          <div className="mt-1.5 grid grid-cols-5 gap-1 text-center">
            <Stat label="แขก" value={d.stats.people} />
            <Stat label="มีโต๊ะ" value={d.stats.seated} />
            <Stat label="รอดำเนินการ" value={d.stats.unseated} tone={d.stats.unseated ? "warn" : undefined} onClick={() => openSheet({ type: "pending" })} />
            <Stat label="ที่ว่าง" value={d.stats.free} />
            <Stat label="ผิดกลุ่ม" value={d.stats.warnTables} tone={d.stats.warnTables ? "danger" : undefined} />
          </div>
        )}
      </header>

      {moving && (
        <div className="sticky top-[88px] z-30 mx-3 mt-2 flex items-center gap-2 rounded-xl bg-ink px-3 py-2 text-sm text-white shadow-lg">
          {moving.relocate ? (
            <span className="min-w-0 flex-1">
              แตะช่อง “วางที่นี่” เพื่อย้าย <b>{moving.label}</b>
              <span className="block text-xs text-white/70">คนและป้ายย้ายไปด้วย · เลขโต๊ะจะนับใหม่ตามตำแหน่ง</span>
            </span>
          ) : (
          <span className="min-w-0 flex-1">
            แตะโต๊ะปลายทางสำหรับ <b className="break-words">{moving.label}</b>
            {moving.fromTable && <span className="block text-xs text-white/70">คนเดิมของโต๊ะปลายทางจะไปอยู่ใน “รอดำเนินการ”</span>}
          </span>
          )}
          <button onClick={cancelMove} className="min-h-9 shrink-0 rounded-lg bg-white/15 px-3">
            ยกเลิก
          </button>
        </div>
      )}

      <main className="flex-1 pb-24 pt-3">
        {error && (
          <div className="mx-3 mb-3 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
            โหลดข้อมูลไม่ได้: {error}
          </div>
        )}
        {!state && !error && <p className="py-20 text-center text-sm text-muted">กำลังโหลด…</p>}
        {state && tab === "map" && d && d.stats.unseated > 0 && !moving && (
          <button
            onClick={() => openSheet({ type: "pending" })}
            className="mx-3 mb-3 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-xl border border-unsure/40 bg-unsure/10 px-3 py-2.5 text-left text-sm"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-unsure text-xs font-bold text-white">{d.stats.unseated}</span>
            <span className="flex-1">
              คน <b>รอดำเนินการ</b> (ยังไม่มีโต๊ะ)
            </span>
            <span className="text-muted">ดู ›</span>
          </button>
        )}
        {state && tab === "map" && <MapView />}
        {state && tab === "list" && <ListView />}
        {state && tab === "search" && <SearchView />}
        {state && tab === "cars" && <CarsView />}
        {state && tab === "more" && <MoreView />}
      </main>

      <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className={`mx-auto grid max-w-xl ${canEdit ? "grid-cols-5" : "grid-cols-4"}`}>
          {tabs.map(([t, label, icon]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${tab === t ? "font-semibold text-accent" : "text-muted"}`}
            >
              <span className="text-lg leading-none">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </nav>

      {sheets.map((s, i) => (
        <div key={i}>
          {s.type === "table" && <TableSheet id={s.id} />}
          {s.type === "party" && <PartySheet id={s.id} />}
          {s.type === "pick" && <PickSheet tableId={s.tableId} />}
          {s.type === "pending" && <PendingSheet />}
          {s.type === "car" && <CarSheet id={s.id} />}
          {s.type === "carForm" && <CarFormSheet id={s.id} />}
          {s.type === "carPick" && <CarPickSheet carId={s.carId} />}
        </div>
      ))}

      {pinOpen && <PinSheet onClose={() => setPinOpen(false)} />}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-24 z-50 flex justify-center px-4">
          <div className="rounded-xl bg-ink px-4 py-2.5 text-sm text-white shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, onClick }: { label: string; value: number; tone?: "warn" | "danger"; onClick?: () => void }) {
  const color = tone === "danger" ? "text-danger" : tone === "warn" ? "text-unsure" : "text-ink";
  return (
    <button onClick={onClick} className="rounded-lg bg-card py-1 leading-tight" disabled={!onClick}>
      <span className={`block text-base font-bold tabular-nums ${color}`}>{value}</span>
      <span className="block text-[10px] text-muted">{label}</span>
    </button>
  );
}
