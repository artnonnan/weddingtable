"use client";

import { useMemo, useState } from "react";
import { groupKey, partyLabel } from "@/lib/layout";
import { useStore } from "@/lib/store";
import { searchKey } from "@/lib/thai";
import { HOSTS, type Party } from "@/lib/types";
import { AddPartyButton } from "./AddParty";
import { inputClass, StatusDot } from "./ui";

type Filter = "all" | "unseated" | "unsure" | "wrong";
const FILTERS: [Filter, string][] = [
  ["all", "ทั้งหมด"],
  ["unseated", "ยังไม่มีโต๊ะ"],
  ["unsure", "ยังไม่ชัวร์"],
  ["wrong", "นั่งผิดกลุ่ม"],
];

export function ListView() {
  const { state, d, openSheet } = useStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const sections = useMemo(() => {
    if (!state || !d) return [];
    const key = searchKey(q);
    const wrongGuests = new Set([...d.warnings.values()].flatMap((w) => [...w.wrongGuestIds]));
    const keep = (p: Party) => {
      const ms = d.membersByParty.get(p.id) ?? [];
      if (key && !searchKey(`${p.name}${p.nickname}${p.village}${p.host}`).includes(key)) return false;
      if (filter === "unseated") return ms.some((m) => !m.table_id);
      if (filter === "unsure") return ms.some((m) => m.status === "unsure");
      if (filter === "wrong") return ms.some((m) => wrongGuests.has(m.id));
      return true;
    };
    const bySign = [...state.signs.map((s) => ({ id: s.id as number | null, sign: s })), { id: null, sign: undefined }];
    return bySign
      .map(({ id, sign }) => {
        const parties = state.parties.filter((p) => p.sign_id === id && keep(p));
        const groups = new Map<string, Party[]>();
        for (const p of parties) groups.set(groupKey(p), [...(groups.get(groupKey(p)) ?? []), p]);
        const ordered = [...groups.entries()].sort(([, a], [, b]) => {
          const ha = HOSTS.indexOf(a[0].host as (typeof HOSTS)[number]);
          const hb = HOSTS.indexOf(b[0].host as (typeof HOSTS)[number]);
          return ha - hb || a[0].village.localeCompare(b[0].village, "th");
        });
        return { sign, people: parties.reduce((s, p) => s + p.size, 0), groups: ordered, wrongGuests };
      })
      .filter((s) => s.groups.length > 0);
  }, [state, d, q, filter]);

  if (!state || !d) return null;

  return (
    <div className="px-3 pb-4">
      <div className="sticky top-0 z-10 -mx-3 bg-paper px-3 pb-2 pt-1">
        <input className={inputClass} placeholder="ค้นหาชื่อ ชื่อเล่น หมู่บ้าน" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="mt-2 flex gap-1.5 overflow-x-auto">
          {FILTERS.map(([f, label]) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`min-h-9 shrink-0 rounded-full px-3 text-sm ${filter === f ? "bg-ink text-white" : "border border-line bg-card"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {sections.length === 0 && <p className="py-10 text-center text-sm text-muted">ไม่พบรายชื่อ</p>}

      {sections.map(({ sign, people, groups, wrongGuests }) => (
        <section key={sign?.id ?? "none"} className="mt-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <span className="size-3 rounded-full" style={{ background: sign?.color ?? "#a8a29e" }} />
            {sign?.label ?? "ไม่มีป้าย"}
            <span className="font-normal text-muted">{people} คน</span>
          </h2>
          {groups.map(([key, parties]) => (
            <div key={key} className="mb-3">
              <div className="mb-1 px-1 text-xs text-muted">
                {parties[0].host} · {parties[0].village || "ไม่ระบุ"} ({parties.reduce((s, p) => s + p.size, 0)})
              </div>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
                {parties.map((p) => {
                  const ms = d.membersByParty.get(p.id) ?? [];
                  const tables = [...new Set(ms.map((m) => m.table_id).filter(Boolean))] as string[];
                  const unseated = ms.filter((m) => !m.table_id).length;
                  const wrong = ms.some((m) => wrongGuests.has(m.id));
                  return (
                    <li key={p.id}>
                      <button onClick={() => openSheet({ type: "party", id: p.id })} className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left active:bg-paper">
                        <StatusDot status={ms[0]?.status ?? "confirmed"} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{partyLabel(p)}</span>
                          {p.name && p.nickname && <span className="block truncate text-xs text-muted">{p.nickname}</span>}
                        </span>
                        <span className="shrink-0 text-xs text-muted">×{p.size}</span>
                        <span className="flex shrink-0 gap-1">
                          {tables.map((t) => (
                            <span key={t} className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${wrong ? "bg-danger text-white" : "bg-accent-soft text-accent"}`}>
                              {d.numbers.get(t)}
                            </span>
                          ))}
                          {unseated > 0 && <span className="rounded-md bg-line px-1.5 py-0.5 text-xs text-muted">ไม่มีโต๊ะ{tables.length ? ` ${unseated}` : ""}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      ))}
      <AddPartyButton />
    </div>
  );
}
