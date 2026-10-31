"use client";

import { useMemo, useState } from "react";
import { guestLabel, partyLabel } from "@/lib/layout";
import { isGroomSide } from "@/lib/cars";
import { useStore } from "@/lib/store";
import { searchKey } from "@/lib/thai";
import { CAR_KIND_LABEL, STATUS_LABEL, type CarKind, type Guest } from "@/lib/types";
import { SeatCount } from "./CarsView";
import { Sheet } from "./Sheet";
import { Button, Field, inputClass, StatusDot } from "./ui";

/** One car: its driver and the people riding in it. */
export function CarSheet({ id }: { id: string }) {
  const { d, closeSheet, openSheet, setGuestsCar, deleteCar, canEdit, busy } = useStore();
  const info = d?.carById.get(id);
  if (!d || !info) return null;
  const label = (g: Guest) => guestLabel(g, g.party_id ? d.partyById.get(g.party_id) : undefined);

  return (
    <Sheet
      onClose={closeSheet}
      title={
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate">{info.title}</span>
          <SeatCount info={info} large />
        </span>
      }
      footer={
        canEdit && (
          <div className="flex gap-2">
            <Button className="flex-1" variant="primary" onClick={() => openSheet({ type: "carPick", carId: id })}>
              + เพิ่มคน
            </Button>
            <Button onClick={() => openSheet({ type: "carForm", id })}>แก้ไขรถ</Button>
          </div>
        )
      }
    >
      {info.over && <p className="mb-3 rounded-xl bg-danger/5 px-3 py-2 text-sm text-danger">เกินจำนวนที่นั่ง {info.used - info.car.seats} คน</p>}

      <div className="mb-1 text-xs font-medium text-muted">คนขับ ({CAR_KIND_LABEL[info.car.kind]})</div>
      <div className={`mb-4 rounded-xl border border-line bg-card px-3 py-2.5 text-sm ${info.driverLabel ? "" : "font-medium text-danger"}`}>{info.driverLabel ?? "ยังไม่มีคนขับ"}</div>

      <div className="mb-1 text-xs font-medium text-muted">ผู้โดยสาร ({info.passengers.length})</div>
      {info.passengers.length === 0 && <p className="py-4 text-center text-sm text-muted">ยังไม่มีผู้โดยสาร</p>}
      <ul className="divide-y divide-line rounded-xl border border-line bg-card empty:hidden">
        {info.passengers.map((g) => (
          <li key={g.id} className="flex min-h-12 items-center gap-2 px-3 py-1.5 text-sm">
            <StatusDot status={g.status} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{label(g)}</span>
              {g.status === "unsure" && <span className="block text-xs text-unsure">{STATUS_LABEL.unsure}</span>}
            </span>
            {canEdit && (
              <button disabled={busy} className="min-h-9 shrink-0 rounded-lg border border-line bg-card px-2.5 text-xs font-medium active:bg-paper" onClick={() => void setGuestsCar([g.id], null, label(g))}>
                ลงจากรถ
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* kept apart from the buttons above so it is not tapped by mistake */}
      {canEdit && (
        <div className="mt-10 flex justify-end border-t border-line pt-4">
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (confirm(`ลบ “${info.title}”? ทุกคนบนรถจะกลับเป็นมาเอง`)) {
                void deleteCar(id).then((ok) => ok && closeSheet());
              }
            }}
          >
            ลบรถ
          </Button>
        </div>
      )}
    </Sheet>
  );
}

/** Add a car or edit one. */
export function CarFormSheet({ id }: { id: string | null }) {
  const { d, closeSheet, saveCar, busy } = useStore();
  const car = id ? d?.carById.get(id)?.car : undefined;
  const [kind, setKind] = useState<CarKind>(car?.kind ?? "car");
  const [typed, setTyped] = useState(car ? !car.driver_guest_id : false);
  const [driverGuest, setDriverGuest] = useState<string | null>(car?.driver_guest_id ?? null);
  const [driverName, setDriverName] = useState(car?.driver_name ?? "");
  const [seats, setSeats] = useState(car?.seats ?? 5);
  if (!d) return null;

  const van = kind === "van";
  const useName = van || typed;
  const name = driverName.trim();
  const guest = driverGuest ? d.groomGuests.find((g) => g.id === driverGuest) : undefined;
  // a van can be added before its hired driver is known
  const ready = seats >= 1 && (useName ? van || !!name : !!guest);

  const save = async () => {
    const label = useName ? name : guest ? guestLabel(guest, guest.party_id ? d.partyById.get(guest.party_id) : undefined) : "";
    const saved = await saveCar(id, { kind, driver_guest_id: useName ? null : driverGuest, driver_name: useName ? name : "", seats }, `${CAR_KIND_LABEL[kind]} ${label}`);
    if (saved) closeSheet();
  };

  return (
    <Sheet
      onClose={closeSheet}
      title={id ? "แก้ไขรถ" : "เพิ่มรถ"}
      footer={
        <Button className="w-full" variant="primary" disabled={!ready || busy} onClick={() => void save()}>
          บันทึก
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(CAR_KIND_LABEL) as CarKind[]).map((k) => (
            <Button
              key={k}
              variant={kind === k ? "primary" : "default"}
              onClick={() => {
                setKind(k);
                if (!id) setSeats(k === "van" ? 13 : 5);
              }}
            >
              {CAR_KIND_LABEL[k]}
            </Button>
          ))}
        </div>

        <Field label="จำนวนที่นั่ง (รวมคนขับ)">
          <div className="flex items-center gap-1">
            <button className="size-11 shrink-0 rounded-xl border border-line bg-card text-lg" onClick={() => setSeats(Math.max(1, seats - 1))}>
              −
            </button>
            <input className={`${inputClass} text-center`} inputMode="numeric" value={seats} onChange={(e) => setSeats(Math.min(60, Math.max(0, Number.parseInt(e.target.value || "0", 10))))} />
            <button className="size-11 shrink-0 rounded-xl border border-line bg-card text-lg" onClick={() => setSeats(Math.min(60, seats + 1))}>
              +
            </button>
          </div>
        </Field>

        {!van && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant={typed ? "default" : "primary"} onClick={() => setTyped(false)}>
              คนขับเป็นแขก
            </Button>
            <Button variant={typed ? "primary" : "default"} onClick={() => setTyped(true)}>
              พิมพ์ชื่อคนขับ
            </Button>
          </div>
        )}

        {useName ? (
          <Field label={van ? "ชื่อคนขับ / คนดูแลรถ (ใส่ทีหลังได้)" : "ชื่อคนขับ"}>
            <input className={inputClass} value={driverName} onChange={(e) => setDriverName(e.target.value)} />
          </Field>
        ) : (
          <GuestPicker carId={id} selected={driverGuest ? [driverGuest] : []} onChange={(ids) => setDriverGuest(ids[ids.length - 1] ?? null)} single />
        )}
      </div>
    </Sheet>
  );
}

