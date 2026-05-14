import { upsertBook } from "../backend/src/repos/books.repo.js";
import { books } from "./fixtures.js";

export async function seed(): Promise<void> {
  for (const b of books) await upsertBook(b);
  console.log(`[seed] books: ${books.length}`);
}
