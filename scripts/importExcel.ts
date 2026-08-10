/**
 * Full inventory migration from `מלאי שוטף.xlsx`:
 * reset DB (no mock seed) → suppliers → store structure → books → locations → shortages → inventory orders.
 *
 * Usage:
 *   npx tsx scripts/importExcel.ts --file "C:\Users\ELYAS\Downloads\מלאי שוטף.xlsx"
 *   npx tsx scripts/importExcel.ts --file path.xlsx --skip-reset   # migrate-only path already empty
 */
import "../backend/src/config/loadEnv.js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { normalizePostgresConnectionString, postgresSslForUrl } from "@avihay-books/shared";
import type { StorePosition, SideLabel } from "@avihay-books/shared";
import { Pool } from "pg";
import { upsertSupplier } from "../backend/src/repos/suppliers.repo.js";
import { upsertBook } from "../backend/src/repos/books.repo.js";
import { upsertShelvingUnit } from "../backend/src/repos/shelvingUnits.repo.js";
import { upsertUnitSide } from "../backend/src/repos/unitSides.repo.js";
import { upsertShelf } from "../backend/src/repos/shelves.repo.js";
import { upsertCell } from "../backend/src/repos/cells.repo.js";
import { upsertBookLocation } from "../backend/src/repos/bookLocations.repo.js";
import { upsertShortage } from "../backend/src/repos/shortageList.repo.js";
import { upsertOrder } from "../backend/src/repos/orders.repo.js";
import { pool } from "../backend/src/db/pool.js";
import { HttpError } from "../backend/src/middleware/errorHandler.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FALLBACK_SUPPLIER_EMAIL = "noam.hasefer@gmail.com";
const ORDER_QTY_WHEN_EMPTY = 3;
const DEFAULT_CAPACITY = 24;

