/**
 * גישה לקונפיגורציית הבוט הניתנת לעריכה (`bot_config` — שורה יחידה, JSONB).
 * הערכים השמורים ממוזגים מעל ברירות המחדל של `.env`/הקוד, כך שהבוט תמיד מקבל
 * אובייקט שלם. נשמר cache בזיכרון (TTL קצר) כדי לא לפנות ל-DB בכל הודעה נכנסת.
 */
import type {
  BotConfigData,
  BotStoreInfo,
  BotTextOverrides,
  BuiltinMenuKey,
  CustomFlow,
  MenuItemConfig,
} from "@avihay-books/shared";
import { pool } from "../db/pool.js";
import {
  botStoreInfoDefaults,
  storeInfoToContent,
  type BotContentConfig,
} from "../services/whatsapp/config.js";
import { MAIN_MENU_ROWS, MENU_IDS } from "../services/whatsapp/text.js";

const CACHE_TTL_MS = 60_000;

/** מיפוי מזהה שורת תפריט מובנית למפתח הענף (`builtin_key`). */
const MENU_ID_TO_BUILTIN: Record<string, BuiltinMenuKey> = {
  [MENU_IDS.stock]: "stock",
  [MENU_IDS.order]: "order",
  [MENU_IDS.orderStatus]: "order_status",
  [MENU_IDS.hours]: "hours",
  [MENU_IDS.payment]: "payment",
  [MENU_IDS.catalog]: "catalog",
  [MENU_IDS.quote]: "quote",
  [MENU_IDS.updates]: "updates",
  [MENU_IDS.support]: "support",
};

function defaultMenuItems(): MenuItemConfig[] {
  return MAIN_MENU_ROWS.map((row, index) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    type: "builtin" as const,
    builtin_key: MENU_ID_TO_BUILTIN[row.id],
    enabled: true,
    order: index,
  }));
}

/** קונפיג ברירת מחדל מלא (תפריט מובנה + תוכן מ-`.env`). מיוצא לשימוש בבדיקות/איפוס. */
export function buildDefaultBotConfig(): BotConfigData {
  return {
    store_info: botStoreInfoDefaults(),
    menu_items: defaultMenuItems(),
    custom_flows: {},
    text_overrides: {},
  };
}

/** ממזג קונפיג שמור (חלקי) מעל ברירות המחדל המלאות. */
function mergeWithDefaults(stored: Partial<BotConfigData> | null | undefined): BotConfigData {
  const defaults = buildDefaultBotConfig();
  if (!stored) return defaults;
  return {
    store_info: { ...defaults.store_info, ...(stored.store_info ?? {}) } as BotStoreInfo,
    menu_items:
      Array.isArray(stored.menu_items) && stored.menu_items.length > 0
        ? stored.menu_items
        : defaults.menu_items,
    custom_flows: (stored.custom_flows ?? {}) as Record<string, CustomFlow>,
    text_overrides: (stored.text_overrides ?? {}) as BotTextOverrides,
  };
}

let cache: { data: BotConfigData; at: number } | null = null;

/** במצב בדיקות (mock) אין cache — כדי שמשתני סביבה שמשתנים תוך כדי ריצה ייקראו מיד. */
function cacheTtlMs(): number {
  return (process.env.WHATSAPP_TEST_MOCK ?? "").toLowerCase() === "true" ? 0 : CACHE_TTL_MS;
}

/** קונפיג מלא ועדכני — משתמש ב-cache; פונה ל-DB רק כשפג התוקף. */
export async function getBotConfig(): Promise<BotConfigData> {
  if (cache && Date.now() - cache.at < cacheTtlMs()) return cache.data;
  try {
    const { rows } = await pool.query<{ config: Partial<BotConfigData> }>(
      "SELECT config FROM bot_config WHERE id = 1",
    );
    const merged = mergeWithDefaults(rows[0]?.config);
    cache = { data: merged, at: Date.now() };
    return merged;
  } catch {
    // אם ה-DB לא זמין/הטבלה חסרה — נופלים לברירות מחדל כדי שהבוט ימשיך לעבוד.
    return buildDefaultBotConfig();
  }
}

/** גישה סינכרונית לקונפיג שנטען לאחרונה (לשימוש מנוע השיחה תוך כדי טיפול בהודעה). */
export function getCachedBotConfig(): BotConfigData {
  return cache?.data ?? buildDefaultBotConfig();
}

/** תוכן הענפים (camelCase) מתוך הקונפיג שנטען לאחרונה — למנוע השיחה. */
export function currentBotContent(): BotContentConfig {
  return storeInfoToContent(getCachedBotConfig().store_info);
}

/** שמירת קונפיג מלא ל-DB ועדכון ה-cache; מחזיר את הצורה הממוזגת. */
export async function saveBotConfig(input: BotConfigData): Promise<BotConfigData> {
  const merged = mergeWithDefaults(input);
  await pool.query(
    `INSERT INTO bot_config (id, config, updated_at)
     VALUES (1, $1::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = now()`,
    [JSON.stringify(merged)],
  );
  cache = { data: merged, at: Date.now() };
  return merged;
}

/** איפוס הקונפיג לברירת מחדל (שורה ריקה) וניקוי ה-cache — לשימוש בבדיקות. */
export async function resetBotConfigForTests(): Promise<void> {
  await pool.query(
    `INSERT INTO bot_config (id, config, updated_at)
     VALUES (1, '{}'::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET config = '{}'::jsonb, updated_at = now()`,
  );
  cache = null;
}
