"use client";

import { guestLabel } from "@/lib/layout";
import type { CarInfo } from "@/lib/cars";
import { useStore } from "@/lib/store";
import { CAR_KIND_LABEL } from "@/lib/types";
import { Button } from "./ui";

/** Red when the car is over capacity (a warning only; it can still be filled). */
export function SeatCount({ info, large }: { info: CarInfo; large?: boolean }) {
  return (
    <span className={`shrink-0 rounded-md px-2 py-0.5 font-semibold tabular-nums ${large ? "text-base" : "text-sm"} ${info.over ? "bg-danger text-white" : "bg-accent-soft text-accent"}`}>
      {info.used}/{info.car.seats}
    </span>
  );
}

export function CarsView() {
  const { d, openSheet, canEdit } = useStore();
  if (!d) return null;
  const riding = d.groomGuests.filter((g) => g.car_id).length;

  return (
    <div className="px-3 pb-4">
      <p className="mb-3 text-sm text-muted">
        ฝั่งเจ้าบ่าวและ VIP {d.groomGuests.length} คน · บนรถ {riding} · มาเอง {d.groomGuests.length - riding}
      </p>

      {d.cars.length === 0 && <p className="py-10 text-center text-sm text-muted">ยังไม่มีรถ ทุกคนมาเอง</p>}

      <ul className="space-y-2">
        {d.cars.map((info) => (
          <li key={info.car.id}>
            <button onClick={() => openSheet({ type: "car", id: info.car.id })} className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-left active:bg-paper">
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{info.title}</span>
                {info.car.kind === "van" && <span className="shrink-0 rounded-full bg-line px-2 text-xs text-muted">{CAR_KIND_LABEL.van}</span>}
                <SeatCount info={info} />
              </span>
              {info.driverLabel ? (
                <span className="mt-0.5 block truncate text-xs text-muted">คนขับ: {info.driverLabel}</span>
              ) : (
                <span className="mt-0.5 block text-xs font-medium text-danger">ยังไม่มีคนขับ</span>
              )}
              {info.passengers.length > 0 && (
                <span className="mt-0.5 block truncate text-xs text-muted">
                  {info.passengers.map((g) => guestLabel(g, g.party_id ? d.partyById.get(g.party_id) : undefined)).join(", ")}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {canEdit && (
        <Button className="mt-3 w-full" variant="primary" onClick={() => openSheet({ type: "carForm", id: null })}>
          + เพิ่มรถ
        </Button>
      )}
    </div>
  );
}
