"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Sheet } from "./Sheet";
import { Button, Field, inputClass } from "./ui";

/** Enter the edit PIN (checked by the database) plus a name shown in the change history. */
export function PinSheet({ onClose }: { onClose: () => void }) {
  const { login } = useStore();
  const [pin, setPin] = useState("");
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("editorName") ?? "";
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
        <Field label="ชื่อของคุณ (ขึ้นในประวัติการแก้ไข)">
          <input className={inputClass} placeholder="เช่น อาท, โดม, พี่หน้างาน" value={name} onChange={(e) => setName(e.target.value)} />
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