/** Choose people from the groom's side to ride in a car. */
export function CarPickSheet({ carId }: { carId: string }) {
  const { d, closeSheet, setGuestsCar, busy } = useStore();
  const [selected, setSelected] = useState<string[]>([]);
  const info = d?.carById.get(carId);
  if (!d || !info) return null;

  const add = async () => {
    const guests = selected.map((g) => d.groomGuests.find((x) => x.id === g)).filter((g): g is Guest => !!g);
    const label = (g: Guest) => guestLabel(g, g.party_id ? d.partyById.get(g.party_id) : undefined);
    const drivers = guests.filter((g) => g.car_id && d.carById.get(g.car_id)?.car.driver_guest_id === g.id);
    if (drivers.length && !confirm(`${drivers.map(label).join(", ")} เป็นคนขับอยู่ ถ้าย้ายมา รถเดิมจะไม่มีคนขับ ต่อเลยไหม?`)) return;
    if (await setGuestsCar(selected, carId, guests.map(label).join(", "))) closeSheet();
  };

  return (
    <Sheet
      onClose={closeSheet}
      title={`เพิ่มคนขึ้น${info.title} (${info.used}/${info.car.seats})`}
      footer={
        <Button className="w-full" variant="primary" disabled={!selected.length || busy} onClick={() => void add()}>
          ขึ้นรถ {selected.length} คน
        </Button>
      }
    >
      <GuestPicker carId={carId} selected={selected} onChange={setSelected} />
    </Sheet>
  );
}

/** Groom's side + VIP, one row per party, one chip per person. People already in this car are left out. */
function GuestPicker({ carId, selected, onChange, single }: { carId: string | null; selected: string[]; onChange: (ids: string[]) => void; single?: boolean }) {
  const { state, d } = useStore();
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    if (!state || !d) return [];
    const key = searchKey(q);
    return state.parties
      .filter((p) => isGroomSide(p, d.signById))
      // adding passengers skips those already on board; a driver can be anyone, this car's riders included
      .map((p) => ({ p, free: (d.membersByParty.get(p.id) ?? []).filter((m) => single || m.car_id !== carId) }))
      .filter(({ p, free }) => free.length > 0 && (!key || searchKey(`${p.name}${p.nickname}${p.village}${free.map((m) => m.display_name ?? "").join("")}`).includes(key)));
  }, [state, d, q, carId, single]);

  if (!d) return null;
  const toggle = (id: string) => onChange(single ? (selected.includes(id) ? [] : [id]) : selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div>
      <input className={`${inputClass} mb-3`} placeholder="ค้นหาชื่อ / หมู่บ้าน" value={q} onChange={(e) => setQ(e.target.value)} />
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
                {!single && ids.length > 1 && (
                  <button
                    className="min-h-9 shrink-0 rounded-lg border border-line px-2.5 text-xs font-medium text-accent"
                    onClick={() => onChange(all ? selected.filter((x) => !ids.includes(x)) : [...new Set([...selected, ...ids])])}
                  >
                    {all ? "ไม่เลือก" : "ทั้งกลุ่ม"}
                  </button>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {free.map((m) => {
                  const on = selected.includes(m.id);
                  const other = m.car_id && m.car_id !== carId ? d.carById.get(m.car_id)?.title : undefined;
                  return (
                    <button
                      key={m.id}
                      aria-pressed={on}
                      onClick={() => toggle(m.id)}
                      className={`min-h-9 max-w-full truncate rounded-lg border px-2.5 text-xs font-medium ${on ? "border-accent bg-accent text-white" : "border-line bg-card"}`}
                    >
                      {m.display_name || (p.size > 1 ? `${m.member_no}/${p.size}` : "เลือก")}
                      {m.status === "unsure" && " · ไม่ชัวร์"}
                      {other && ` · อยู่${other}`}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
