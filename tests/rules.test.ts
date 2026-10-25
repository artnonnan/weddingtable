import { describe, expect, it } from "vitest";
import { buildParties, normalizeVillage, parseSize, SIGN } from "../lib/importRules";
import { autoAssign, tableNumbers, tableWarning } from "../lib/layout";
import { cleanThai, searchKey } from "../lib/thai";
import type { Guest, Party, Settings, Sign, Table } from "../lib/types";

describe("cleanThai", () => {
  it("drops marks repeated on one consonant", () => {
    expect(cleanThai("คุุณศุภมิตร")).toBe("คุณศุภมิตร");
    expect(cleanThai("พี่ี่วา")).toBe("พี่วา");
    expect(cleanThai("ที่่ทำงาน")).toBe("ที่ทำงาน");
    expect(cleanThai("มิ้้ว")).toBe("มิ้ว");
  });
  it("applies known typo fixes and tidies whitespace", () => {
    expect(cleanThai("ปุ้๋อง")).toBe("ป๋อง");
    expect(cleanThai("  บ้านเฮี้ย ")).toBe("บ้านเฮี้ย");
    expect(cleanThai("คุณชัยวัฒน์ จุเส้ง , ")).toBe("คุณชัยวัฒน์ จุเส้ง");
    expect(cleanThai("ก\nข")).toBe("ก, ข");
  });
  it("search key ignores marks and spacing", () => {
    expect(searchKey("พี่ี่ น็อต")).toBe(searchKey("พีน็อต"));
  });
});

describe("import rules", () => {
  it("treats blank, 0 and - as not coming", () => {
    expect(parseSize("")).toBeNull();
    expect(parseSize("0")).toBeNull();
    expect(parseSize("-")).toBeNull();
    expect(parseSize(" 3 ")).toBe(3);
  });
  it("normalizes villages", () => {
    expect(normalizeVillage("โดม", "ทำงาน")).toBe("ที่ทำงาน");
    expect(normalizeVillage("แม่ดาว", "ที่่ทำงาน")).toBe("ที่ทำงาน");
    expect(normalizeVillage("โดม", "")).toBe("เพื่อน");
    expect(normalizeVillage("พ่อถวัลย์", "")).toBe("");
  });
  it("maps rows to signs", () => {
    const head = ["ชื่อ", "ชื่อเล่น", "หมู่บ้าน", "จำนวน"];
    const { parties, skipped } = buildParties([
      { sheet: "พ่อถวัลย์", rows: [head, ["ดาบตำรวจ ชัชวาลย์ แก้วคำมูล", "น้าแอ้ด", "ร่องเผียว", "1"], ["x", "", "แม่จัน", "2"]] },
      { sheet: "แม่พริ้งเพรา", rows: [head, ["a", "ป้าสาย", "แม่สรวย", "2"], ["b", "น้าดวน", "แม่สรวย", "2"]] },
      { sheet: "อาท", rows: [head, ["", "อั๋น", "เพื่อน", "1"], ["", "นุ่น", "เพื่อน", "0"]] },
      { sheet: "แม่ดาว", rows: [head, ["c", "", "ญาติ", "3"], ["d", "", "ที่ทำงาน", "1"]] },
      { sheet: "โดม", rows: [head, ["e", "", "ทำงาน", "1"], ["", "เมย์", "", "1"], ["", "มีน", "", "-"]] },
    ]);
    expect(parties.map((p) => p.sign_id)).toEqual([
      SIGN.VIP, SIGN.GROOM_GUEST, SIGN.GROOM_FAMILY, SIGN.GROOM_GUEST, SIGN.GROOM_FRIEND,
      SIGN.BRIDE_FAMILY, SIGN.BRIDE_GUEST, SIGN.BRIDE_WORK, SIGN.BRIDE_GUEST,
    ]);
    expect(skipped.map((s) => s.label)).toEqual(["นุ่น", "มีน"]);
    expect(parties.find((p) => p.nickname === "เมย์")?.source_row).toBe(3);
  });
});

