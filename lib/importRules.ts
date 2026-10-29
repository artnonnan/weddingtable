// Rules that turn the 5 guest-sheet tabs into parties. Pure functions so they can be tested
// and dry-run without a database.
import { cleanThai } from "./thai";

export type SheetTab = { sheet: string; rows: string[][] }; // rows include the header row

export interface PartyDraft {
  host: string;
  village: string;
  sign_id: number;
  name: string;
  nickname: string;
  size: number;
  source_sheet: string;
  source_row: number; // 1-based row number in the sheet
}

export const SIGN = {
  VIP: 1,
  BRIDE_FAMILY: 2,
  BRIDE_GUEST: 3,
  BRIDE_WORK: 4,
  BRIDE_FRIEND: 8,
  GROOM_FAMILY: 5,
  GROOM_GUEST: 6,
  GROOM_FRIEND: 7,
} as const;

/** Name fragments that identify the VIP parties (all in พ่อถวัลย์'s tab). */
const VIP_NAME_PARTS = ["สุวิวัฒน์", "ไลไธสง", "สังวาลย์", "ทรงยศ"];
/** Groom's relatives, by nickname (all in แม่พริ้งเพรา's tab). */
const GROOM_FAMILY_NICKNAMES = ["ป้าสาย", "น้าดุล", "น้าราญ"];

export function normalizeVillage(host: string, raw: string): string {
  const v = cleanThai(raw);
  if (v === "ทำงาน") return "ที่ทำงาน";
  if (!v && host === "โดม") return "เพื่อน";
  return v;
}

/** "2" → 2. Blank, "0", "-" or anything unparseable means not coming → null. */
export function parseSize(raw: string | undefined): number | null {
  const n = Number.parseInt(cleanThai(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function signFor(host: string, village: string, name: string, nickname: string): number {
  switch (host) {
    case "พ่อถวัลย์":
      return VIP_NAME_PARTS.some((p) => name.includes(p)) ? SIGN.VIP : SIGN.GROOM_GUEST;
    case "แม่พริ้งเพรา":
      return GROOM_FAMILY_NICKNAMES.includes(nickname) ? SIGN.GROOM_FAMILY : SIGN.GROOM_GUEST;
    case "อาท":
      return SIGN.GROOM_FRIEND;
    case "แม่ดาว":
      return village === "ญาติ" ? SIGN.BRIDE_FAMILY : SIGN.BRIDE_GUEST;
    case "โดม":
      return village === "ที่ทำงาน" ? SIGN.BRIDE_WORK : SIGN.BRIDE_GUEST;
    default:
      throw new Error(`unknown host tab: ${host}`);
  }
}

export interface ImportResult {
  parties: PartyDraft[];
  skipped: { sheet: string; row: number; label: string; reason: string }[];
}

export function buildParties(tabs: SheetTab[]): ImportResult {
  const parties: PartyDraft[] = [];
  const skipped: ImportResult["skipped"] = [];
  for (const { sheet, rows } of tabs) {
    rows.slice(1).forEach((cells, i) => {
      const row = i + 2;
      const name = cleanThai(cells[0]);
      const nickname = cleanThai(cells[1]);
      if (!name && !nickname) return; // empty line
      const size = parseSize(cells[3]);
      if (size === null) {
        skipped.push({ sheet, row, label: name || nickname, reason: `จำนวน "${cells[3] ?? ""}" = ไม่มา` });
        return;
      }
      const village = normalizeVillage(sheet, cells[2] ?? "");
      parties.push({
        host: sheet,
        village,
        sign_id: signFor(sheet, village, name, nickname),
        name,
        nickname,
        size,
        source_sheet: sheet,
        source_row: row,
      });
    });
  }
  return { parties, skipped };
}
