/**
 * שולח התראת Push בדיקה לכל הטוקנים הרשומים ב-push_tokens.
 * שימוש: npx tsx scripts/send-test-push.ts
 */
import "../src/config/loadEnv.js";
import { listPushTokens } from "../src/repos/pushTokens.repo.js";
import { sendChatPush } from "../src/services/push.js";
import { pool } from "../src/db/pool.js";

async function main(): Promise<void> {
  const tokens = await listPushTokens();
  console.log(`Registered tokens: ${tokens.length}`);
  for (const t of tokens) {
    console.log(`  - ${t.slice(0, 35)}…`);
  }
  if (tokens.length === 0) {
    console.error("No push tokens — open the app on your phone first.");
    process.exit(1);
  }

  await sendChatPush({
    title: "בדיקת התראה",
    body: "אם קיבלת את זה — Push עובד ✅",
    phone: "972500000000",
  });

  console.log("Done — check your phone for the notification.");
  await pool.end();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
