import { upsertUnitSide } from "../backend/src/repos/unitSides.repo.js";
import { unitSides } from "./fixtures.js";

export async function seed(): Promise<void> {
  for (const s of unitSides) await upsertUnitSide(s);
  console.log(`[seed] unit_sides: ${unitSides.length}`);
}
