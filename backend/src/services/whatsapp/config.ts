/**
 * קונפיגורציית בוט הוואטסאפ: חיבור ל-`Graph API`, תבניות, ותוכן קבוע של הענפים.
 * כל ערך ניתן לעקיפה דרך `.env`; ברירות המחדל לקוחות ממפרט הזרימה של "נועם הספר".
 * תוכן הענפים (`store_info`) ניתן גם לעריכה מהאפליקציה — ראה `botConfig.repo.ts`.
 */
import type { BotStoreInfo } from "@avihay-books/shared";

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : undefined;
}

function envNum(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export interface WhatsappRuntimeConfig {
  enabled: boolean;
  appId: string | undefined;
  phoneNumberId: string | undefined;
  wabaId: string | undefined;
  accessToken: string | undefined;
  appSecret: string | undefined;
  esConfigId: string | undefined;
  verifyToken: string | undefined;
  graphVersion: string;
  handoverTimeoutMin: number;
  humanHoursStart: number;
  humanHoursEnd: number;
  templateLang: string;
  templateOrderReady: string;
  adminPhone: string;
}

function parseHoursRange(raw: string | undefined): { start: number; end: number } {
  const fallback = { start: 13, end: 18 };
  if (!raw) return fallback;
  const m = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(raw);
  if (!m) return fallback;
  const start = Number.parseInt(m[1]!, 10);
  const end = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return fallback;
  return { start, end };
}

export function getWhatsappConfig(): WhatsappRuntimeConfig {
  const hours = parseHoursRange(env("WHATSAPP_HUMAN_HOURS"));
  return {
    enabled: (env("WHATSAPP_ENABLED") ?? "false").toLowerCase() === "true",
    appId: env("WHATSAPP_APP_ID"),
    phoneNumberId: env("WHATSAPP_PHONE_NUMBER_ID"),
    wabaId: env("WHATSAPP_WABA_ID"),
    accessToken: env("WHATSAPP_ACCESS_TOKEN"),
    appSecret: env("WHATSAPP_APP_SECRET"),
    esConfigId: env("WHATSAPP_ES_CONFIG_ID"),
    verifyToken: env("WHATSAPP_VERIFY_TOKEN"),
    graphVersion: env("WHATSAPP_GRAPH_VERSION") ?? "v21.0",
    handoverTimeoutMin: envNum("WHATSAPP_HANDOVER_TIMEOUT_MIN", 180),
    humanHoursStart: hours.start,
    humanHoursEnd: hours.end,
    templateLang: env("WHATSAPP_TEMPLATE_LANG") ?? "he",
    templateOrderReady: env("WHATSAPP_TEMPLATE_ORDER_READY") ?? "order_ready_pickup",
    adminPhone: env("WHATSAPP_ADMIN_PHONE") ?? "972508846929",
  };
}

/** האם הבוט מוכן לשלוח/לקבל הודעות (פעיל + טוקנים בסיסיים קיימים). */
export function isWhatsappConfigured(cfg: WhatsappRuntimeConfig = getWhatsappConfig()): boolean {
  return Boolean(cfg.enabled && cfg.phoneNumberId && cfg.accessToken);
}

/** האם דף Embedded Signup (Coexistence) מוכן להצגה. */
export function isEmbeddedSignupConfigured(cfg: WhatsappRuntimeConfig = getWhatsappConfig()): boolean {
  return Boolean(cfg.appId && cfg.esConfigId && cfg.appSecret);
}

export interface BotContentConfig {
  storeName: string;
  storeAddress: string;
  hoursText: string;
  wazeUrl: string | null;
  bankDetails: string;
  paymentCreditUrl: string | null;
  paymentBitUrl: string | null;
  paymentPayboxUrl: string | null;
  catalogPdfUrl: string | null;
  updatesGroupUrl: string | null;
  deliveryHomeFee: number;
  deliveryPointFee: number;
}

/** ברירות מחדל לתוכן הענפים — מ-`.env` עם נפילה למפרט "נועם הספר". משמש כבסיס המיזוג ב-DB. */
export function botStoreInfoDefaults(): BotStoreInfo {
  const hours = parseHoursRange(env("WHATSAPP_HUMAN_HOURS"));
  return {
    store_name: env("BOT_STORE_NAME") ?? "נועם הספר",
    store_address:
      env("BOT_STORE_ADDRESS") ?? "בניין הישיבה הגבוהה - קומה ראשונה, רחוב הארז, עלי",
    hours_text:
      env("BOT_HOURS_TEXT") ??
      "ימים א'-ה': 07:00 - 22:00\nמענה אנושי בחנות בין השעות 13:30-15:00\nימי ו': 07:00 - 14:00",
    waze_url: env("BOT_WAZE_URL") ?? null,
    bank_details: env("BOT_BANK_DETAILS") ?? "נועם הספר\nבנק הפועלים\nסניף 286\nחשבון 78929",
    payment_credit_url:
      env("BOT_PAYMENT_CREDIT_URL") ?? "https://ultra.kesherhk.info/external/paymentPage/314594",
    payment_bit_url:
      env("BOT_PAYMENT_BIT_URL") ??
      "https://meshulam.co.il/quick_payment?b=7583d8adc7013c94a822b5f0d7a2d711",
    payment_paybox_url: env("BOT_PAYMENT_PAYBOX_URL") ?? null,
    catalog_pdf_url: env("BOT_CATALOG_PDF_URL") ?? null,
    updates_group_url:
      env("BOT_UPDATES_GROUP_URL") ?? "https://chat.whatsapp.com/FMAgvMLixUT1Lia4DnA3Fh",
    delivery_home_fee: envNum("BOT_DELIVERY_HOME_FEE", 39),
    delivery_point_fee: envNum("BOT_DELIVERY_POINT_FEE", 25),
    human_hours_start: hours.start,
    human_hours_end: hours.end,
  };
}

/** ממיר את ה-`store_info` השמור (snake_case) לצורה שמנוע השיחה צורך (camelCase). */
export function storeInfoToContent(info: BotStoreInfo): BotContentConfig {
  return {
    storeName: info.store_name,
    storeAddress: info.store_address,
    hoursText: info.hours_text,
    wazeUrl: info.waze_url,
    bankDetails: info.bank_details,
    paymentCreditUrl: info.payment_credit_url,
    paymentBitUrl: info.payment_bit_url,
    paymentPayboxUrl: info.payment_paybox_url,
    catalogPdfUrl: info.catalog_pdf_url,
    updatesGroupUrl: info.updates_group_url,
    deliveryHomeFee: info.delivery_home_fee,
    deliveryPointFee: info.delivery_point_fee,
  };
}

/** תוכן הענפים מברירות המחדל של `.env` בלבד (ללא DB) — נפילה לבדיקות וכשאין cache. */
export function getBotContent(): BotContentConfig {
  return storeInfoToContent(botStoreInfoDefaults());
}
