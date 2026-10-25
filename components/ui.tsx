"use client";

import type { ReactNode } from "react";
import { STATUS_LABEL, type GuestStatus, type Sign } from "@/lib/types";

export const STATUS_COLOR: Record<GuestStatus, string> = {
  confirmed: "var(--color-ok)",
  unsure: "var(--color-unsure)",
  seated: "var(--color-seated)",
};

export function StatusDot({ status }: { status: GuestStatus }) {
  return <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[status] }} />;
}

export function StatusChip({ status }: { status: GuestStatus }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color: STATUS_COLOR[status], background: `color-mix(in srgb, ${STATUS_COLOR[status]} 12%, white)` }}
    >
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function SignChip({ sign, small }: { sign: Sign | undefined; small?: boolean }) {
  if (!sign) return <span className={`rounded-full border border-dashed border-line px-2 text-muted ${small ? "text-[11px]" : "text-xs"}`}>ไม่มีป้าย</span>;
  return (
    <span
      className={`inline-block max-w-full truncate rounded-full px-2 font-medium text-white ${small ? "text-[11px] leading-5" : "py-0.5 text-xs"}`}
      style={{ background: sign.color }}
    >
      {sign.label}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "default",
  disabled,
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "ghost";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const styles = {
    default: "bg-card border border-line text-ink active:bg-paper",
    primary: "bg-accent text-white active:opacity-80",
    danger: "bg-card border border-danger/40 text-danger active:bg-danger/5",
    ghost: "text-accent active:bg-accent-soft",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-medium disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full min-h-11 rounded-xl border border-line bg-card px-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

export function WarnBadge({ level }: { level: "none" | "mixed" | "wrong" }) {
  if (level === "wrong")
    return (
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-danger text-[12px] font-bold text-white" title="มีคนต่างกลุ่ม">
        !
      </span>
    );
  if (level === "mixed") return <span className="inline-block size-2.5 rounded-full bg-mixed" title="ปนหมู่บ้าน" />;
  return null;
}