const SIGNS: Sign[] = [
  { id: 1, label: "VIP", color: "", side: "vip", sort_order: 1 },
  { id: 3, label: "แขกเจ้าสาว", color: "", side: "bride", sort_order: 3 },
  { id: 6, label: "แขกเจ้าบ่าว", color: "", side: "groom", sort_order: 6 },
];
const settings: Settings = { id: 1, bride_side: "left", rows_per_lane: null, reserve_tables: 1, seats_per_table: 8 };

function fixture(spec: [string, number, string, number][]) {
  let n = 0;
  const parties: Party[] = [];
  const guests: Guest[] = [];
  for (const [host, sign_id, village, size] of spec) {
    const p: Party = { id: `p${++n}`, host, village, sign_id, name: `n${n}`, nickname: "", size, note: "", source_sheet: null, source_row: null, created_at: "" };
    parties.push(p);
    for (let i = 1; i <= size; i++) {
      guests.push({ id: `${p.id}g${i}`, kind: "guest", party_id: p.id, member_no: i, display_name: null, status: "confirmed", table_id: null, seat_no: null });
    }
  }
  return { parties, guests };
}

describe("autoAssign", () => {
  it("keeps parties together, holds VIP seats, adds reserve tables", () => {
    const { parties, guests } = fixture([
      ["พ่อถวัลย์", 1, "a", 2],
      ["แม่ดาว", 3, "ทุ่งหลวง", 5],
      ["แม่ดาว", 3, "ทุ่งหลวง", 5],
      ["แม่ดาว", 3, "บ้านเฮี้ย", 3],
      ["แม่พริ้งเพรา", 6, "แม่สรวย", 4],
    ]);
    let id = 0;
    const res = autoAssign({ settings, signs: SIGNS, parties, guests, newId: () => `t${++id}` });
    expect(res.unseated).toEqual([]);
    const seated = res.seats.filter((s) => s.kind === "guest");
    expect(seated).toHaveLength(guests.length);
    for (const p of parties) {
      const tables = new Set(seated.filter((s) => s.kind === "guest" && s.guest_id.startsWith(`${p.id}g`)).map((s) => s.table_id));
      expect(tables.size).toBe(1);
    }
    const vip = res.tables.find((t) => t.sign_id === 1)!;
    expect(vip.lane).toBe("middle");
    expect(vip.pos).toBe(0);
    expect(res.seats.filter((s) => s.table_id === vip.id && s.kind === "reserved")).toHaveLength(6);
    expect(res.tables.filter((t) => t.sign_id === null)).toHaveLength(1);
    for (const t of res.tables) expect(res.seats.filter((s) => s.table_id === t.id).length).toBeLessThanOrEqual(8);
  });

  it("numbers tables row by row, left to right", () => {
    const t = (id: string, lane: Table["lane"], pos: number): Table => ({ id, lane, pos, sign_id: null });
    const tables = [t("g0", "groom", 0), t("b0", "bride", 0), t("m0", "middle", 0), t("b1", "bride", 1)];
    expect([...tableNumbers(tables, "left")]).toEqual([["b0", 1], ["m0", 2], ["g0", 3], ["b1", 4]]);
    expect(tableNumbers(tables, "right").get("g0")).toBe(1);
  });

  it("flags guests from another sign", () => {
    const { parties, guests } = fixture([["แม่ดาว", 3, "a", 2], ["แม่พริ้งเพรา", 6, "b", 1]]);
    const table: Table = { id: "t", lane: "bride", pos: 0, sign_id: 3 };
    const w = tableWarning(table, guests, new Map(parties.map((p) => [p.id, p])), SIGNS);
    expect(w.level).toBe("wrong");
    expect([...w.wrongGuestIds]).toEqual(["p2g1"]);
  });
});
