/**
 * מחרוזות עברית ובוני-הודעות לבוט הוואטסאפ של "נועם הספר".
 * מזהי הכפתורים/שורות (`*_ID`) הם הערכים שחוזרים ב-`interactive reply` מ-Meta
 * ומשמשים את מנוע השיחה לניתוב.
 */
import type { BotContentConfig } from "./config.js";
import { BOT_TEXT_DEFAULTS, type BotTextKey, type BotTextOverrides } from "@avihay-books/shared";

/**
 * עקיפות הטקסט הפעילות בהודעה הנוכחית. נקבעות בתחילת `handleIncomingMessage`
 * מתוך הקונפיג השמור, כך שכל גישה ל-`T` מחזירה את הטקסט שהעובד הגדיר (אם הוגדר).
 */
let activeOverrides: BotTextOverrides = {};

export function setActiveTextOverrides(overrides: BotTextOverrides | undefined): void {
  activeOverrides = overrides ?? {};
}

function ov(key: BotTextKey): string {
  const v = activeOverrides[key];
  const fallback = BOT_TEXT_DEFAULTS[key];
  return typeof v === "string" && v.trim().length > 0 ? v : fallback;
}

/** מזהי שורות התפריט הראשי (List Message — עד 10 שורות). */
export const MENU_IDS = {
  stock: "menu:stock",
  order: "menu:order",
  orderStatus: "menu:order_status",
  hours: "menu:hours",
  payment: "menu:payment",
  catalog: "menu:catalog",
  quote: "menu:quote",
  updates: "menu:updates",
  support: "menu:support",
} as const;

export const MAIN_MENU_ROWS: { id: string; title: string; description?: string }[] = [
  { id: MENU_IDS.stock, title: "🔍 בירור מלאי ומחיר", description: "מחיר, מלאי ומיקום ספר בחנות" },
  { id: MENU_IDS.order, title: "🛒 הזמנה חדשה", description: "איסוף עצמי או משלוח" },
  { id: MENU_IDS.orderStatus, title: "📦 בירור סטטוס הזמנה", description: "מעקב אחר הזמנה קיימת" },
  { id: MENU_IDS.hours, title: "🕒 שעות וניווט", description: "שעות פעילות וכתובת" },
  { id: MENU_IDS.payment, title: "💳 אפשרויות תשלום", description: "מזומן, העברה ותשלום דיגיטלי" },
  { id: MENU_IDS.catalog, title: "📄 קטלוג ספרים", description: "קבלת קטלוג מלא (PDF)" },
  { id: MENU_IDS.quote, title: "🏢 הצעת מחיר", description: "מוסדות, ארגונים וכמויות גדולות" },
  { id: MENU_IDS.updates, title: "📢 קבוצת עדכונים", description: "ספרים חדשים ומבצעים" },
  { id: MENU_IDS.support, title: "🛠️ מענה אנושי / תקלה", description: "דיווח על בעיה או שאלה" },
];

/** מזהי כפתורי תגובה (Reply Buttons — עד 3 בהודעה). */
export const BTN = {
  orderPickup: "order:pickup",
  orderDelivery: "order:delivery",
  deliveryHome: "delivery:home",
  deliveryPoint: "delivery:point",
  moreYes: "more:yes",
  moreNo: "more:no",
  notesYes: "notes:yes",
  notesNo: "notes:no",
  loopYes: "loop:yes",
  loopNo: "loop:no",
  searchAgain: "b1:retry",
  toOrder: "b1:order",
  finish: "b1:end",
  pickNone: "pick:none",
  supportNotFound: "support:not_found",
  supportPos: "support:pos",
  supportOther: "support:other",
  toPayment: "support:payment",
  toHuman: "support:human",
  b1ImageRetry: "b1:image_retry",
  statusToHuman: "status:human",
  handoverEnd: "handover:end",
  navBack: "nav:back",
  navMainMenu: "nav:main_menu",
  orderConfirm: "order:confirm",
  orderEdit: "order:edit",
  orderCancel: "order:cancel",
} as const;

