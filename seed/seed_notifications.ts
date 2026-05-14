import { upsertNotification } from "../backend/src/repos/notifications.repo.js";
import { notifications } from "./fixtures.js";

export async function seed(): Promise<void> {
  for (const n of notifications) await upsertNotification(n);
  console.log(`[seed] notifications: ${notifications.length}`);
}
