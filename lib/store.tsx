"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { autoAssign, partyLabel, tableNumbers, tableWarning, type TableWarning } from "./layout";
import { buildSearch, type SearchHit } from "./search";
import { db, must, setEditToken } from "./supabase";
import { STATUS_LABEL, type ChangeLogEntry, type DbState, type Guest, type GuestStatus, type Lane, type Party, type Settings, type Sign, type SnapshotMeta, type Table } from "./types";

// ---------------------------------------------------------------- UI state

export type Tab = "map" | "list" | "search" | "more";
export type SheetRef =
  | { type: "table"; id: string }
  | { type: "party"; id: string }
  | { type: "pick"; tableId: string }
  | { type: "pending" };
export interface Moving {
  guestIds: string[];
  label: string;
  /** set when moving a whole table onto another one */
  fromTable?: string;
}

export interface Derived {
  partyById: Map<string, Party>;
  signById: Map<number, Sign>;
  tableById: Map<string, Table>;
  guestsByTable: Map<string, Guest[]>;
  membersByParty: Map<string, Guest[]>;
  numbers: Map<string, number>;
  warnings: Map<string, TableWarning>;
  stats: { people: number; seated: number; unseated: number; free: number; reserved: number; unsure: number; warnTables: number };
  search: (q: string, limit?: number) => SearchHit[];
}

const HOURLY_MS = 60 * 60 * 1000;

function derive(s: DbState): Derived {
  const partyById = new Map(s.parties.map((p) => [p.id, p]));
  const signById = new Map(s.signs.map((x) => [x.id, x]));
  const tableById = new Map(s.tables.map((t) => [t.id, t]));
  const guestsByTable = new Map<string, Guest[]>();
  const membersByParty = new Map<string, Guest[]>();
  for (const g of s.guests) {
    if (g.table_id) guestsByTable.set(g.table_id, [...(guestsByTable.get(g.table_id) ?? []), g]);
    if (g.party_id) membersByParty.set(g.party_id, [...(membersByParty.get(g.party_id) ?? []), g]);
  }
  for (const list of guestsByTable.values()) list.sort((a, b) => (a.seat_no ?? 99) - (b.seat_no ?? 99));
  for (const list of membersByParty.values()) list.sort((a, b) => (a.member_no ?? 0) - (b.member_no ?? 0));

  const warnings = new Map<string, TableWarning>();
  for (const t of s.tables) warnings.set(t.id, tableWarning(t, guestsByTable.get(t.id) ?? [], partyById, s.signs));

  const people = s.guests.filter((g) => g.kind === "guest");
  const reserved = s.guests.filter((g) => g.kind === "reserved" && g.table_id).length;
  const seated = people.filter((g) => g.table_id).length;
  return {
    partyById,
    signById,
    tableById,
    guestsByTable,
    membersByParty,
    numbers: tableNumbers(s.tables, s.settings.bride_side),
    warnings,
    stats: {
      people: people.length,
      seated,
      unseated: people.length - seated,
      free: s.tables.length * s.settings.seats_per_table - seated - reserved,
      reserved,
      unsure: people.filter((g) => g.status === "unsure").length,
      warnTables: [...warnings.values()].filter((w) => w.shown === "wrong").length,
    },
    search: buildSearch(s.guests, partyById),
  };
}

// ---------------------------------------------------------------- context

