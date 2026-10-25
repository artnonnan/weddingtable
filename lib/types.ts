export type Lane = "bride" | "middle" | "groom";
export type Side = "vip" | "bride" | "groom";
export type GuestStatus = "confirmed" | "unsure" | "seated";

export const HOSTS = ["พ่อถวัลย์", "แม่พริ้งเพรา", "อาท", "แม่ดาว", "โดม"] as const;
export type Host = (typeof HOSTS)[number];

export const STATUS_LABEL: Record<GuestStatus, string> = {
  confirmed: "มาแน่",
  unsure: "ยังไม่ชัวร์",
  seated: "นั่งแล้ว",
};

export interface Settings {
  id: 1;
  bride_side: "left" | "right";
  rows_per_lane: number | null;
  reserve_tables: number;
  seats_per_table: number;
}

export interface Sign {
  id: number;
  label: string;
  color: string;
  side: Side;
  sort_order: number;
}

export interface Table {
  id: string;
  lane: Lane;
  pos: number;
  sign_id: number | null;
  /** signature of an acknowledged mixed-group warning (see tableWarning) */
  warn_ack?: string | null;
}

export interface Party {
  id: string;
  host: string;
  village: string;
  sign_id: number | null;
  name: string;
  nickname: string;
  size: number;
  note: string;
  source_sheet: string | null;
  source_row: number | null;
  created_at: string;
}

export interface Guest {
  id: string;
  kind: "guest" | "reserved";
  party_id: string | null;
  member_no: number | null;
  display_name: string | null;
  status: GuestStatus;
  table_id: string | null;
  seat_no: number | null;
}

export interface ChangeLogEntry {
  id: number;
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface SnapshotMeta {
  id: number;
  at: string;
  reason: string;
  actor: string;
}

export interface DbState {
  settings: Settings;
  signs: Sign[];
  tables: Table[];
  parties: Party[];
  guests: Guest[];
}
