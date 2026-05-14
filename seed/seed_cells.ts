import { upsertCell } from "../backend/src/repos/cells.repo.js";
import { cells } from "./fixtures.js";

export async function seed(): Promise<void> {
  for (const c of cells) await upsertCell(c);
  console.log(`[seed] cells: ${cells.length}`);
}