/** קידומת לשורות עריכה ממסך הסיכום (List Message). */
export const ORDER_EDIT = {
  type: "order:edit:type",
  name: "order:edit:name",
  phone: "order:edit:phone",
  address: "order:edit:address",
  delivery: "order:edit:delivery",
  books: "order:edit:books",
  notes: "order:edit:notes",
  booksDone: "order:edit:books:done",
  bookAdd: "order:edit:book:add",
} as const;

export const ORDER_EDIT_BOOK_PREFIX = "order:edit:book:";
export const ORDER_EDIT_BOOK_REMOVE_PREFIX = "order:edit:book:remove:";

export const STATUS_PICK_PREFIX = "status:order:";

export const PICK_PREFIX = "pick:";

/**
 * טקסטי הבוט. כל ערך נקרא דרך `ov()` כך שטקסט שהעובד הגדיר באפליקציה גובר על
 * ברירת המחדל. הטקסטים עם פרמטרים (`welcome`, `supportOffHours`)
 * תומכים ב-placeholders: `{storeName}`, `{start}`, `{end}`.
 */
export const T = {
  welcome: (storeName: string): string =>
    ov("welcome").replaceAll("{storeName}", storeName),
  get menuButton(): string {
    return ov("menuButton");
  },
  get menuPrompt(): string {
    return ov("menuPrompt");
  },

  get b1AskTitle(): string {
    return ov("b1AskTitle");
  },
  get b1ManyMatches(): string {
    return ov("b1ManyMatches");
  },
  get b1NoMatch(): string {
    return ov("b1NoMatch");
  },

  get orderAskType(): string {
    return ov("orderAskType");
  },
  get askName(): string {
    return ov("askName");
  },
  get askPhone(): string {
    return ov("askPhone");
  },
  get askPhoneDelivery(): string {
    return ov("askPhoneDelivery");
  },
  get invalidPhone(): string {
    return ov("invalidPhone");
  },
  get askAddress(): string {
    return ov("askAddress");
  },
  get askDeliveryMethod(): string {
    return ov("askDeliveryMethod");
  },
  get askBookTitle(): string {
    return ov("askBookTitle");
  },
  get askQuantity(): string {
    return ov("askQuantity");
  },
  get askMore(): string {
    return ov("askMore");
  },
  get askNotesPickup(): string {
    return ov("askNotesPickup");
  },
  get askNotesDelivery(): string {
    return ov("askNotesDelivery");
  },
  get askNotesDetailPickup(): string {
    return ov("askNotesDetailPickup");
  },
  get askNotesDetailDelivery(): string {
    return ov("askNotesDetailDelivery");
  },
  get invalidQuantity(): string {
    return ov("invalidQuantity");
  },

  get orderSummaryIntro(): string {
    return ov("orderSummaryIntro");
  },
  get orderSummaryConfirmQuestion(): string {
    return ov("orderSummaryConfirmQuestion");
  },
  get orderSummaryNoBooks(): string {
    return ov("orderSummaryNoBooks");
  },
  get orderEditListTitle(): string {
    return ov("orderEditListTitle");
  },
  get orderEditBooksTitle(): string {
    return ov("orderEditBooksTitle");
  },
  get orderCancelled(): string {
    return ov("orderCancelled");
  },

  get orderDonePickup(): string {
    return ov("orderDonePickup");
  },
  get orderDoneDelivery(): string {
    return ov("orderDoneDelivery");
  },

  get quoteHandover(): string {
    return ov("quoteHandover");
  },

  get supportPrompt(): string {
    return ov("supportPrompt");
  },
  get supportAskBook(): string {
    return ov("supportAskBook");
  },
  get supportReportSaved(): string {
    return ov("supportReportSaved");
  },
  get supportPosText(): string {
    return ov("supportPosText");
  },
  get supportHumanInHours(): string {
    return ov("supportHumanInHours");
  },
  supportOffHours: (start: number, end: number): string =>
    ov("supportOffHours")
      .replaceAll("{start}", String(start))
      .replaceAll("{end}", String(end)),
  get supportQuestionSaved(): string {
    return ov("supportQuestionSaved");
  },
  get handoverEndHint(): string {
    return ov("handoverEndHint");
  },
  get handoverEndHintRepeat(): string {
    return ov("handoverEndHintRepeat");
  },
  get handoverEndButton(): string {
    return ov("handoverEndButton");
  },

  get endLoopPrompt(): string {
    return ov("endLoopPrompt");
  },
  closing: (_storeName: string): string => ov("closing"),

  get loopYesButton(): string {
    return "כן, אשמח😊";
  },
  get loopNoButton(): string {
    return "לא, תודה רבה 🙏";
  },

  get catalogCaption(): string {
    return ov("catalogCaption");
  },
  get catalogMissing(): string {
    return ov("catalogMissing");
  },

  get mediaUnsupported(): string {
    return ov("mediaUnsupported");
  },
  /** @deprecated השתמשו ב-`mediaUnsupported` — נשמר לתאימות עקיפות ישנות */
  get b1ImageFallback(): string {
    return ov("b1ImageFallback");
  },

  get b3NoOrders(): string {
    return ov("b3NoOrders");
  },
  get b3MultipleOrders(): string {
    return ov("b3MultipleOrders");
  },

  get navBackButton(): string {
    return ov("navBackButton");
  },
  get navHint(): string {
    return ov("navHint");
  },
  get navBackUnavailable(): string {
    return ov("navBackUnavailable");
  },
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "הוזמן",
  sent: "הגיע לחנות וממתין לכם",
  completed: "הושלם",
  archived: "הושלם",
};

