"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { HOSTS } from "@/lib/types";
import { Sheet } from "./Sheet";
import { Button, Field, inputClass } from "./ui";

/** For guests who are not in the sheet. */
export function AddPartyButton() {
  const { state, addParty, openSheet, busy } = useStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [host, setHost] = useState<string>(HOSTS[4]);
  const [village, setVillage] = useState("");
  const [signId, setSignId] = useState<number | null>(3);
  const [size, setSize] = useState(1);

  if (!state) return null;
  return (
    <>
      <Button className="mt-4 w-full" onClick={() => setOpen(true)}>
        + เพิ่มแขก (นอกรายชื่อ)
      </Button>
      {open && (
        <Sheet
          onClose={() => setOpen(false)}
          title="เพิ่มแขก"
          footer={
            <Button
              variant="primary"
              className="w-full"
              disabled={busy || (!name.trim() && !nickname.trim()) || size < 1}
              onClick={async () => {
                const id = await addParty({ name: name.trim(), nickname: nickname.trim(), host, village: village.trim(), sign_id: signId, note: "", size });
                if (id) {
                  setOpen(false);
                  setName("");
                  setNickname("");
                  setSize(1);
                  openSheet({ type: "party", id });
                }
              }}
            >
              เพิ่ม
            </Button>
          }
        >
          <div className="space-y-3">
            <Field label="ชื่อจริง">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="ชื่อเล่น">
              <input className={inputClass} value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="แขกของ">
                <select className={inputClass} value={host} onChange={(e) => setHost(e.target.value)}>
                  {HOSTS.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </Field>
              <Field label="หมู่บ้าน / กลุ่ม">
                <input className={inputClass} value={village} onChange={(e) => setVillage(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ป้าย">
                <select className={inputClass} value={signId ?? ""} onChange={(e) => setSignId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— ไม่มี —</option>
                  {state.signs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="จำนวนคน">
                <input className={inputClass} inputMode="numeric" value={size} onChange={(e) => setSize(Number.parseInt(e.target.value || "0", 10))} />
              </Field>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
