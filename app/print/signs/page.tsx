"use client";

import { useStore } from "@/lib/store";

/** One A4 landscape tent card per table: fold along the middle, the top half is upside down. */
export default function PrintSigns() {
  const { state, d, error } = useStore();
  if (error) return <p className="p-6 text-danger">{error}</p>;
  if (!state || !d) return <p className="p-6 text-muted">กำลังโหลด…</p>;

  const tables = state.tables.filter((t) => t.sign_id).sort((a, b) => d.numbers.get(a.id)! - d.numbers.get(b.id)!);

  return (
    <>
      <style>{`@page { size: A4 landscape; margin: 0; } @media print { .card { break-after: page; } }`}</style>
      <div className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-paper p-3">
        <button onClick={() => window.print()} className="min-h-11 rounded-xl bg-accent px-5 font-medium text-white">
          พิมพ์ {tables.length} แผ่น
        </button>
        <span className="text-sm text-muted">A4 แนวนอน · ไม่มีขอบ · พับครึ่งตามเส้นประ</span>
      </div>
      <div className="flex flex-col items-center gap-6 bg-paper py-6 print:block print:gap-0 print:bg-white print:py-0">
        {tables.map((t) => {
          const sign = d.signById.get(t.sign_id!)!;
          const num = d.numbers.get(t.id);
          const half = (flip: boolean) => (
            <div className={`relative flex h-1/2 items-center justify-center ${flip ? "rotate-180" : ""}`}>
              <span className="absolute inset-x-[12mm] top-[10mm] h-[3mm] rounded-full" style={{ background: sign.color }} />
              <span className="px-[15mm] text-center font-bold leading-tight" style={{ fontSize: sign.label.length > 10 ? "50pt" : "64pt", color: sign.color }}>
                {sign.label}
              </span>
              <span className="absolute bottom-[8mm] right-[12mm] text-[11pt] text-muted">โต๊ะ {num}</span>
            </div>
          );
          return (
            <div key={t.id} className="card h-[210mm] w-[297mm] bg-white shadow print:shadow-none">
              {half(true)}
              <div className="border-t border-dashed border-muted/60" />
              {half(false)}
            </div>
          );
        })}
      </div>
    </>
  );
}