/** הודעת שעות פעילות וניווט (ענף 3). קישור הוויז נשלח כ-cta_url נפרד אם הוגדר. */
export function hoursMessage(content: BotContentConfig): string {
  return (
    `📍 כתובת החנות:\n${content.storeAddress}\n\n` +
    `🕒 שעות פעילות:\n${content.hoursText}`
  );
}

/** הודעת אפשרויות תשלום (ענף 4). */
export function paymentMessage(content: BotContentConfig): string {
  const lines: string[] = [
    "*דרכי תשלום לחנות הספרים:*",
    "",
    "🪙 *מזומן*",
    "",
    `🪙 *צ'ק* - לפקודת '${content.storeName}'`,
  ];

  if (content.paymentCreditUrl) {
    lines.push("", "🪙 *אשראי* -", content.paymentCreditUrl);
    lines.push("(יש לוודא בסוף התהליך שקיבלתם אישור על קבלת התשלום!)");
  }

  if (content.paymentBitUrl) {
    lines.push("", `🪙 *ביט* - ${content.paymentBitUrl}`);
  }

  if (content.paymentPayboxUrl) {
    lines.push("", `🪙 *פייבוקס* - ${content.paymentPayboxUrl}`);
  }

  lines.push("", "🪙 *העברה בנקאית*");
  for (const line of content.bankDetails.split("\n")) {
    if (line.trim().length > 0) lines.push(line.trim());
  }
  lines.push("(נא לשלוח צילום מסך על אישור ההעברה)");

  return lines.join("\n");
}

/** הודעת קבוצת עדכונים (ענף 7). */
export function updatesMessage(content: BotContentConfig): string {
  const storeLabel = content.storeName.trim() || "נועם הספר";
  const intro =
    `שמחים שבחרתם להצטרף לקבוצת העדכונים של '${storeLabel}'! 🎉\n` +
    "כאן תהיו הראשונים להתעדכן בספרים חדשים שמגיעים למדפים, מבצעים בלעדיים לחברי הקבוצה, " +
    "וכל מה שחם בעולם הספרים. ✨";
  if (content.updatesGroupUrl) {
    return (
      `${intro}\n` +
      `מצורף קישור לקבוצה: ${content.updatesGroupUrl}\n\n` +
      "ברוכים הבואים! 📚"
    );
  }
  return `${intro}\n\nהקישור אינו זמין כרגע.\n\nברוכים הבואים! 📚`;
}
