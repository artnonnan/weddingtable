"use client";

import { useEffect, type ReactNode } from "react";

/** Bottom sheet. Tapping the backdrop or ✕ closes it. */
export function Sheet({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center no-print">
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />
      <div className="sheet-up relative flex max-h-[88dvh] w-full max-w-xl flex-col rounded-t-2xl bg-paper shadow-2xl">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1 text-base font-semibold">{title}</div>
          <button onClick={onClose} className="-mr-2 flex size-10 items-center justify-center rounded-full text-xl text-muted active:bg-line" aria-label="ปิด">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}
