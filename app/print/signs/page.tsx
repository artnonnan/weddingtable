"use client";

import { Mali } from "next/font/google";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { signLines } from "@/lib/layout";
import { useStore } from "@/lib/store";

const mali = Mali({ subsets: ["thai", "latin"], weight: "700" });

/** Blank strip at the top and bottom of the sheet, folded under (or glued) to make the tent's base. */
const FLAP_MM = 10;
const FACE_MM = (297 - 2 * FLAP_MM) / 2;
/** The 5×7 in design scaled to the face height; the background stretches to the full 105 mm width, the text keeps its proportions. */
const FACE_SCALE = FACE_MM / 177.8;
const SHRINK_KEY = "signPrintShrink";

/** One face of a tent card on public/sign-template.jpg (template/template.svg without its text). */
function Face({ num, label, flip }: { num: number | undefined; label: string; flip?: boolean }) {
  return (
    <div className={`relative w-[105mm] overflow-hidden ${flip ? "rotate-180" : ""}`} style={{ height: `${FACE_MM}mm` }}>
      <img src="/sign-template.jpg" alt="" className="absolute inset-0 size-full" />
      <div className="absolute left-1/2 top-0 h-[7in] w-[5in] origin-top" style={{ transform: `translateX(-50%) scale(${FACE_SCALE})` }}>
        <div className="absolute inset-x-0 top-[70pt] text-center text-[116pt] leading-[120pt]">{num}</div>
        <div className="absolute inset-x-[36pt] bottom-[104pt] top-[192pt] flex items-center justify-center">
          {/* a spare table without a name prints its number only */}
          {label.trim() && <FitLines lines={signLines(label)} />}
        </div>
      </div>
    </div>
  );
}

const BASE_PT = 100;

interface Card {
  key: string;
  num: number | undefined;
  label: string;
}

/** Sizes the label so its widest line spans the white panel edge to edge, shrinking only if the lines would run out of height. */
function FitLines({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<number>();
  useLayoutEffect(() => {
    let live = true;
    // measure with the real font, otherwise the fallback font's widths are used
    document.fonts.ready.then(() => {
      const el = ref.current;
      const box = el?.parentElement;
      if (!live || !el || !box) return;
      setSize(BASE_PT * Math.min(box.clientWidth / el.offsetWidth, box.clientHeight / el.offsetHeight));
    });
    return () => {
      live = false;
    };
  }, [lines.join("\n")]);
  return (
    <div ref={ref} className={`flex flex-col items-center leading-[1.35] ${size ? "" : "invisible"}`} style={{ fontSize: `${size ?? BASE_PT}pt` }}>
      {lines.map((line) => (
        <span key={line} className="whitespace-nowrap">
          {line}
        </span>
      ))}
    </div>
  );
}

/** Two tables per A4 sheet: each column is one tent card, cut along the vertical line and folded along the horizontal one. */
export default function PrintSigns() {
  const { state, d, error } = useStore();
  // borderless printing enlarges the page past the paper; shrinking around the centre keeps the art and the cut/fold lines in place
  const [shrink, setShrink] = useState(0);
  useEffect(() => {
    try {
      setShrink(Number(localStorage.getItem(SHRINK_KEY)) || 0);
    } catch {
      /* ignore */
    }
  }, []);
  const chooseShrink = (n: number) => {
    setShrink(n);
    try {
      localStorage.setItem(SHRINK_KEY, String(n));
    } catch {
      /* ignore */
    }
  };

  if (error) return <p className="p-6 text-danger">{error}</p>;
  if (!state || !d) return <p className="p-6 text-muted">กำลังโหลด…</p>;

  const tables = state.tables.filter((t) => t.sign_id).sort((a, b) => d.numbers.get(a.id)! - d.numbers.get(b.id)!);
  // spare tables number on from the last table; special signs (organiser, band…) carry no number. Neither is on the map.
  const last = d.numbers.size;
  const spares = state.settings.print_spares ?? [];
  const specials = state.settings.print_specials ?? [];
  const cards: Card[] = [
    ...tables.map((t) => ({ key: t.id, num: d.numbers.get(t.id), label: d.signById.get(t.sign_id!)!.label })),
    ...spares.map((label, i) => ({ key: `spare-${i}`, num: last + i + 1, label })),
    ...specials.map((label, i) => ({ key: `special-${i}`, num: undefined, label })),
  ];
  const sheets = Array.from({ length: Math.ceil(cards.length / 2) }, (_, i) => cards.slice(i * 2, i * 2 + 2));

  return (
    <>
      <style>{`@page { size: A4 portrait; margin: 0; } @media print { .sheet { break-after: page; } .sheet:last-child { break-after: auto; } }`}</style>
      <div className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-paper p-3">
        <button onClick={() => window.print()} className="min-h-11 shrink-0 rounded-xl bg-accent px-5 font-medium text-white">
          พิมพ์ {sheets.length} แผ่น
        </button>
        <span className="text-sm text-muted">{tables.length} โต๊ะ{spares.length ? ` + เผื่อ ${spares.length}` : ""}{specials.length ? ` + ป้ายพิเศษ ${specials.length}` : ""} · A4 แนวตั้ง · ไม่มีขอบ · ตัดตามเส้นแนวตั้ง พับตามเส้นแนวนอน · ขอบบน-ล่าง {FLAP_MM / 10} ซม. ไว้พับเป็นฐาน</span>
        <label className="ml-auto flex shrink-0 items-center gap-2 text-sm">
          ย่อชดเชยขอบ
          <select className="min-h-9 rounded-lg border border-line bg-card px-2" value={shrink} onChange={(e) => chooseShrink(Number(e.target.value))}>
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}%
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-col items-center gap-6 bg-paper py-6 print:block print:gap-0 print:bg-white print:py-0">
        {sheets.map((pair) => (
          <div key={pair[0].key} className={`sheet relative h-[297mm] w-[210mm] overflow-hidden bg-white shadow print:shadow-none ${mali.className}`} style={{ color: "#7c5a32" }}>
            <div className="relative grid size-full grid-cols-2 content-start" style={{ paddingBlock: `${FLAP_MM}mm`, transform: `scale(${1 - shrink / 100})` }}>
            <span className="absolute inset-x-0 border-t border-dashed border-black/30" style={{ top: `${FLAP_MM}mm` }} />
            <span className="absolute inset-x-0 border-t border-dashed border-black/30" style={{ bottom: `${FLAP_MM}mm` }} />
            {[true, false].flatMap((flip) =>
              // an odd table count leaves the last sheet's right column empty, so the left one still folds
              [pair[0], pair[1]].map((c, col) => (c ? <Face key={`${col}-${flip}`} num={c.num} label={c.label} flip={flip} /> : <div key={`${col}-${flip}`} />)),
            )}
            </div>
            <span className="absolute inset-y-0 left-1/2 border-l border-dashed border-black/30" />
            <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-black/30" />
          </div>
        ))}
      </div>
    </>
  );
}
