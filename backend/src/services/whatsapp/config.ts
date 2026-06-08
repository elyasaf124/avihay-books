/**
 * קונפיגורציית בוט הוואטסאפ: חיבור ל-`Graph API`, תבניות, ותוכן קבוע של הענפים.
 * כל ערך ניתן לעקיפה דרך `.env`; ברירות המחדל לקוחות ממפרט הזרימה של "נועם הספר".
 */

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
  phoneNumberId: string | undefined;
  wabaId: string | undefined;
  accessToken: string | undefined;
  appSecret: string | undefined;
  verifyToken: string | undefined;
  graphVersion: string;
  handoverTimeoutMin: number;
  humanHoursStart: number;
  humanHoursEnd: number;
  templateLang: string;
  templateOrderReady: string;
}

function parseHoursRange(raw: string | undefined): { start: number; end: number } {
  const fallback = { start: 14, end: 18 };
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
    phoneNumberId: env("WHATSAPP_PHONE_NUMBER_ID"),
    wabaId: env("WHATSAPP_WABA_ID"),
    accessToken: env("WHATSAPP_ACCESS_TOKEN"),
    appSecret: env("WHATSAPP_APP_SECRET"),
    verifyToken: env("WHATSAPP_VERIFY_TOKEN"),
    graphVersion: env("WHATSAPP_GRAPH_VERSION") ?? "v21.0",
    handoverTimeoutMin: envNum("WHATSAPP_HANDOVER_TIMEOUT_MIN", 180),
    humanHoursStart: hours.start,
    humanHoursEnd: hours.end,
    templateLang: env("WHATSAPP_TEMPLATE_LANG") ?? "he",
    templateOrderReady: env("WHATSAPP_TEMPLATE_ORDER_READY") ?? "order_ready_pickup",
  };
}

/** האם הבוט מוכן לשלוח/לקבל הודעות (פעיל + טוקנים בסיסיים קיימים). */
export function isWhatsappConfigured(cfg: WhatsappRuntimeConfig = getWhatsappConfig()): boolean {
  return Boolean(cfg.enabled && cfg.phoneNumberId && cfg.accessToken);
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

/** תוכן קבוע של הענפים (כתובת, שעות, תשלום, קישורים) — מ-`.env` עם ברירות מחדל מהמפרט. */
export function getBotContent(): BotContentConfig {
  return {
    storeName: env("BOT_STORE_NAME") ?? "נועם הספר",
    storeAddress:
      env("BOT_STORE_ADDRESS") ?? "בניין הישיבה הגבוהה - קומה ראשונה, רחוב הארז, עלי",
    hoursText:
      env("BOT_HOURS_TEXT") ??
      "ימים א'-ה': 07:00 - 22:00 (מענה אנושי בחנות בין השעות 13:30-15:00)\nימי ו': 07:00 - 14:00",
    wazeUrl: env("BOT_WAZE_URL") ?? null,
    bankDetails:
      env("BOT_BANK_DETAILS") ??
      "נועם הספר\nבנק הפועלים\nסניף 286\nחשבון 78929",
    paymentCreditUrl:
      env("BOT_PAYMENT_CREDIT_URL") ??
      "https://ultra.kesherhk.info/external/paymentPage/314594",
    paymentBitUrl:
      env("BOT_PAYMENT_BIT_URL") ??
      "https://meshulam.co.il/quick_payment?b=7583d8adc7013c94a822b5f0d7a2d711",
    paymentPayboxUrl: env("BOT_PAYMENT_PAYBOX_URL") ?? null,
    catalogPdfUrl: env("BOT_CATALOG_PDF_URL") ?? null,
    updatesGroupUrl: env("BOT_UPDATES_GROUP_URL") ?? null,
    deliveryHomeFee: envNum("BOT_DELIVERY_HOME_FEE", 39),
    deliveryPointFee: envNum("BOT_DELIVERY_POINT_FEE", 25),
  };
}
