import { upsertShelvingUnit } from "../backend/src/repos/shelvingUnits.repo.js";
import { shelvingUnits } from "./fixtures.js";

export async function seed(): Promise<void> {
  for (const u of shelvingUnits) await upsertShelvingUnit(u);
  console.log(`[seed] shelving_units: ${shelvingUnits.length}`);
}
