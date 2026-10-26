"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Sheet } from "./Sheet";
import { Button, Field, inputClass } from "./ui";

/** Who can edit; the name is what the change history and Telegram show ("อาท" is skipped by Telegram). */
const EDITOR_NAMES = ["อาท", "โดม", "ทีมต้อนรับ"] as const;

/** Enter the edit PIN (checked by the database) plus a name shown in the change history. */
export function PinSheet({ onClose }: { onClose: () => void }) {
  const { login } = useStore();
  const [pin, setPin] = useState("");
  const [name, setName] = useState(() => {
    try {
      const saved = localStorage.getItem("editorName") ?? "";
      return (EDITOR_NAMES as readonly string[]).includes(saved) ? saved : "";
    } catch {
      return "";
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const err = await login(pin.trim(), name.trim());
    setBusy(false);
    if (err) {
      setError(err);
      setPin("");
      return;
    }
    try {
      localStorage.setItem("editorName", name.trim());
    } catch {
      /* ignore */
    }
    onClose();
  };

  return (
    <Sheet
      onClose={onClose}
      title="เข้าโหมดแก้ไข"
      footer={
        <Button variant="primary" className="w-full" disabled={busy || !pin.trim() || !name.trim()} onClick={() => void submit()}>
          {busy ? "กำลังตรวจ…" : "เข้าโหมดแก้ไข"}
        </Button>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="คุณคือ (ขึ้นในประวัติการแก้ไข)">
          <select className={inputClass} value={name} onChange={(e) => setName(e.target.value)}>
            <option value="" disabled>
              — เลือก —
            </option>
            {EDITOR_NAMES.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Field>
        <Field label="PIN">
          <input
            className={`${inputClass} text-center text-2xl tracking-[0.5em]`}
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={12}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
        {error && <p className="rounded-xl bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
        <p className="text-xs text-muted">เครื่องนี้จะจำไว้ ไม่ต้องกรอกใหม่ จนกว่าจะกด “ออกจากโหมดแก้ไข” หรือมีการเปลี่ยน PIN</p>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  );
}
