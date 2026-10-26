"use client";

// 3D banquet hall: same data, sheets and permissions as the 2D map.
// Tables sit at their (lane, pos) like the 2D grid, viewed from the back of the hall towards the stage.
import { Html, Instance, Instances, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { guestLabel, partyLabel, physicalLanes } from "@/lib/layout";
import { SOLO_COLOR } from "@/lib/partyColors";
import { useStore } from "@/lib/store";
import type { Guest, Party, Table } from "@/lib/types";
import { useTableTap } from "../useTableTap";

// ---------------------------------------------------------------- dimensions (metres-ish)

const SX = 5.2; // between lanes
const SZ = 4.8; // between rows
const TABLE_R = 1.0;
const SEAT_R = 1.42;
const TABLE_Y = 0.75;
// Zoom levels by camera distance to the look-at point:
//   far  → table badges show only the number      mid → number + sign
//   near → names of the table(s) at the centre of the view
const MID_DISTANCE = 34;
const NEAR_DISTANCE = 16;
const NAMES_RADIUS = 2.6; // only the table being looked at (neighbours would overlap)
type Zoom = "far" | "mid" | "near";
const DIM = new THREE.Color("#ebe5dd");

/** Camera moves driven by the on-screen buttons. */
interface ViewApi {
  zoom: (factor: number) => void;
  rotate: (radians: number) => void;
  tilt: () => void;
  home: () => void;
  goTable: (num: number) => boolean;
}

interface Seat {
  guest: Guest;
  table: Table;
  pos: THREE.Vector3; // where the piece sits
  angle: number;
  color: string;
}

/**
 * A press only counts as a tap when the finger barely moved and only one finger was down.
 * Anything else was a pan / pinch, so nothing should open.
 */
const press = { x: 0, y: 0, moved: false, fingers: 0 };
const TAP_SLOP = 8;
const isTap = () => !press.moved;

/** Clicks on the HTML labels bubble through the 3D canvas too; only real canvas taps count as "empty floor". */
const onCanvas = (e: Event) => (e.target as HTMLElement | null)?.tagName === "CANVAS";

const mix = (hex: string, toward: string, t: number) => "#" + new THREE.Color(hex).lerp(new THREE.Color(toward), t).getHexString();

function tableXZ(t: Table, lanes: ReturnType<typeof physicalLanes>): [number, number] {
  return [(lanes.indexOf(t.lane) - 1) * SX, t.pos * SZ];
}

function seatAngle(seatNo: number, cap: number) {
  // seat 1 faces the stage (towards -z), going clockwise seen from above
  return Math.PI + ((seatNo - 1) / cap) * Math.PI * 2;
}

// ---------------------------------------------------------------- root

export default function Hall3D() {
  const { state, d, moving, canEdit, openSheet, startMove, focusTable } = useStore();
  const [selected, setSelected] = useState<string | null>(null); // guest id
  const [askMove, setAskMove] = useState(false);
  const focusRef = useRef<((t: Table) => void) | null>(null);
  const api = useRef<ViewApi | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(480);

  // fill the screen between this box and the bottom tab bar
  useLayoutEffect(() => {
    const fit = () => box.current && setHeight(Math.max(380, window.innerHeight - box.current.getBoundingClientRect().top - window.scrollY - 76));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // after a move finishes, keep the highlight a moment so you see where they went
  const wasMoving = useRef(false);
  useEffect(() => {
    if (wasMoving.current && !moving) {
      const t = setTimeout(() => setSelected(null), 1500);
      wasMoving.current = false;
      return () => clearTimeout(t);
    }
    wasMoving.current = !!moving;
  }, [moving]);

  // search "เปิดในผัง" / goToTable → fly there
  useEffect(() => {
    if (!focusTable || !d) return;
    const t = d.tableById.get(focusTable);
    if (t) focusRef.current?.(t);
  }, [focusTable, d]);

  if (!state || !d) return null;
  const guest = selected ? state.guests.find((g) => g.id === selected) : undefined;
  const party = guest?.party_id ? d.partyById.get(guest.party_id) : undefined;
  const members = party ? (d.membersByParty.get(party.id) ?? []) : [];

  const move = (ids: string[], label: string) => {
    setAskMove(false);
    startMove({ guestIds: ids, label });
  };

  return (
    <div
      ref={box}
      style={{ height }}
      className="relative isolate select-none overflow-hidden rounded-2xl border border-line bg-[#f4efe8]"
      onPointerDownCapture={(e) => {
        press.fingers += 1;
        // a second finger means pinch / two-finger pan, never a tap
        if (press.fingers > 1) press.moved = true;
        else Object.assign(press, { x: e.clientX, y: e.clientY, moved: false });
      }}
      onPointerMoveCapture={(e) => {
        if (e.pointerType === "mouse" && e.buttons === 0) return;
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP) press.moved = true;
      }}
      onPointerUpCapture={() => (press.fingers = Math.max(0, press.fingers - 1))}
      onPointerCancelCapture={() => (press.fingers = Math.max(0, press.fingers - 1))}
    >
      <Canvas
        dpr={[1, 2]}
        // no adaptive down-scaling: it shrank the drawn area without shrinking the canvas
        performance={{ min: 1 }}
        // measure without scroll offsets: the sticky "moving" banner and page scroll otherwise shrink the drawing area
        resize={{ scroll: false, debounce: 0 }}
        camera={{ fov: 45, near: 0.1, far: 400, position: [0, 30, 60] }}
        onPointerMissed={(e) => !moving && isTap() && onCanvas(e) && setSelected(null)}
        fallback={<p className="p-6 text-center text-sm text-muted">เครื่องนี้แสดง 3D ไม่ได้ ใช้โหมด 2D แทน</p>}
      >
        <Scene selected={selected} onSelect={setSelected} focusRef={focusRef} apiRef={api} />
      </Canvas>

      {!guest && !moving && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center"><span className="rounded-full bg-card/85 px-3 py-0.5 text-[11px] text-muted shadow-sm">
          ลากเพื่อเลื่อน · ถ่างนิ้วเพื่อซูม · หมุนด้วยปุ่มขวาล่าง</span>
        </div>
      )}

      <ViewControls api={api} raised={!!guest} />

      {guest && party && (
        <div className="absolute inset-x-2 bottom-2 z-20 rounded-2xl border border-line bg-card/95 p-3 shadow-lg backdrop-blur">
          <div className="flex items-start gap-2">
            <span className="mt-1 size-3.5 shrink-0 rounded-full" style={{ background: d.partyColor.get(party.id) ?? SOLO_COLOR }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{guestLabel(guest, party)}</span>
              <span className="block truncate text-xs text-muted">
                {party.host} · {party.village || "-"} · {guest.table_id ? `โต๊ะ ${d.numbers.get(guest.table_id)}` : "รอดำเนินการ"}
                {members.length > 1 && ` · มาด้วยกัน ${members.length} คน`}
              </span>
            </span>
            <button onClick={() => setSelected(null)} className="-mr-1 -mt-1 flex size-9 items-center justify-center rounded-full text-muted" aria-label="ปิด">
              ✕
            </button>
          </div>
          {askMove ? (
            <div className="mt-2 flex gap-2">
              <button
                className="min-h-10 flex-1 rounded-xl bg-accent text-sm font-medium text-white"
                onClick={() => move(members.map((m) => m.id), `${partyLabel(party)} (${members.length} คน)`)}
              >
                ทั้งกลุ่ม ({members.length})
              </button>
              <button className="min-h-10 flex-1 rounded-xl border border-line text-sm" onClick={() => move([guest.id], guestLabel(guest, party))}>
                เฉพาะคนนี้
              </button>
              <button className="min-h-10 px-2 text-sm text-muted" onClick={() => setAskMove(false)}>
                ยกเลิก
              </button>
            </div>
          ) : (
            !moving && (
              <div className="mt-2 flex gap-2">
                <button className="min-h-10 flex-1 rounded-xl border border-line text-sm font-medium" onClick={() => openSheet({ type: "party", id: party.id })}>
                  ดูข้อมูล
                </button>
                {canEdit && (
                  <button
                    className="min-h-10 flex-1 rounded-xl border-2 border-accent text-sm font-medium text-accent"
                    onClick={() => (members.length > 1 ? setAskMove(true) : move([guest.id], guestLabel(guest, party)))}
                  >
                    ย้าย
                  </button>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- on-screen camera buttons

/** Press once for one step; keep holding to repeat. */
function useRepeat(fn: () => void) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      fn();
      stop();
      timer.current = setInterval(fn, 160);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

function CtrlButton({ label, title, onPress, repeat }: { label: string; title: string; onPress: () => void; repeat?: boolean }) {
  const held = useRepeat(onPress);
  return (
    <button
      aria-label={title}
      title={title}
      {...(repeat ? held : { onClick: onPress })}
      className="flex size-11 items-center justify-center rounded-xl border border-line bg-card/90 text-lg font-semibold text-ink shadow-sm backdrop-blur active:bg-accent-soft"
    >
      {label}
    </button>
  );
}

function ViewControls({ api, raised }: { api: React.RefObject<ViewApi | null>; raised: boolean }) {
  const [askTable, setAskTable] = useState(false);
  const [num, setNum] = useState("");
  const [err, setErr] = useState(false);
  const go = () => {
    const ok = api.current?.goTable(Number.parseInt(num, 10)) ?? false;
    setErr(!ok);
    if (ok) {
      setAskTable(false);
      setNum("");
    }
  };
  return (
    <div className={`absolute right-2 z-20 flex flex-col items-end gap-1.5 transition-[bottom] ${raised ? "bottom-[128px]" : "bottom-2"}`}>
      {askTable && (
        <form
          className="flex items-center gap-1 rounded-xl border border-line bg-card p-1 shadow"
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
        >
          <input
            autoFocus
            inputMode="numeric"
            placeholder="เลขโต๊ะ"
            value={num}
            onChange={(e) => {
              setNum(e.target.value.replace(/\D/g, ""));
              setErr(false);
            }}
            className={`h-9 w-20 rounded-lg border px-2 text-center text-base outline-none ${err ? "border-danger" : "border-line"}`}
          />
          <button type="submit" className="h-9 rounded-lg bg-accent px-3 text-sm font-medium text-white">
            ไป
          </button>
        </form>
      )}
      <CtrlButton label="#" title="ไปโต๊ะ…" onPress={() => setAskTable((v) => !v)} />
      <CtrlButton label="＋" title="ซูมเข้า" repeat onPress={() => api.current?.zoom(0.8)} />
      <CtrlButton label="－" title="ซูมออก" repeat onPress={() => api.current?.zoom(1.25)} />
      <div className="flex gap-1.5">
        <CtrlButton label="⟲" title="หมุนซ้าย" repeat onPress={() => api.current?.rotate(Math.PI / 8)} />
        <CtrlButton label="⟳" title="หมุนขวา" repeat onPress={() => api.current?.rotate(-Math.PI / 8)} />
      </div>
      <CtrlButton label="◩" title="สลับมุมสูง / มุมเฉียง" onPress={() => api.current?.tilt()} />
      <CtrlButton label="⌂" title="ดูทั้งห้อง" onPress={() => api.current?.home()} />
    </div>
  );
}

// ---------------------------------------------------------------- scene

function Scene({
  selected,
  onSelect,
  focusRef,
  apiRef,
}: {
  selected: string | null;
  onSelect: (id: string | null) => void;
  focusRef: React.RefObject<((t: Table) => void) | null>;
  apiRef: React.RefObject<ViewApi | null>;
}) {
  const { state, d, moving } = useStore();
  const { tap, canDrop } = useTableTap();
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const [nameTables, setNameTables] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState<Zoom>("far");
  const goal = useRef<{ target: THREE.Vector3; pos: THREE.Vector3 } | null>(null);

  const lanes = physicalLanes(state!.settings.bride_side);
  const cap = state!.settings.seats_per_table;
  const rows = Math.max(1, ...state!.tables.map((t) => t.pos + 1));
  const midZ = ((rows - 1) * SZ) / 2;

  // initial high oblique view from the back of the hall, whole room in frame
  const homeView = () => {
    const depth = (rows + 1) * SZ;
    const dist = Math.max(30, depth * 1.15);
    const tilt = 0.5; // radians away from straight down
    return { target: new THREE.Vector3(0, 0, midZ), pos: new THREE.Vector3(0, dist * Math.cos(tilt), midZ + dist * Math.sin(tilt)) };
  };
  useEffect(() => {
    const h = homeView();
    camera.position.copy(h.pos);
    controls.current?.target.copy(h.target);
    controls.current?.update();
    updateNames();
  }, []);

  // on-screen buttons: every move is relative to where the camera is heading and animated by the goal below
  const fly = (offsetFn: (o: THREE.Vector3) => THREE.Vector3) => {
    const c = controls.current;
    if (!c) return;
    const from = goal.current ?? { target: c.target.clone(), pos: camera.position.clone() };
    const o = offsetFn(from.pos.clone().sub(from.target));
    o.setLength(THREE.MathUtils.clamp(o.length(), 4, 120));
    goal.current = { target: from.target.clone(), pos: from.target.clone().add(o) };
  };
  apiRef.current = {
    zoom: (f) => fly((o) => o.multiplyScalar(f)),
    rotate: (a) => fly((o) => o.applyAxisAngle(new THREE.Vector3(0, 1, 0), a)),
    tilt: () =>
      fly((o) => {
        const sph = new THREE.Spherical().setFromVector3(o);
        sph.phi = sph.phi < 0.55 ? 0.95 : 0.25; // nearly straight down <-> oblique
        return new THREE.Vector3().setFromSpherical(sph);
      }),
    home: () => (goal.current = homeView()),
    goTable: (num) => {
      const t = state!.tables.find((x) => d!.numbers.get(x.id) === num);
      if (t) focusOn(t);
      return !!t;
    },
  };

  const seats: Seat[] = useMemo(() => {
    const out: Seat[] = [];
    for (const t of state!.tables) {
      const [x, z] = tableXZ(t, lanes);
      for (const g of d!.guestsByTable.get(t.id) ?? []) {
        if (!g.seat_no) continue;
        const angle = seatAngle(g.seat_no, cap);
        out.push({
          guest: g,
          table: t,
          angle,
          pos: new THREE.Vector3(x + Math.sin(angle) * SEAT_R, 0, z + Math.cos(angle) * SEAT_R),
          color: g.kind === "reserved" ? "#ffffff" : (d!.partyColor.get(g.party_id ?? "") ?? SOLO_COLOR),
        });
      }
    }
    return out;
  }, [state, d, lanes, cap]);

  const selGuest = selected ? state!.guests.find((g) => g.id === selected) : undefined;
  const selParty = selGuest?.party_id ?? null;
  const movingIds = new Set(moving?.guestIds ?? []);
  const highlightIds = new Set([...(selected ? [selected] : []), ...movingIds]);
  const anyHighlight = highlightIds.size > 0;

  const focusOn = (t: Table) => {
    const [x, z] = tableXZ(t, lanes);
    goal.current = { target: new THREE.Vector3(x, 0.6, z), pos: new THREE.Vector3(x, 9, z + 7) };
  };
  focusRef.current = focusOn;

  // fly the camera; any manual drag cancels the flight
  useFrame(() => {
    const c = controls.current;
    if (!c || !goal.current) return;
    c.target.lerp(goal.current.target, 0.12);
    camera.position.lerp(goal.current.pos, 0.12);
    c.update();
    if (camera.position.distanceTo(goal.current.pos) < 0.05 && c.target.distanceTo(goal.current.target) < 0.05) {
      goal.current = null;
      updateNames();
    }
  });

  // which tables show guest names: near the look-at point when zoomed in, plus the selected one
  const updateNames = () => {
    const c = controls.current;
    if (!c) return;
    const dist = camera.position.distanceTo(c.target);
    const nextZoom: Zoom = dist < NEAR_DISTANCE ? "near" : dist < MID_DISTANCE ? "mid" : "far";
    setZoom((z) => (z === nextZoom ? z : nextZoom));
    const near = nextZoom === "near";
    const next = new Set<string>();
    if (near) {
      for (const t of state!.tables) {
        const [x, z] = tableXZ(t, lanes);
        if (Math.hypot(x - c.target.x, z - c.target.z) < NAMES_RADIUS) next.add(t.id);
      }
    }
    if (selGuest?.table_id) next.add(selGuest.table_id);
    const key = [...next].sort().join();
    setNameTables((prev) => ([...prev].sort().join() === key ? prev : next));
  };
  useEffect(updateNames, [selected, state]);

  const pieceColor = (s: Seat) => {
    if (!anyHighlight) return s.color;
    const related = highlightIds.has(s.guest.id) || (selParty && s.guest.party_id === selParty);
    return related ? s.color : "#" + new THREE.Color(s.color).lerp(DIM, 0.75).getHexString();
  };
  const lift = (s: Seat) => (highlightIds.has(s.guest.id) ? 0.3 : 0);

  const people = seats.filter((s) => s.guest.kind === "guest");
  const held = seats.filter((s) => s.guest.kind === "reserved");
  const chairSpots = state!.tables.flatMap((t) => {
    const [x, z] = tableXZ(t, lanes);
    return Array.from({ length: cap }, (_, i) => {
      const a = seatAngle(i + 1, cap);
      return { key: `${t.id}:${i}`, x: x + Math.sin(a) * (SEAT_R + 0.12), z: z + Math.cos(a) * (SEAT_R + 0.12), a };
    });
  });

  const selectGuest = (s: Seat) => {
    if (!isTap()) return;
    if (moving) return tap(s.table.id); // while moving, tapping anyone means "this table"
    onSelect(s.guest.kind === "guest" ? s.guest.id : null);
    focusOn(s.table);
  };

  return (
    <>
      <color attach="background" args={["#f4efe8"]} />
      <hemisphereLight args={["#ffffff", "#d9cbb8", 1.1]} />
      <directionalLight position={[8, 20, 10]} intensity={1.4} />

      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        maxPolarAngle={Math.PI / 2.15}
        minDistance={4}
        maxDistance={120}
        // like a map: one finger moves around, two fingers zoom; rotating is done with the buttons
        touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }}
        mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
        screenSpacePanning={false}
        onStart={() => (goal.current = null)}
        onEnd={updateNames}
        onChange={() => {
          // keep the view over the hall
          const c = controls.current;
          if (c) {
            const x = THREE.MathUtils.clamp(c.target.x, -SX * 2, SX * 2);
            const z = THREE.MathUtils.clamp(c.target.z, -SZ * 1.5, rows * SZ);
            if (x !== c.target.x || z !== c.target.z) {
              camera.position.x += x - c.target.x;
              camera.position.z += z - c.target.z;
              c.target.x = x;
              c.target.z = z;
            }
          }
          if (goal.current) updateNames();
        }}
      />

      {/* floor + stage */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, midZ]} onClick={(e) => !moving && isTap() && onCanvas(e.nativeEvent) && onSelect(null)}>
        <planeGeometry args={[SX * 3 + 10, rows * SZ + 16]} />
        <meshStandardMaterial color="#efe7dc" />
      </mesh>
      <mesh position={[0, 0.3, -SZ * 0.95]}>
        <boxGeometry args={[SX * 3 + 1, 0.6, 2.2]} />
        <meshStandardMaterial color="#9c2f4f" />
      </mesh>
      <Html position={[0, 1.1, -SZ * 0.95]} center zIndexRange={[10, 0]} className="pointer-events-none">
        <span className="rounded-full bg-accent px-4 py-1 text-sm font-semibold tracking-widest text-white shadow">เวที</span>
      </Html>

      {state!.tables.map((t) => (
        <Table3D
          key={t.id}
          table={t}
          lanes={lanes}
          dropOk={moving ? canDrop(t.id) : null}
          showNames={nameTables.has(t.id)}
          zoom={zoom}
          selected={selected}
          onTap={() => {
            if (!isTap()) return;
            tap(t.id);
            if (!moving) focusOn(t);
          }}
          onSelectGuest={(g) => {
            const s = seats.find((x) => x.guest.id === g.id);
            if (s) selectGuest(s);
          }}
        />
      ))}

      {/* chairs */}
      <Instances limit={Math.max(1, chairSpots.length)}>
        <boxGeometry args={[0.42, 0.06, 0.42]} />
        <meshStandardMaterial color="#b9a58f" />
        {chairSpots.map((c) => (
          <Instance key={c.key} position={[c.x, 0.45, c.z]} rotation-y={c.a} />
        ))}
      </Instances>

      {/* people: board-game pieces (body + head), one colour per party */}
      <Instances limit={Math.max(1, people.length)}>
        <capsuleGeometry args={[0.2, 0.32, 6, 12]} />
        <meshStandardMaterial roughness={0.55} />
        {people.map((s) => (
          <Instance
            key={s.guest.id}
            position={[s.pos.x, 0.78 + lift(s), s.pos.z]}
            color={pieceColor(s)}
            onClick={(e) => {
              e.stopPropagation();
              selectGuest(s);
            }}
          />
        ))}
      </Instances>
      <Instances limit={Math.max(1, people.length)}>
        <sphereGeometry args={[0.19, 16, 12]} />
        <meshStandardMaterial roughness={0.5} />
        {people.map((s) => (
          <Instance
            key={s.guest.id}
            position={[s.pos.x, 1.27 + lift(s), s.pos.z]}
            color={pieceColor(s)}
            onClick={(e) => {
              e.stopPropagation();
              selectGuest(s);
            }}
          />
        ))}
      </Instances>

      {/* held seats: see-through pieces */}
      {held.length > 0 && (
        <Instances limit={held.length}>
          <capsuleGeometry args={[0.2, 0.32, 4, 8]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.45} />
          {held.map((s) => (
            <Instance key={s.guest.id} position={[s.pos.x, 0.78, s.pos.z]} onClick={(e) => (e.stopPropagation(), isTap() && tap(s.table.id))} />
          ))}
        </Instances>
      )}

      {/* glow rings around highlighted people (selected = thick, same party = thin) */}
      {seats
        .filter((s) => s.guest.kind === "guest" && (highlightIds.has(s.guest.id) || (selParty && s.guest.party_id === selParty)))
        .map((s) => (
          <mesh key={`ring-${s.guest.id}`} position={[s.pos.x, 0.08, s.pos.z]} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[0.3, highlightIds.has(s.guest.id) ? 0.48 : 0.38, 32]} />
            <meshBasicMaterial color={s.color === SOLO_COLOR ? "#9c2f4f" : s.color} transparent opacity={0.9} />
          </mesh>
        ))}
    </>
  );
}

// ---------------------------------------------------------------- one table

function Table3D({
  table,
  lanes,
  dropOk,
  showNames,
  zoom,
  selected,
  onTap,
  onSelectGuest,
}: {
  table: Table;
  lanes: ReturnType<typeof physicalLanes>;
  dropOk: boolean | null; // null = not moving
  showNames: boolean;
  zoom: Zoom;
  selected: string | null;
  onTap: () => void;
  onSelectGuest: (g: Guest) => void;
}) {
  const { state, d } = useStore();
  const [x, z] = tableXZ(table, lanes);
  const cap = state!.settings.seats_per_table;
  const sign = table.sign_id ? d!.signById.get(table.sign_id) : undefined;
  const warn = d!.warnings.get(table.id)?.shown ?? "none";
  const occ = d!.guestsByTable.get(table.id) ?? [];
  const num = d!.numbers.get(table.id);
  const people = occ.filter((g) => g.kind === "guest").length;
  const cloth = sign ? mix(sign.color, "#ffffff", 0.72) : "#ffffff";
  const dim = dropOk === false;

  const statusColor = warn === "wrong" ? "#d0342c" : warn === "mixed" ? "#e8772e" : table.checked_at ? "#2e8b57" : null;

  // group colour arcs on the table edge, one per seat that belongs to a group
  const arcs = occ
    .filter((g) => g.kind === "guest" && g.seat_no && g.party_id)
    .map((g) => ({ g, color: d!.partyColor.get(g.party_id!) ?? SOLO_COLOR }))
    .filter((a) => a.color !== SOLO_COLOR);

  return (
    <group position={[x, 0, z]}>
      {/* status ring on the floor */}
      {(statusColor || dropOk) && (
        <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[1.95, 2.15, 48]} />
          <meshBasicMaterial color={dropOk ? "#9c2f4f" : statusColor!} transparent opacity={dropOk ? 0.85 : 0.75} />
        </mesh>
      )}

      {/* table: leg + top with a cloth in the sign colour */}
      <mesh position={[0, TABLE_Y / 2, 0]}>
        <cylinderGeometry args={[0.12, 0.2, TABLE_Y, 12]} />
        <meshStandardMaterial color="#cbbba7" />
      </mesh>
      <mesh
        position={[0, TABLE_Y, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onTap();
        }}
      >
        <cylinderGeometry args={[TABLE_R, TABLE_R, 0.08, 40]} />
        <meshStandardMaterial color={dim ? "#e4ded6" : cloth} transparent={dim} opacity={dim ? 0.6 : 1} />
      </mesh>

      {/* group arcs on the rim */}
      {arcs.map(({ g, color }) => {
        const a = seatAngle(g.seat_no!, cap);
        const span = ((Math.PI * 2) / cap) * 0.8;
        return (
          <mesh key={g.id} position={[0, TABLE_Y + 0.05, 0]} rotation={[-Math.PI / 2, 0, a - Math.PI / 2 - span / 2]}>
            <ringGeometry args={[TABLE_R - 0.16, TABLE_R - 0.02, 16, 1, 0, span]} />
            <meshBasicMaterial color={color} side={THREE.DoubleSide} />
          </mesh>
        );
      })}

      <TentCard label={sign?.label ?? "ไม่มีป้าย"} color={sign?.color ?? "#a8a29e"} onTap={onTap} />

      {/* floating badge: number + sign, readable from far away */}
      <Html position={[0, showNames ? 3.9 : 2.0, 0]} center zIndexRange={[10, 0]}>
        {zoom === "far" ? (
          <button
            onClick={onTap}
            className={`relative flex size-6 items-center justify-center rounded-full text-[11px] font-bold text-white shadow ${dim ? "opacity-40" : ""}`}
            style={{ background: sign?.color ?? "#a8a29e" }}
          >
            {num}
            {(table.checked_at || warn === "wrong") && (
              <span
                className={`absolute -right-1 -top-1 size-2.5 rounded-full border border-white ${warn === "wrong" ? "bg-danger" : "bg-ok"}`}
              />
            )}
          </button>
        ) : (
          <button
            onClick={onTap}
            className={`flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold text-white shadow ${dim ? "opacity-40" : ""}`}
            style={{ background: sign?.color ?? "#a8a29e" }}
          >
            <span className="text-sm">{num}</span>
            <span className="max-w-24 truncate font-medium">{sign?.label ?? "ไม่มีป้าย"}</span>
            <span className="opacity-80">
              {people}/{cap}
            </span>
            {table.checked_at && <span>✓</span>}
            {warn === "wrong" && <span>⚠️</span>}
          </button>
        )}
      </Html>

      {/* guest names around the table */}
      {showNames &&
        occ
          .filter((g) => g.seat_no)
          .map((g) => {
            const a = seatAngle(g.seat_no!, cap);
            const r = 2.25;
            const p = g.party_id ? d!.partyById.get(g.party_id) : undefined;
            const color = g.kind === "reserved" ? "#cbd5e1" : (d!.partyColor.get(g.party_id ?? "") ?? SOLO_COLOR);
            const isSel = g.id === selected;
            return (
              <Html key={g.id} position={[Math.sin(a) * r, 1.15, Math.cos(a) * r]} center zIndexRange={[isSel ? 11 : 10, 0]}>
                <button
                  onClick={() => isTap() && g.kind === "guest" && onSelectGuest(g)}
                  className={`flex max-w-[132px] items-center gap-1 overflow-hidden rounded-full border bg-white/95 pr-2 text-left shadow-sm ${
                    isSel ? "border-accent text-[13px] font-semibold" : "border-black/10 text-[11px]"
                  }`}
                >
                  <span className="h-5 w-1.5 shrink-0" style={{ background: color }} />
                  <span className="truncate py-0.5 text-ink">{g.kind === "reserved" ? (g.display_name ?? "จองไว้") : nameOf(g, p)}</span>
                </button>
              </Html>
            );
          })}
    </group>
  );
}

/** Real name first (falls back to nickname), with "2/5" for parties of several people. */
function nameOf(g: Guest, party: Party | undefined): string {
  if (g.display_name) return g.display_name;
  if (!party) return "-";
  const base = party.name || party.nickname || "-";
  return party.size > 1 ? `${base} ${g.member_no}/${party.size}` : base;
}

// ---------------------------------------------------------------- tent card on the table

function TentCard({ label, color, onTap }: { label: string; color: string; onTap: () => void }) {
  const texture = useSignTexture(label, color);
  const W = 0.9;
  const H = 0.42;
  const tilt = 0.32; // radians from vertical
  return (
    <group position={[0, TABLE_Y + 0.04, 0]} onClick={(e) => (e.stopPropagation(), onTap())}>
      {[1, -1].map((side) => (
        <mesh
          key={side}
          position={[0, (H / 2) * Math.cos(tilt), side * (H / 2) * Math.sin(tilt)]}
          rotation={[side * tilt, side === 1 ? 0 : Math.PI, 0]}
        >
          <planeGeometry args={[W, H]} />
          <meshStandardMaterial map={texture ?? undefined} color={texture ? "#ffffff" : color} side={THREE.FrontSide} />
        </mesh>
      ))}
    </group>
  );
}

/** Thai text rendered by the browser's own font engine onto a canvas, so vowels and tone marks are right. */
function useSignTexture(label: string, color: string): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let cancelled = false;
    let made: THREE.CanvasTexture | null = null;
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 236;
      const g = c.getContext("2d")!;
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, 26);
      const family = getComputedStyle(document.body).fontFamily;
      let size = 92;
      do {
        g.font = `700 ${size}px ${family}`;
        size -= 4;
      } while (g.measureText(label).width > c.width - 40 && size > 30);
      g.fillStyle = color;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(label, c.width / 2, c.height / 2 + 16);
      made = new THREE.CanvasTexture(c);
      made.colorSpace = THREE.SRGBColorSpace;
      made.anisotropy = 4;
      setTex(made);
    });
    return () => {
      cancelled = true;
      made?.dispose();
    };
  }, [label, color]);
  return tex;
}
