import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
let editToken: string | null = null;

/** Session token from the edit PIN; sent as "x-edit-token" so the database lets this device write. */
export function setEditToken(token: string | null) {
  editToken = token;
}

/** Lazily created so builds without env vars still prerender. */
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("ยังไม่ได้ตั้งค่า Supabase (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)");
    client = createClient(url, key, {
      auth: { persistSession: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (editToken) headers.set("x-edit-token", editToken);
          return fetch(input, { ...init, headers });
        },
      },
    });
  }
  return client;
}

export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
