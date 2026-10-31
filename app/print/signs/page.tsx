"use client";

import { Mali } from "next/font/google";
import { signFontPt, signLines } from "@/lib/layout";
import { useStore } from "@/lib/store";

const mali = Mali({ subsets: ["thai", "latin"], weight: "700" });

/** The 5×7 in design scaled to a quarter of A4 (148.5 mm tall); it is 1 mm wider than the cell, so the sides crop evenly. */
const FACE_SCALE = 148.5 / 177.8;

/** One face of a tent card on public/sign-template.jpg (template/template.svg without its text). */
function Face({ num, label, flip }: { num: number | undefined; label: string; flip?: boolean }) {
  const lines = signLines(label);
  const size = signFontPt(lines);
  return (
    <div className={`relative h-[148.5mm] w-[105mm] overflow-hidden ${flip ? "rotate-180" : ""}`}>
      <div className="absolute left-[-0.54mm] top-0 h-[7in] w-[5in] origin-top-left" style={{ transform: `scale(${FACE_SCALE})` }}>
        <img src="/sign-template.jpg" alt="" className="absolute inset-0 size-full" />
        <div className="absolute inset-x-0 top-[70pt] text-center text-[116pt] leading-[120pt]">{num}</div>
        <div className="absolute inset-x-[36pt] bottom-[104pt] top-[192pt] flex flex-col items-center justify-center">
          {lines.map((line) => (
            <span key={line} className="whitespace-nowrap leading-[1.75]" style={{ fontSize: `${size}pt` }}>
              {line}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Two tables per A4 sheet: each column is one tent card, cut along the vertical line and folded along the horizontal one. */
export default function PrintSigns() {
  const { state, d, error } = useStore();
  if (error) return <p className="p-6 text-danger">{error}</p>;
  if (!state || !d) return <p className="p-6 text-muted">กำลังโหลด…</p>;

  const tables = state.tables.filter((t) => t.sign_id).sort((a, b) => d.numbers.get(a.id)! - d.numbers.get(b.id)!);
  const sheets = Array.from({ length: Math.ceil(tables.length / 2) }, (_, i) => tables.slice(i * 2, i * 2 + 2));

  return (
    <>
      <style>{`@page { size: A4 portrait; margin: 0; } @media print { .sheet { break-after: page; } .sheet:last-child { break-after: auto; } }`}</style>
      <div className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-paper p-3">
        <button onClick={() => window.print()} className="min-h-11 shrink-0 rounded-xl bg-accent px-5 font-medium text-white">
          พิมพ์ {sheets.length} แผ่น
        </button>
        <span className="text-sm text-muted">{tables.length} โต๊ะ · A4 แนวตั้ง · ไม่มีขอบ · ตัดตามเส้นแนวตั้ง พับตามเส้นแนวนอน</span>
      </div>
      <div className="flex flex-col items-center gap-6 bg-paper py-6 print:block print:gap-0 print:bg-white print:py-0">
        {sheets.map((pair) => (
          <div key={pair[0].id} className={`sheet relative grid h-[297mm] w-[210mm] grid-cols-2 overflow-hidden bg-white shadow print:shadow-none ${mali.className}`} style={{ color: "#7c5a32" }}>
            {[true, false].flatMap((flip) =>
              // an odd table count leaves the last sheet's right column empty, so the left one still folds
              [pair[0], pair[1]].map((t, col) => (t ? <Face key={`${col}-${flip}`} num={d.numbers.get(t.id)} label={d.signById.get(t.sign_id!)!.label} flip={flip} /> : <div key={`${col}-${flip}`} />)),
            )}
            <span className="absolute inset-y-0 left-1/2 border-l border-dashed border-black/30" />
            <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-black/30" />
          </div>
        ))}
      </div>
    </>
  );
}