interface Store {
  state: DbState | null;
  d: Derived | null;
  error: string | null;
  busy: boolean;
  // ui
  tab: Tab;
  setTab: (t: Tab) => void;
  sheets: SheetRef[];
  openSheet: (s: SheetRef) => void;
  closeSheet: () => void;
  closeAllSheets: () => void;
  moving: Moving | null;
  startMove: (m: Moving) => void;
  cancelMove: () => void;
  focusTable: string | null;
  goToTable: (id: string) => void;
  toast: string | null;
  notify: (msg: string) => void;
  /** name of the signed-in editor; null = view-only */
  editor: string | null;
  canEdit: boolean;
  actor: string;
  login: (pin: string, name: string) => Promise<string | null>;
  logout: () => Promise<void>;
  // data actions
  moveTo: (tableId: string | null, guestIds?: string[], label?: string) => Promise<boolean>;
  moveTable: (fromId: string, toId: string) => Promise<boolean>;
  updateParty: (id: string, patch: Partial<Pick<Party, "name" | "nickname" | "host" | "village" | "sign_id" | "note">>) => Promise<void>;
  setPartySize: (id: string, size: number) => Promise<void>;
  setPartyStatus: (id: string, status: GuestStatus) => Promise<void>;
  updateGuest: (id: string, patch: Partial<Pick<Guest, "display_name" | "status">>) => Promise<void>;
  addParty: (draft: Pick<Party, "name" | "nickname" | "host" | "village" | "sign_id" | "note" | "size">) => Promise<string | null>;
  deleteParty: (id: string) => Promise<void>;
  setTableSign: (tableId: string, signId: number | null) => Promise<void>;
  ackWarning: (tableId: string, signature: string | null) => Promise<void>;
  setChecked: (tableId: string, checked: boolean) => Promise<void>;
  setSeatOrder: (tableId: string, order: (string | null)[], detail: string) => Promise<void>;
  addTable: (lane: Lane) => Promise<void>;
  deleteTable: (id: string) => Promise<void>;
  reserveSeat: (tableId: string) => Promise<void>;
  unreserve: (guestId: string) => Promise<void>;
  updateSettings: (patch: Partial<Omit<Settings, "id">>) => Promise<void>;
  updateSign: (id: number, patch: Partial<Pick<Sign, "label" | "color">>) => Promise<void>;
  runAutoAssign: () => Promise<void>;
  createSnapshot: (reason: string) => Promise<void>;
  restoreSnapshot: (id: number) => Promise<void>;
  listSnapshots: () => Promise<SnapshotMeta[]>;
  listChanges: () => Promise<ChangeLogEntry[]>;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

const TOKEN_KEY = "editToken";

function storeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: edit mode lasts until the tab closes */
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DbState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("map");
  const [sheets, setSheets] = useState<SheetRef[]>([]);
  const [moving, setMoving] = useState<Moving | null>(null);
  const [focusTable, setFocusTable] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editor, setEditor] = useState<string | null>(null);
  const actor = editor ?? "";
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshotAt = useRef<number | null>(null);

  const dropEditor = useCallback(() => {
    setEditToken(null);
    storeToken(null);
    setEditor(null);
  }, []);

  // restore edit mode on this device if its token is still valid
  useEffect(() => {
    let token: string | null = null;
    try {
      token = localStorage.getItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    if (!token) return;
    setEditToken(token);
    db()
      .rpc("check_edit_session")
      .then(({ data }) => (typeof data === "string" && data ? setEditor(data) : dropEditor()));
  }, [dropEditor]);

  // view-only devices have no "เพิ่มเติม" tab
  useEffect(() => {
    if (!editor && tab === "more") setTab("map");
  }, [editor, tab]);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const c = db();
      const [settings, signs, tables, parties, guests] = await Promise.all([
        c.from("settings").select("*").eq("id", 1).single(),
        c.from("signs").select("*").order("sort_order"),
        c.from("tables").select("id,lane,pos,sign_id,warn_ack,checked_at,checked_by"),
        c.from("parties").select("*").order("created_at"),
        c.from("guests").select("id,kind,party_id,member_no,display_name,status,table_id,seat_no"),
      ]);
      setState({
        settings: must(settings) as Settings,
        signs: must(signs) as Sign[],
        tables: must(tables) as Table[],
        parties: must(parties) as Party[],
        guests: must(guests) as Guest[],
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // initial load + realtime: any change anywhere → refetch everything (a few hundred rows)
  useEffect(() => {
    void refresh();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<ReturnType<typeof db>["channel"]> | null = null;
    try {
      channel = db()
        .channel("all-changes")
        .on("postgres_changes", { event: "*", schema: "public" }, () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => void refresh(), 250);
        })
        .subscribe();
    } catch {
      /* env missing: error already shown by refresh */
    }
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (timer) clearTimeout(timer);
      if (channel) void db().removeChannel(channel);
    };
  }, [refresh]);

  const d = useMemo(() => (state ? derive(state) : null), [state]);

  const log = useCallback(
    async (action: string, detail: string) => {
      const c = db();
      await c.from("change_log").insert({ actor, action, detail });
      // hourly safety snapshot while people are editing
      if (lastSnapshotAt.current === null) {
        const { data } = await c.from("snapshots").select("at").order("id", { ascending: false }).limit(1);
        lastSnapshotAt.current = data?.[0] ? new Date(data[0].at).getTime() : 0;
      }
      if (Date.now() - lastSnapshotAt.current > HOURLY_MS) {
        await c.rpc("create_snapshot", { p_reason: "อัตโนมัติรายชั่วโมง", p_actor: actor });
        lastSnapshotAt.current = Date.now();
      }
    },
    [actor],
  );

  /** The database ignores writes without a valid token, so check first and say why. */
  const ensureEditor = useCallback(async (): Promise<boolean> => {
    if (!editor) {
      notify("โหมดดูอย่างเดียว — กด 🔒 เพื่อกรอก PIN");
      return false;
    }
    const { data } = await db().rpc("check_edit_session");
    if (typeof data === "string" && data) return true;
    dropEditor();
    notify("สิทธิ์แก้ไขหมดแล้ว (PIN อาจถูกเปลี่ยน) กรุณากรอก PIN ใหม่");
    return false;
  }, [editor, notify, dropEditor]);

  /** Run a mutation, log it, refresh. Returns false (and toasts) on failure. */
  const run = useCallback(
    async (action: string, detail: string, fn: () => Promise<void>): Promise<boolean> => {
      if (!(await ensureEditor())) return false;
      setBusy(true);
      try {
        await fn();
        await log(action, detail);
        await refresh();
        return true;
      } catch (e) {
        notify(e instanceof Error ? e.message : String(e));
        await refresh();
        return false;
      } finally {
        setBusy(false);
      }
    },
    [ensureEditor, log, notify, refresh],
  );

  const tableName = useCallback((id: string | null) => (id && d ? `โต๊ะ ${d.numbers.get(id) ?? "?"}` : "รอดำเนินการ"), [d]);

  const store: Store = {
    state,
    d,
    error,
    busy,
    tab,
    setTab: (t) => {
      setTab(t);
      setSheets([]);
    },
    sheets,
    openSheet: (s) => setSheets((st) => [...st, s]),
    closeSheet: () => setSheets((st) => st.slice(0, -1)),
    closeAllSheets: () => setSheets([]),
    moving,
    startMove: (m) => {
      setMoving(m);
      setSheets([]);
      setTab("map");
    },
    cancelMove: () => setMoving(null),
    focusTable,
    goToTable: (id) => {
      setTab("map");
      setSheets([{ type: "table", id }]);
      setFocusTable(id);
      setTimeout(() => setFocusTable((f) => (f === id ? null : f)), 2500);
    },
    toast,
    notify,
    editor,
    canEdit: editor !== null,
    actor,
    login: async (pin, name) => {
      const { data, error } = await db().rpc("login_edit", { p_pin: pin, p_name: name });
      if (error) return error.message;
      const res = data as { ok: boolean; token?: string; name?: string; error?: string };
      if (!res.ok || !res.token) return res.error ?? "เข้าโหมดแก้ไขไม่สำเร็จ";
      setEditToken(res.token);
      storeToken(res.token);
      setEditor(res.name ?? name);
      notify(`เข้าโหมดแก้ไขแล้ว (${res.name ?? name})`);
      return null;
    },
    logout: async () => {
      await db().rpc("logout_edit");
      dropEditor();
      setMoving(null);
      setSheets([]);
      notify("ออกจากโหมดแก้ไขแล้ว");
    },

    moveTo: async (tableId, guestIds, label) => {
      const ids = guestIds ?? moving?.guestIds ?? [];
      const what = label ?? moving?.label ?? `${ids.length} คน`;
      const ok = await run(tableId ? "ย้ายโต๊ะ" : "เอาออกจากโต๊ะ", `${what} → ${tableName(tableId)}`, async () => {
        must(await db().rpc("move_guests", { p_guest_ids: ids, p_table: tableId }));
      });
      if (ok) {
        setMoving(null);
        notify(tableId ? `ย้าย ${what} ไป${tableName(tableId)} แล้ว` : `เอา ${what} ออกจากโต๊ะแล้ว → อยู่ใน “รอดำเนินการ”`);
      }
      return ok;
    },
    moveTable: async (fromId, toId) => {
      const from = tableName(fromId);
      const to = tableName(toId);
      let bumped = 0;
      const ok = await run("ย้ายทั้งโต๊ะ", `${from} → ${to}`, async () => {
        bumped = must(await db().rpc("move_table", { p_from: fromId, p_to: toId, p_actor: actor })) as number;
      });
      if (ok) {
        setMoving(null);
        notify(`ย้ายทั้ง${from}ไป${to}แล้ว${bumped ? ` · คนเดิม ${bumped} คนอยู่ใน “รอดำเนินการ”` : ""}`);
      }
      return ok;
    },
    updateParty: async (id, patch) => {
      const p = d?.partyById.get(id);
      await run("แก้ข้อมูลแขก", p ? partyLabel({ ...p, ...patch }) : id, async () => {
        must(await db().from("parties").update(patch).eq("id", id));
      });
    },
    setPartySize: async (id, size) => {
      const p = d?.partyById.get(id);
      await run("แก้จำนวนคน", `${p ? partyLabel(p) : id}: ${p?.size} → ${size}`, async () => {
        must(await db().rpc("set_party_size", { p_party: id, p_size: size }));
      });
    },
    setPartyStatus: async (id, status) => {
      const p = d?.partyById.get(id);
      await run("เปลี่ยนสถานะ", `${p ? partyLabel(p) : id} → ${STATUS_LABEL[status]}`, async () => {
        must(await db().from("guests").update({ status }).eq("party_id", id));
      });
    },
    updateGuest: async (id, patch) => {
      await run("แก้ที่นั่ง", JSON.stringify(patch), async () => {
        must(await db().from("guests").update(patch).eq("id", id));
      });
    },
    addParty: async (draft) => {
      let newId: string | null = null;
      await run("เพิ่มแขก", `${partyLabel(draft)} ×${draft.size}`, async () => {
        const row = must(await db().from("parties").insert(draft).select("id").single()) as { id: string };
        newId = row.id;
        const guests = Array.from({ length: draft.size }, (_, i) => ({ kind: "guest", party_id: row.id, member_no: i + 1 }));
        must(await db().from("guests").insert(guests));
      });
      return newId;
    },
    deleteParty: async (id) => {
      const p = d?.partyById.get(id);
      await run("ลบแขก", p ? `${partyLabel(p)} ×${p.size}` : id, async () => {
        // remember sheet rows so a later re-import does not bring them back
        if (p?.source_sheet) {
          must(
            await db()
              .from("import_ignore")
              .upsert({ source_sheet: p.source_sheet, name: p.name, nickname: p.nickname }, { ignoreDuplicates: true }),
          );
        }
        must(await db().from("parties").delete().eq("id", id));
      });
    },
    setSeatOrder: async (tableId, order, detail) => {
      await run("เปลี่ยนลำดับที่นั่ง", `${tableName(tableId)}: ${detail}`, async () => {
        must(await db().rpc("set_seat_order", { p_table: tableId, p_order: order }));
      });
    },
    setChecked: async (tableId, checked) => {
      await run(checked ? "เช็คโต๊ะแล้ว" : "ยกเลิกเช็คโต๊ะ", tableName(tableId), async () => {
        const patch = checked ? { checked_at: new Date().toISOString(), checked_by: actor } : { checked_at: null, checked_by: null };
        must(await db().from("tables").update(patch).eq("id", tableId));
      });
    },
    ackWarning: async (tableId, signature) => {
      await run(signature ? "ซ่อนคำเตือนโต๊ะ" : "แสดงคำเตือนโต๊ะ", tableName(tableId), async () => {
        must(await db().from("tables").update({ warn_ack: signature }).eq("id", tableId));
      });
    },
    setTableSign: async (tableId, signId) => {
      await run("เปลี่ยนป้ายโต๊ะ", `${tableName(tableId)} → ${signId ? d?.signById.get(signId)?.label : "ไม่มีป้าย"}`, async () => {
        must(await db().from("tables").update({ sign_id: signId }).eq("id", tableId));
      });
    },
    addTable: async (lane) => {
      const pos = Math.max(-1, ...(state?.tables.filter((t) => t.lane === lane).map((t) => t.pos) ?? [])) + 1;
      await run("เพิ่มโต๊ะ", lane, async () => {
        must(await db().from("tables").insert({ lane, pos }));
      });
    },
    deleteTable: async (id) => {
      const name = tableName(id);
      const ok = await run("ลบโต๊ะ", name, async () => {
        must(await db().rpc("delete_table", { p_table: id }));
      });
      if (ok) setSheets([]);
    },
    reserveSeat: async (tableId) => {
      const cap = state?.settings.seats_per_table ?? 8;
      const used = new Set((d?.guestsByTable.get(tableId) ?? []).map((g) => g.seat_no));
      const seat = Array.from({ length: cap }, (_, i) => i + 1).find((n) => !used.has(n));
      if (!seat) return notify("โต๊ะเต็มแล้ว");
      await run("จองที่", tableName(tableId), async () => {
        must(await db().from("guests").insert({ kind: "reserved", display_name: "จองไว้", table_id: tableId, seat_no: seat }));
      });
    },
    unreserve: async (guestId) => {
      await run("ยกเลิกจองที่", "", async () => {
        must(await db().from("guests").delete().eq("id", guestId).eq("kind", "reserved"));
      });
    },
    updateSettings: async (patch) => {
      await run("ตั้งค่าผัง", JSON.stringify(patch), async () => {
        must(await db().from("settings").update(patch).eq("id", 1));
      });
    },
    updateSign: async (id, patch) => {
      await run("แก้ป้ายโต๊ะ", `${d?.signById.get(id)?.label} → ${patch.label ?? ""}`, async () => {
        must(await db().from("signs").update(patch).eq("id", id));
      });
    },
    runAutoAssign: async () => {
      if (!state || !(await ensureEditor())) return;
      const res = autoAssign({ settings: state.settings, signs: state.signs, parties: state.parties, guests: state.guests });
      setBusy(true);
      try {
        must(await db().rpc("apply_layout", { p_tables: res.tables, p_seats: res.seats, p_actor: actor }));
        lastSnapshotAt.current = Date.now();
        await refresh();
        notify(`จัดอัตโนมัติแล้ว: ${res.tables.length} โต๊ะ${res.unseated.length ? ` (รอดำเนินการ ${res.unseated.length} คน)` : ""}`);
      } catch (e) {
        notify(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    createSnapshot: async (reason) => {
      if (!(await ensureEditor())) return;
      try {
        must(await db().rpc("create_snapshot", { p_reason: reason, p_actor: actor }));
        lastSnapshotAt.current = Date.now();
        notify("บันทึก snapshot แล้ว");
      } catch (e) {
        notify(e instanceof Error ? e.message : String(e));
      }
    },
    restoreSnapshot: async (id) => {
      if (!(await ensureEditor())) return;
      setBusy(true);
      try {
        must(await db().rpc("restore_snapshot", { p_id: id, p_actor: actor }));
        await refresh();
        notify(`กู้คืน snapshot #${id} แล้ว`);
      } catch (e) {
        notify(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    listSnapshots: async () =>
      must(await db().from("snapshots").select("id,at,reason,actor").order("id", { ascending: false }).limit(100)) as SnapshotMeta[],
    listChanges: async () =>
      must(await db().from("change_log").select("*").order("id", { ascending: false }).limit(200)) as ChangeLogEntry[],
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
