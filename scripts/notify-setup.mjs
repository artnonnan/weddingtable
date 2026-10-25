// Connect the Telegram digest (migration 007) to the groom's chat.
//   node --env-file=.env.local scripts/notify-setup.mjs [skip-actor ...]
// Needs TELEGRAM_BOT_TOKEN and DATABASE_URL in .env.local, and the groom must have pressed Start in the bot chat.
// Actors listed (default: อาท) are not reported — those are the groom's own edits.
import pg from "pg";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token || !process.env.DATABASE_URL) throw new Error("TELEGRAM_BOT_TOKEN / DATABASE_URL missing in .env.local");
const skip = process.argv.slice(2).length ? process.argv.slice(2) : ["อาท"];

const tg = async (method, body) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  return json.result;
};

const updates = await tg("getUpdates");
const chat = updates.map((u) => u.message?.chat).find((c) => c?.type === "private");
if (!chat) {
  console.log("ยังไม่มีใครทัก bot — เปิดแชตกับ bot ใน Telegram แล้วกด Start ก่อน");
  process.exit(1);
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query("update private.notify_config set bot_token = $1, chat_id = $2, skip_actors = $3, enabled = true where id = 1", [
  token,
  String(chat.id),
  skip,
]);
await db.end();

await tg("sendMessage", {
  chat_id: chat.id,
  text: `✅ เชื่อมต่อแล้ว\nจะสรุปการแก้ผังโต๊ะส่งมาทุก 5 นาที (ไม่รวมการแก้ของ: ${skip.join(", ")})\n\nhttps://weddingtable-flax.vercel.app`,
  disable_web_page_preview: true,
});
console.log(`connected chat ${chat.first_name ?? ""} (${chat.id}); skipping actors: ${skip.join(", ")}`);
