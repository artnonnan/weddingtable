// Set or change the edit PIN (from EDIT_PIN in .env.local). Every device that entered the old PIN is signed out.
//   node --env-file=.env.local scripts/set-pin.mjs
import pg from "pg";

const pin = process.env.EDIT_PIN?.trim();
if (!pin || !/^\d{4,12}$/.test(pin)) throw new Error("EDIT_PIN in .env.local must be 4-12 digits");

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const { rows } = await db.query(
  `update private.edit_pin
     set pin_hash = extensions.crypt($1, extensions.gen_salt('bf')), pin_version = pin_version + 1
   where id = 1 returning pin_version`,
  [pin],
);
await db.query("delete from private.edit_sessions where pin_version < $1", [rows[0].pin_version]);
await db.query("insert into public.change_log (actor, action, detail) values ('claude', 'เปลี่ยน PIN', 'ทุกเครื่องต้องกรอก PIN ใหม่')");
await db.end();
console.log(`PIN set (version ${rows[0].pin_version}); all previous edit sessions signed out`);
