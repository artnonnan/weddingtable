import { describe, expect, it } from "vitest";
import { carInfos, isGroomSide } from "../lib/cars";
import { buildParties, normalizeVillage, parseSize, SIGN } from "../lib/importRules";
import { autoAssign, signLines, tableNumbers, tableWarning } from "../lib/layout";
import { partyColors, SOLO_COLOR } from "../lib/partyColors";
import { driftLabel, fmtTime, parseTime, timeline } from "../lib/schedule";
import { cleanThai, searchKey } from "../lib/thai";
import type { Car, Guest, Party, ScheduleItem, Settings, Sign, Table } from "../lib/types";

describe("printed signs", () => {
  it("breaks before เจ้าสาว / เจ้าบ่าว only", () => {
    expect(signLines("ญาติเจ้าสาว")).toEqual(["ญาติ", "เจ้าสาว"]);
    expect(signLines("เพื่อนเจ้าบ่าว")).toEqual(["เพื่อน", "เจ้าบ่าว"]);
    expect(signLines("กสิกร")).toEqual(["กสิกร"]);
    expect(signLines("เจ้าสาว")).toEqual(["เจ้าสาว"]);
  });
});

describe("cars", () => {
  const party = { id: "p", name: "พี่ฮวด", nickname: "", size: 2, sign_id: 6 } as Party;
  const parties = new Map([["p", party]]);
  const rider = (id: string, member_no: number, car_id: string | null) =>
    ({ id, kind: "guest", party_id: "p", member_no, display_name: null, status: "confirmed", table_id: null, seat_no: null, car_id }) as Guest;
  const car = (id: string, patch: Partial<Car>): Car => ({ id, kind: "car", driver_guest_id: null, driver_name: "", seats: 5, created_at: id, ...patch });

  it("counts a typed driver who is not on the guest list", () => {
    const [info] = carInfos([car("a", { driver_name: "กัมปนาท" })], [rider("1", 1, "a"), rider("2", 2, "a"), rider("3", 1, null)], parties);
    expect(info.used).toBe(3);
    expect(info.title).toBe("รถกัมปนาท");
    expect(info.passengers.map((g) => g.id)).toEqual(["1", "2"]);
  });

  it("counts a guest driver once and keeps them out of the passengers", () => {
    const [info] = carInfos([car("a", { driver_guest_id: "1" })], [rider("1", 1, "a"), rider("2", 2, "a")], parties);
    expect(info.used).toBe(2);
    expect(info.driverLabel).toBe("พี่ฮวด 1/2");
    expect(info.passengers.map((g) => g.id)).toEqual(["2"]);
  });

  it("flags too many people and a missing driver, and numbers vans", () => {
    const [full, van] = carInfos(
      [car("a", { driver_name: "ก", seats: 2 }), car("b", { kind: "van", seats: 13 })],
      [rider("1", 1, "a"), rider("2", 2, "a")],
      parties,
    );
    expect(full.over).toBe(true);
    expect(van.title).toBe("รถตู้ 1");
    expect(van.driverLabel).toBeNull();
    expect(van.used).toBe(0);
  });

  it("arranges the groom's side and VIPs only", () => {
    const signs = new Map([1, 3, 6].map((id) => [id, { id, side: id === 1 ? "vip" : id === 3 ? "bride" : "groom" } as Sign]));
    expect([1, 3, 6, null].map((sign_id) => isGroomSide({ sign_id } as Party, signs))).toEqual([true, false, true, false]);
  });
});

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
      { sheet: "พ่อถวัลย์", rows: [head, ["ดาบตำรวจ สังวาลย์ แก้วคำมูล", "น้าแอ้ด", "ร่องเผียว", "1"], ["x", "", "แม่จัน", "2"]] },
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
const settings: Settings = { id: 1, bride_side: "left", rows_per_lane: null, reserve_tables: 1, seats_per_table: 8, schedule_start: 520 };

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

  it("never warns at a VIP table", () => {
    const { parties, guests } = fixture([["พ่อถวัลย์", 1, "a", 2], ["แม่พริ้งเพรา", 6, "b", 1], ["อาท", 6, "c", 1]]);
    const table: Table = { id: "t", lane: "middle", pos: 0, sign_id: 1 };
    const w = tableWarning(table, guests, new Map(parties.map((p) => [p.id, p])), SIGNS);
    expect(w.level).toBe("none");
    expect(w.wrongGuestIds.size).toBe(0);
  });

  it("gives groups at one table different colours and solo guests grey", () => {
    const { parties, guests } = fixture([
      ["แม่ดาว", 3, "a", 2], ["แม่ดาว", 3, "b", 2], ["แม่ดาว", 3, "c", 2], ["แม่ดาว", 3, "d", 1], ["แม่ดาว", 3, "e", 1],
    ]);
    const seated = guests.map((g) => ({ ...g, table_id: "t" }));
    const colors = partyColors(parties, seated, [{ id: "t", lane: "bride", pos: 0, sign_id: 3 }]);
    const groupColors = ["p1", "p2", "p3"].map((id) => colors.get(id));
    expect(new Set(groupColors).size).toBe(3);
    expect(colors.get("p4")).toBe(SOLO_COLOR);
    expect(colors.get("p5")).toBe(SOLO_COLOR);
  });

  it("hides an acknowledged warning until the mix changes", () => {
    const { parties, guests } = fixture([["แม่ดาว", 3, "a", 2], ["แม่ดาว", 3, "b", 1], ["แม่ดาว", 3, "c", 1]]);
    const byId = new Map(parties.map((p) => [p.id, p]));
    const table: Table = { id: "t", lane: "bride", pos: 0, sign_id: 3 };
    const first = tableWarning(table, guests.slice(0, 3), byId, SIGNS);
    expect(first.shown).toBe("mixed");
    const acked = { ...table, warn_ack: first.signature };
    expect(tableWarning(acked, guests.slice(0, 3), byId, SIGNS).shown).toBe("none");
    // a third village joins → warning is back
    expect(tableWarning(acked, guests, byId, SIGNS).shown).toBe("mixed");
  });
});

