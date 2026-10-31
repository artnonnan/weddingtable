// Who rides in which car. Pure functions (no DB, no React).
import { guestLabel } from "./layout";
import type { Car, Guest, Party, Sign } from "./types";

export interface CarInfo {
  car: Car;
  title: string;
  driverLabel: string | null;
  /** everyone on board except a guest driver */
  passengers: Guest[];
  /** people on board, the driver included */
  used: number;
  over: boolean;
}

/** Only the groom's side and VIPs are arranged into cars. */
export function isGroomSide(party: Party | undefined, signById: Map<number, Sign>): boolean {
  const side = party?.sign_id ? signById.get(party.sign_id)?.side : undefined;
  return side === "groom" || side === "vip";
}

export function carInfos(cars: Car[], guests: Guest[], partyById: Map<string, Party>): CarInfo[] {
  let vans = 0;
  return [...cars]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((car) => {
      const onBoard = guests.filter((g) => g.car_id === car.id);
      const driver = car.driver_guest_id ? onBoard.find((g) => g.id === car.driver_guest_id) : undefined;
      const driverLabel = driver ? guestLabel(driver, driver.party_id ? partyById.get(driver.party_id) : undefined) : car.driver_name || null;
      const used = onBoard.length + (!driver && car.driver_name ? 1 : 0);
      const title = car.kind === "van" ? `รถตู้ ${++vans}` : `รถ${driverLabel ?? ""}`;
      return { car, title, driverLabel, passengers: onBoard.filter((g) => g !== driver), used, over: used > car.seats };
    });
}
