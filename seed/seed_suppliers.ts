import { upsertSupplier } from "../backend/src/repos/suppliers.repo.js";
import { suppliers } from "./fixtures.js";

export async function seed(): Promise<void> {
  for (const s of suppliers) await upsertSupplier(s);
  console.log(`[seed] suppliers: ${suppliers.length}`);
}