describe("schedule", () => {
  const item = (sort_order: number, kind: ScheduleItem["kind"], minutes: number, target: number | null = null) =>
    ({ id: String(sort_order), sort_order, kind, title: "", detail: "", minutes, target, has_people: false, people_count: null, people: [] }) as ScheduleItem;

  it("starts each item when the ones before it end, so a change moves everything after it", () => {
    const items = [item(1, "section", 0), item(2, "step", 20), item(3, "step", 10, 540), item(4, "section", 0, 570), item(5, "break", 10), item(6, "step", 5)];
    const t = timeline(items, 520);
    expect(t.map((x) => fmtTime(x.start))).toEqual(["8:40", "8:40", "9:00", "9:10", "9:10", "9:20"]);
    expect(t.map((x) => x.no)).toEqual([null, 1, 2, null, null, 1]);
    expect(fmtTime(t[0].end)).toBe("9:10");
    expect(fmtTime(t[3].end)).toBe("9:25");
    expect(t[2].drift).toBe(0);
    expect(t[3].drift).toBe(-20);

    const longer = timeline(items.map((x) => (x.id === "2" ? { ...x, minutes: 30 } : x)), 520);
    expect(longer.map((x) => fmtTime(x.start))).toEqual(["8:40", "8:40", "9:10", "9:20", "9:20", "9:30"]);
    expect(longer[2].drift).toBe(10);
  });

  it("follows sort_order, not array order", () => {
    const t = timeline([item(2, "step", 5), item(1, "step", 10)], 600);
    expect(t.map((x) => [x.item.id, fmtTime(x.start)])).toEqual([
      ["1", "10:00"],
      ["2", "10:10"],
    ]);
  });

  it("reads and writes times", () => {
    expect(parseTime("08:40")).toBe(520);
    expect(parseTime("9.05")).toBe(545);
    expect(parseTime("1130")).toBe(690);
    expect(parseTime("25:00")).toBeNull();
    expect(fmtTime(545)).toBe("9:05");
    expect(driftLabel(5)).toBe("ช้าไป 5 นาที");
    expect(driftLabel(-5)).toBe("เร็วไป 5 นาที");
  });
});
