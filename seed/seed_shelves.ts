import { upsertShelf } from "../backend/src/repos/shelves.repo.js";
import { shelves } from "./fixtures.js";

export async function seed(): Promise<void> {
  for (const s of shelves) {
    const { _key, ...payload } = s;
    void _key;
    await upsertShelf(payload);
  }
  console.log(`[seed] shelves: ${shelves.length}`);
}
