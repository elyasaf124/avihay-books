import { upsertOrder } from "../backend/src/repos/orders.repo.js";
import { upsertShortage } from "../backend/src/repos/shortageList.repo.js";
import { orders, shortages } from "./fixtures.js";

export async function seed(): Promise<void> {
  for (const o of orders) await upsertOrder(o);
  for (const s of shortages) await upsertShortage(s);
  console.log(`[seed] orders: ${orders.length}, shortages: ${shortages.length}`);
}