function deterministicUuid(label: string, seq: number | string): string {
  const h = createHash("sha256").update(`${label}:${seq}`).digest();
  const b = Uint8Array.from(h.subarray(0, 16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function colorFromName(name: string, used: Set<string>): string {
  let n = 0;
  for (;;) {
    const h = createHash("sha256").update(`${name}:${n}`).digest();
    const hex = `#${h.subarray(0, 3).toString("hex")}`;
    if (!used.has(hex.toLowerCase())) {
      used.add(hex.toLowerCase());
      return hex;
    }
    n += 1;
  }
}

function cellStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function parseQty(v: unknown, row: number, field: string, warnings: string[]): number {
  if (v === null || v === undefined || v === "") return 0;
  if (v === "?" || String(v).trim() === "?") {
    warnings.push(`שורה ${row}: ${field}=? → מטופל כ־0`);
    return 0;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    warnings.push(`שורה ${row}: ${field}=${JSON.stringify(v)} לא תקין → 0`);
    return 0;
  }
  return Math.floor(n);
}

function parsePrice(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function truncateCellName(name: string, row: number, warnings: string[]): string {
  if (name.length <= 20) return name;
  const t = name.slice(0, 20);
  warnings.push(`שורה ${row}: שם תא ארוך מ־20 תווים («${name}») → «${t}»`);
  return t;
}

type WallKind =
  | { kind: "unit"; position: StorePosition; name: string; isDisplayUnit: boolean }
  | { kind: "island_side"; sideLabel: SideLabel; sideOrder: 1 | 2 };

const WALL_MAP: Record<string, WallKind> = {
  "ארון חזית": { kind: "unit", position: "front", name: "ארון חזית", isDisplayUnit: false },
  "קיר שמאל": { kind: "unit", position: "left", name: "ארון שמאל", isDisplayUnit: false },
  "קיר ימין": { kind: "unit", position: "right", name: "ארון ימין", isDisplayUnit: false },
  "ספרי כיס": { kind: "unit", position: "pocket", name: "ספרי כיס", isDisplayUnit: false },
  סטים: { kind: "unit", position: "stacks", name: "סטים", isDisplayUnit: true },
  "ארון תצוגה": { kind: "unit", position: "display", name: "ארון תצוגה", isDisplayUnit: true },
  "סטנד חוברות": { kind: "unit", position: "brochure", name: "סטנד חוברות", isDisplayUnit: false },
  "אי ימין": { kind: "island_side", sideLabel: "צד ימין", sideOrder: 1 },
  "אי שמאל": { kind: "island_side", sideLabel: "צד שמאל", sideOrder: 2 },
};

interface ExcelInvRow {
  row: number;
  title: string;
  author: string | null;
  price: number | null;
  topic: string;
  supplier: string | null;
  storeQty: number;
  warehouseQty: number;
  cellName: string | null;
  wall: string | null;
  shelf: number | null;
  cell: number | null;
  pos: number | null;
}

interface Report {
  warnings: string[];
  errors: string[];
  suppliersFromSheet: number;
  suppliersAutoCreated: string[];
  inventoryRows: number;
  booksCreated: number;
  locationsCreated: number;
  shortagesCreated: number;
  ordersCreated: number;
  qqqCount: number;
  walls: Record<string, number>;
}

function parseArgs(argv: string[]): { file: string; skipReset: boolean } {
  let file = "";
  let skipReset = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--file") file = argv[++i] ?? "";
    else if (a === "--skip-reset") skipReset = true;
    else if (!a.startsWith("-") && !file) file = a;
  }
  if (!file) {
    throw new Error('חסר --file "path/to/מלאי שוטף.xlsx"');
  }
  return { file: resolve(file), skipReset };
}

async function resetDatabase(): Promise<void> {
  const rawDatabaseUrl = process.env.DATABASE_URL;
  if (!rawDatabaseUrl) throw new Error("DATABASE_URL is not set.");
  const databaseUrl = normalizePostgresConnectionString(rawDatabaseUrl);
  const ssl = postgresSslForUrl(databaseUrl);
  const resetPool = new Pool({
    connectionString: databaseUrl,
    ...(ssl ? { ssl } : {}),
  });
  const client = await resetPool.connect();
  try {
    await client.query("BEGIN");
    const tables = (
      await client.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
      )
    ).rows.map((r) => r.tablename);
    if (tables.length > 0) {
      await client.query(`DROP TABLE IF EXISTS ${tables.map((t) => `"${t}"`).join(", ")} CASCADE`);
      console.log(`[reset] dropped ${tables.length} table(s)`);
    }
    const types = (
      await client.query<{ typname: string }>(
        `SELECT t.typname FROM pg_type t
         JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'public' AND t.typtype = 'e'`,
      )
    ).rows.map((r) => r.typname);
    for (const typ of types) {
      await client.query(`DROP TYPE IF EXISTS "${typ}" CASCADE`);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await resetPool.end();
  }
}

async function runMigrationsInline(): Promise<void> {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["tsx", join(ROOT, "database", "runMigrations.ts")], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (r.status !== 0) throw new Error("db:migrate failed");
}

function readWorkbook(path: string): {
  suppliers: { name: string; email: string | null }[];
  inventory: ExcelInvRow[];
  report: Report;
} {
  if (!existsSync(path)) throw new Error(`קובץ לא נמצא: ${path}`);
  const wb = XLSX.readFile(path, { cellDates: true });
  const report: Report = {
    warnings: [],
    errors: [],
    suppliersFromSheet: 0,
    suppliersAutoCreated: [],
    inventoryRows: 0,
    booksCreated: 0,
    locationsCreated: 0,
    shortagesCreated: 0,
    ordersCreated: 0,
    qqqCount: 0,
    walls: {},
  };

  const sapSheet = wb.Sheets["ספקים"] ?? wb.Sheets[wb.SheetNames[1]!];
  const malSheet = wb.Sheets["מלאי"] ?? wb.Sheets[wb.SheetNames[0]!];
  if (!sapSheet || !malSheet) throw new Error("חסרות לשוניות מלאי/ספקים");

  const suppliers: { name: string; email: string | null }[] = [];
  for (let r = 2; r <= 32; r++) {
    const name = cellStr(sapSheet[`A${r}`]?.v);
    if (!name) continue;
    const email = cellStr(sapSheet[`B${r}`]?.v);
    suppliers.push({ name, email });
  }
  report.suppliersFromSheet = suppliers.length;

  const inventory: ExcelInvRow[] = [];
  const range = XLSX.utils.decode_range(malSheet["!ref"] ?? "A1");
  for (let r = 2; r <= range.e.r + 1; r++) {
    const title = cellStr(malSheet[`A${r}`]?.v);
    const wall = cellStr(malSheet[`I${r}`]?.v);
    const cellNameRaw = malSheet[`H${r}`]?.v;
    const cellNameStr =
      cellNameRaw === null || cellNameRaw === undefined || cellNameRaw === ""
        ? null
        : String(cellNameRaw).trim();
    if (!title && !wall && !cellNameStr) continue;
    if (!title) {
      report.warnings.push(`שורה ${r}: בלי שם ספר — דילוג`);
      continue;
    }
    const shelfRaw = malSheet[`J${r}`]?.v;
    const cellRaw = malSheet[`K${r}`]?.v;
    const posRaw = malSheet[`L${r}`]?.v;
    const shelf =
      shelfRaw === null || shelfRaw === undefined || shelfRaw === ""
        ? null
        : Number(shelfRaw);
    const cell =
      cellRaw === null || cellRaw === undefined || cellRaw === "" ? null : Number(cellRaw);
    const pos =
      posRaw === null || posRaw === undefined || posRaw === "" ? null : Number(posRaw);

    const row: ExcelInvRow = {
      row: r,
      title,
      author: cellStr(malSheet[`B${r}`]?.v),
      price: parsePrice(malSheet[`C${r}`]?.v),
      topic: cellStr(malSheet[`D${r}`]?.v) ?? "",
      supplier: cellStr(malSheet[`E${r}`]?.v),
      storeQty: parseQty(malSheet[`F${r}`]?.v, r, "חנות", report.warnings),
      warehouseQty: parseQty(malSheet[`G${r}`]?.v, r, "מחסן", report.warnings),
      cellName: cellNameStr,
      wall,
      shelf: shelf !== null && Number.isFinite(shelf) ? Math.floor(shelf) : null,
      cell: cell !== null && Number.isFinite(cell) ? Math.floor(cell) : null,
      pos: pos !== null && Number.isFinite(pos) ? Math.floor(pos) : null,
    };
    if (row.title === "???") report.qqqCount += 1;
    if (row.wall) report.walls[row.wall] = (report.walls[row.wall] ?? 0) + 1;
    if (row.wall && !WALL_MAP[row.wall]) {
      report.errors.push(`שורה ${r}: קיר לא מוכר «${row.wall}»`);
    }
    inventory.push(row);
  }
  report.inventoryRows = inventory.length;
  return { suppliers, inventory, report };
}

async function main(): Promise<void> {
  const { file, skipReset } = parseArgs(process.argv.slice(2));
  console.log(`[import] file=${file}`);

  const { suppliers: sheetSuppliers, inventory, report } = readWorkbook(file);
  if (report.errors.length > 0) {
    console.error("[import] שגיאות קריטיות לפני ייבוא:");
    for (const e of report.errors) console.error(" -", e);
    throw new Error("תיקון האקסל נדרש לפני ייבוא");
  }

  if (!skipReset) {
    console.log("[import] reset DB…");
    await resetDatabase();
    console.log("[import] migrate…");
    await runMigrationsInline();
  }

  const usedColors = new Set<string>();
  const supplierIdByName = new Map<string, string>();

  // --- suppliers from sheet rows 2-32 ---
  let sIdx = 0;
  for (const s of sheetSuppliers) {
    sIdx += 1;
    const id = deterministicUuid("sup", sIdx);
    await upsertSupplier({
      id,
      name: s.name,
      color_hex: colorFromName(s.name, usedColors),
      email: s.email,
    });
    supplierIdByName.set(s.name, id);
  }

  // auto-create missing suppliers from inventory
  const invSuppliers = new Set(
    inventory.map((r) => r.supplier).filter((x): x is string => !!x),
  );
  for (const name of [...invSuppliers].sort((a, b) => a.localeCompare(b, "he"))) {
    if (supplierIdByName.has(name)) continue;
    sIdx += 1;
    const id = deterministicUuid("sup", sIdx);
    await upsertSupplier({
      id,
      name,
      color_hex: colorFromName(name, usedColors),
      email: FALLBACK_SUPPLIER_EMAIL,
    });
    supplierIdByName.set(name, id);
    report.suppliersAutoCreated.push(name);
  }
  if (!supplierIdByName.has("כללי")) {
    sIdx += 1;
    const id = deterministicUuid("sup", sIdx);
    await upsertSupplier({
      id,
      name: "כללי",
      color_hex: colorFromName("כללי", usedColors),
      email: FALLBACK_SUPPLIER_EMAIL,
    });
    supplierIdByName.set("כללי", id);
    report.suppliersAutoCreated.push("כללי");
  }

  // --- base units ---
  const unitIds: Record<string, string> = {};
  const unitDefs: Array<{
    key: string;
    name: string;
    position: StorePosition;
    has_sides: boolean;
    is_display_unit: boolean;
    display_order: number;
  }> = [
    { key: "front", name: "ארון חזית", position: "front", has_sides: false, is_display_unit: false, display_order: 1 },
    { key: "left", name: "ארון שמאל", position: "left", has_sides: false, is_display_unit: false, display_order: 2 },
    { key: "right", name: "ארון ימין", position: "right", has_sides: false, is_display_unit: false, display_order: 3 },
    { key: "stacks", name: "סטים", position: "stacks", has_sides: false, is_display_unit: true, display_order: 4 },
    { key: "island", name: "האי", position: "island", has_sides: true, is_display_unit: false, display_order: 5 },
    { key: "display", name: "ארון תצוגה", position: "display", has_sides: false, is_display_unit: true, display_order: 6 },
    { key: "pocket", name: "ספרי כיס", position: "pocket", has_sides: false, is_display_unit: false, display_order: 7 },
    { key: "brochure", name: "סטנד חוברות", position: "brochure", has_sides: false, is_display_unit: false, display_order: 8 },
  ];
  for (const u of unitDefs) {
    const id = deterministicUuid("unit", u.key);
    unitIds[u.key] = id;
    await upsertShelvingUnit({
      id,
      name: u.name,
      store_position: u.position,
      has_sides: u.has_sides,
      is_display_unit: u.is_display_unit,
      display_order: u.display_order,
    });
  }

  const sideRightId = deterministicUuid("side", "right");
  const sideLeftId = deterministicUuid("side", "left");
  await upsertUnitSide({
    id: sideRightId,
    unit_id: unitIds.island!,
    side_label: "צד ימין",
    side_order: 1,
  });
  await upsertUnitSide({
    id: sideLeftId,
    unit_id: unitIds.island!,
    side_label: "צד שמאל",
    side_order: 2,
  });

  // cellName → canonical meta from complete rows
  const cellMetaByName = new Map<
    string,
    { wall: string; shelf: number; cell: number }
  >();
  for (const r of inventory) {
    if (!r.cellName || !r.wall || r.shelf == null || r.cell == null) continue;
    const cn = truncateCellName(r.cellName, r.row, report.warnings);
    if (!cellMetaByName.has(cn)) {
      cellMetaByName.set(cn, { wall: r.wall, shelf: r.shelf, cell: r.cell });
    }
  }

  // shelf key → shelf id; cell key → cell id
  const shelfIds = new Map<string, string>();
  const cellIds = new Map<string, string>();
  const nextPosInCell = new Map<string, number>();
  /** משטחים שטוחים (תצוגה/סטים): שם תא → cell_number ייחודי במדף */
  const flatCellNumByName = new Map<string, number>();
  const flatNextCellNum = new Map<string, number>();
  let shelfCtr = 0;
  let cellCtr = 0;

  async function ensureShelf(
    containerKind: "unit" | "side",
    containerId: string,
    shelfNumber: number,
    label: string | null,
  ): Promise<string> {
    const key = `${containerKind}:${containerId}:${shelfNumber}`;
    const existing = shelfIds.get(key);
    if (existing) return existing;
    shelfCtr += 1;
    const id = deterministicUuid("shelf", shelfCtr);
    await upsertShelf({
      id,
      unit_id: containerKind === "unit" ? containerId : null,
      side_id: containerKind === "side" ? containerId : null,
      shelf_number: shelfNumber,
      label,
    });
    shelfIds.set(key, id);
    return id;
  }

  async function ensureCell(
    shelfId: string,
    cellNumber: number,
    cellName: string,
    capacity: number,
  ): Promise<string> {
    const byName = cellIds.get(`name:${cellName}`);
    if (byName) return byName;
    const slotKey = `${shelfId}:${cellNumber}`;
    const bySlot = cellIds.get(`slot:${slotKey}`);
    if (bySlot) {
      report.warnings.push(
        `תא קיים במדף (shelf_id+cell_number=${cellNumber}) — משתמשים בו במקום שם «${cellName}»`,
      );
      cellIds.set(`name:${cellName}`, bySlot);
      return bySlot;
    }
    cellCtr += 1;
    const id = deterministicUuid("cell", cellCtr);
    try {
      await upsertCell({
        id,
        shelf_id: shelfId,
        cell_number: cellNumber,
        cell_name: cellName,
        capacity,
      });
    } catch (err) {
      const code = typeof err === "object" && err && "code" in err ? (err as { code?: string }).code : "";
      if (code === "23505") {
        const { rows } = await pool.query<{ id: string }>(
          `SELECT id FROM cells WHERE cell_name = $1
           UNION ALL
           SELECT id FROM cells WHERE shelf_id = $2 AND cell_number = $3
           LIMIT 1`,
          [cellName, shelfId, cellNumber],
        );
        const existingId = rows[0]?.id;
        if (existingId) {
          cellIds.set(`slot:${slotKey}`, existingId);
          cellIds.set(`name:${cellName}`, existingId);
          return existingId;
        }
      }
      throw err;
    }
    cellIds.set(`slot:${slotKey}`, id);
    cellIds.set(`name:${cellName}`, id);
    return id;
  }

  // Pre-create brochure: 5 shelves, 1 cell each
  for (let n = 1; n <= 5; n++) {
    const shId = await ensureShelf("unit", unitIds.brochure!, n, `מדף ${n}`);
    await ensureCell(shId, 1, truncateCellName(`חוברת ${n}`, 0, report.warnings), DEFAULT_CAPACITY);
  }

  async function resolveCellId(r: ExcelInvRow): Promise<string | null> {
    if (!r.wall) {
      report.warnings.push(`שורה ${r.row}: בלי קיר — דילוג על מיקום`);
      return null;
    }
    const wall = WALL_MAP[r.wall];
    if (!wall) return null;

    let shelfNum = r.shelf;
    let cellNum = r.cell;
    let cellName = r.cellName ? truncateCellName(r.cellName, r.row, report.warnings) : null;

    if ((shelfNum == null || cellNum == null) && cellName && cellMetaByName.has(cellName)) {
      const meta = cellMetaByName.get(cellName)!;
      shelfNum = shelfNum ?? meta.shelf;
      cellNum = cellNum ?? meta.cell;
    }

    if (shelfNum == null) shelfNum = 1;

    // סטנד חוברות: באקסל «סטנד» — ממפים ל־«חוברת N» שנוצר מראש
    if (r.wall === "סטנד חוברות" && (cellName === "סטנד" || !cellName)) {
      cellName = truncateCellName(`חוברת ${shelfNum}`, r.row, report.warnings);
    }

    if (!cellName) {
      if (r.wall === "סטים") cellName = "סטים";
      else if (r.wall === "ארון תצוגה") cellName = `תצוגה ${cellNum ?? 1}`;
      else if (r.wall === "ספרי כיס") cellName = `מדף ${shelfNum}`;
      else cellName = String(cellNum ?? 1);
      cellName = truncateCellName(cellName, r.row, report.warnings);
    }

    const isFlatSurface =
      wall.kind === "unit" && (wall.position === "display" || wall.position === "stacks");

    if (cellNum == null) {
      if (isFlatSurface) {
        // שמות תא שונים על אותו מדף (למשל תצוגה / תצוגה חלון) → cell_number נפרד
        const allocKey = `${wall.position}:${shelfNum}`;
        const nameKey = `${allocKey}:${cellName}`;
        const existingNum = flatCellNumByName.get(nameKey);
        if (existingNum != null) {
          cellNum = existingNum;
        } else {
          const next = flatNextCellNum.get(allocKey) ?? 1;
          cellNum = next;
          flatNextCellNum.set(allocKey, next + 1);
          flatCellNumByName.set(nameKey, cellNum);
        }
      } else {
        cellNum = 1;
      }
    }

    if (wall.kind === "island_side") {
      const sideId = wall.sideOrder === 1 ? sideRightId : sideLeftId;
      const shId = await ensureShelf("side", sideId, shelfNum, `מדף ${shelfNum}`);
      return ensureCell(shId, cellNum, cellName, DEFAULT_CAPACITY);
    }

    const unitKey = wall.position;
    const unitId = unitIds[unitKey]!;
    const label =
      wall.position === "stacks"
        ? "משטח סטים"
        : wall.position === "display"
          ? "משטח תצוגה"
          : `מדף ${shelfNum}`;
    const shId = await ensureShelf("unit", unitId, shelfNum, label);
    const cap =
      wall.position === "stacks" || wall.position === "display" ? 200 : DEFAULT_CAPACITY;
    return ensureCell(shId, cellNum, cellName, cap);
  }

  // --- group books ---
  type BookGroup = {
    key: string;
    title: string;
    author: string | null;
    supplier: string;
    price: number | null;
    topic: string;
    rows: ExcelInvRow[];
    isDisplay: boolean;
  };

  const groups = new Map<string, BookGroup>();
  let qqqSeq = 0;
  for (const r of inventory) {
    let supplier = r.supplier;
    if (!supplier) {
      report.warnings.push(`שורה ${r.row}: בלי ספק → כללי`);
      supplier = "כללי";
    }
    const key =
      r.title === "???"
        ? `qqq:${++qqqSeq}:${r.row}`
        : `${r.title}\0${r.author ?? ""}\0${supplier}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        title: r.title,
        author: r.author,
        supplier,
        price: r.price,
        topic: r.topic,
        rows: [],
        isDisplay: false,
      };
      groups.set(key, g);
    }
    g.rows.push(r);
    if (r.price != null && g.price == null) g.price = r.price;
    if (r.author && !g.author) g.author = r.author;
    if (r.topic && !g.topic) g.topic = r.topic;
    if (r.wall === "ארון תצוגה") g.isDisplay = true;
  }

  let bookIdx = 0;
  const bookIdByKey = new Map<string, string>();

  for (const g of groups.values()) {
    bookIdx += 1;
    const bookId = deterministicUuid("book", bookIdx);
    bookIdByKey.set(g.key, bookId);

    const stores = g.rows.map((x) => x.storeQty);
    const warehouses = g.rows.map((x) => x.warehouseQty);
    const sumStore = stores.reduce((a, b) => a + b, 0);
    const allWhEqual = warehouses.every((w) => w === warehouses[0]);
    let warehouseTotal: number;
    if (g.rows.length > 1 && allWhEqual && (warehouses[0] ?? 0) > 0) {
      warehouseTotal = warehouses[0]!;
      report.warnings.push(
        `ספר «${g.title}»: מחסן זהה בכל ${g.rows.length} השורות (${warehouseTotal}) → sum(store)+max(warehouse)`,
      );
    } else {
      warehouseTotal = warehouses.reduce((a, b) => a + b, 0);
    }
    const stock = sumStore + warehouseTotal;
    /** `is_new` רק אם כל המיקומים בתצוגה (סימון לוגי; אין הגבלת מיקום בשרת). */
    const isNew =
      g.rows.length > 0 && g.rows.every((r) => r.wall === "ארון תצוגה");

    await upsertBook({
      id: bookId,
      title: g.title.slice(0, 255),
      author: g.author,
      supplier_id: supplierIdByName.get(g.supplier)!,
      price: g.price,
      stock_quantity: stock,
      reorder_threshold: 0,
      is_new: isNew,
      topic: g.topic.slice(0, 100),
      is_active: true,
      copy_placement_notes: [],
    });
    report.booksCreated += 1;

    // placements
    for (const r of g.rows) {
      const cellId = await resolveCellId(r);
      if (!cellId) continue;

      let pos = r.pos;
      const used = nextPosInCell.get(cellId) ?? 1;
      if (pos == null || pos < 1) pos = used;
      // if slot may collide, bump
      while (true) {
        try {
          const loc = await upsertBookLocation({
            id: deterministicUuid("loc", `${bookId}:${cellId}:${pos}`),
            book_id: bookId,
            cell_id: cellId,
            position_in_cell: pos,
            quantity_in_cell: r.storeQty,
          });
          report.locationsCreated += 1;
          nextPosInCell.set(cellId, Math.max(used, pos) + 1);

          // חנות=0 עם שיבוץ במדף — חוסר ויזואלי גם כשאין מלאי במחסן.
          if (r.storeQty === 0) {
            await upsertShortage({
              id: deterministicUuid("shortage", loc.id),
              book_id: bookId,
              location_id: loc.id,
              status: "shortage",
            });
            report.shortagesCreated += 1;
          }
          break;
        } catch (err) {
          if (err instanceof HttpError && err.message === "book_location_slot_occupied") {
            pos += 1;
            continue;
          }
          throw err;
        }
      }
    }

    if (sumStore === 0 && warehouseTotal === 0) {
      await upsertOrder({
        id: deterministicUuid("order", bookId),
        book_id: bookId,
        supplier_id: supplierIdByName.get(g.supplier)!,
        order_type: "inventory",
        quantity: ORDER_QTY_WHEN_EMPTY,
        status: "pending",
      });
      report.ordersCreated += 1;
    }
  }

  // verify counts
  const counts = await pool.query<{
    books: string;
    locs: string;
    shortages: string;
    orders: string;
  }>(`
    SELECT
      (SELECT COUNT(*)::text FROM books) AS books,
      (SELECT COUNT(*)::text FROM book_locations) AS locs,
      (SELECT COUNT(*)::text FROM shortage_list WHERE status = 'shortage') AS shortages,
      (SELECT COUNT(*)::text FROM orders WHERE order_type = 'inventory') AS orders
  `);
  const c = counts.rows[0]!;

  const outDir = join(ROOT, "docs");
  mkdirSync(outDir, { recursive: true });
  const reportPath = join(outDir, "EXCEL_IMPORT_REPORT.json");
  const payload = {
    source: basename(file),
    generatedAt: new Date().toISOString(),
    report,
    dbCounts: {
      books: Number(c.books),
      locations: Number(c.locs),
      shortages: Number(c.shortages),
      inventoryOrders: Number(c.orders),
    },
  };
  writeFileSync(reportPath, JSON.stringify(payload, null, 2), "utf8");

  console.log("[import] done");
  console.log(`  books=${c.books} locations=${c.locs} shortages=${c.shortages} inv_orders=${c.orders}`);
  console.log(`  auto-suppliers=${report.suppliersAutoCreated.length} warnings=${report.warnings.length}`);
  console.log(`  report → ${reportPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
