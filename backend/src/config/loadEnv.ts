import dotenv from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let didLoad = false;

/**
 * מאתר את שורש חבילת `@avihay-books/backend` גם כשרצים מ־`database/` או מ־`dist/`.
 */
function findBackendRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 20; i++) {
    const direct = join(dir, "package.json");
    if (existsSync(direct)) {
      try {
        const pkg = JSON.parse(readFileSync(direct, "utf8")) as { name?: string };
        if (pkg.name === "@avihay-books/backend") {
          return dir;
        }
      } catch {
        /* ignore */
      }
    }
    const nested = join(dir, "backend", "package.json");
    if (existsSync(nested)) {
      try {
        const pkg = JSON.parse(readFileSync(nested, "utf8")) as { name?: string };
        if (pkg.name === "@avihay-books/backend") {
          return join(dir, "backend");
        }
      } catch {
        /* ignore */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(
    "[loadEnv] Could not locate backend/ (expected @avihay-books/backend/package.json in parent path).",
  );
}

/** `NODE_ENV` קובע איזו קובצי `.env.*` נטענים (ברירת מחדל: `development`). */
export function loadBackendEnv(): void {
  if (didLoad) {
    return;
  }
  didLoad = true;

  const root = findBackendRoot();
  const mode =
    process.env.NODE_ENV === "production" ? "production" : "development";

  const chain = [".env", `.env.${mode}`, ".env.local", `.env.${mode}.local`];
  for (const name of chain) {
    const pathStr = join(root, name);
    if (existsSync(pathStr)) {
      dotenv.config({ path: pathStr, override: true });
    }
  }
}

loadBackendEnv();
