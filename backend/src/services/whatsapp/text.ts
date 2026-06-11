/**
 * מחרוזות עברית ובוני-הודעות לבוט הוואטסאפ של "נועם הספר".
 * מזהי הכפתורים/שורות (`*_ID`) הם הערכים שחוזרים ב-`interactive reply` מ-Meta
 * ומשמשים את מנוע השיחה לניתוב.
 */
import type { BotContentConfig } from "./config.js";
import type { BotTextKey, BotTextOverrides } from "@avihay-books/shared";

/**
 * עקיפות הטקסט הפעילות בהודעה הנוכחית. נקבעות בתחילת `handleIncomingMessage`
 * מתוך הקונפיג השמור, כך שכל גישה ל-`T` מחזירה את הטקסט שהעובד הגדיר (אם הוגדר).
 */
let activeOverrides: BotTextOverrides = {};

export function setActiveTextOverrides(overrides: BotTextOverrides | undefined): void {
  activeOverrides = overrides ?? {};
}

function ov(key: BotTextKey, fallback: string): string {
  const v = activeOverrides[key];
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
} as const;

export const STATUS_PICK_PREFIX = "status:order:";

export const PICK_PREFIX = "pick:";

/**
 * טקסטי הבוט. כל ערך נקרא דרך `ov()` כך שטקסט שהעובד הגדיר באפליקציה גובר על
 * ברירת המחדל. הטקסטים עם פרמטרים (`welcome`, `closing`, `supportOffHours`)
 * תומכים ב-placeholders: `{storeName}`, `{start}`, `{end}`.
 */
const DEFAULTS = {
  welcome:
    "שלום! ברוך הבא לחנות הספרים '{storeName}' 📚\n" +
    "אני נועם, העוזר הווירטואלי של החנות. איך אוכל לעזור לך?",
  closing:
    "שמחתי מאוד לעזור! אשמח לעזור לך גם בעתיד בכל דבר שתרצה! " +
    "נועם, הבוט של '{storeName}' 😉",
  supportOffHours:
    "המענה האנושי שלנו פעיל בין השעות {start}:00 ל-{end}:00. " +
    "באפשרותך לכתוב כאן את שאלתך בטקסט חופשי, ונציג יחזור אליך מיד עם תחילת שעות הפעילות!",
} as const;

export const T = {
  welcome: (storeName: string): string =>
    ov("welcome", DEFAULTS.welcome).replaceAll("{storeName}", storeName),
  get menuButton(): string {
    return ov("menuButton", "תפריט ראשי");
  },
  get menuPrompt(): string {
    return ov("menuPrompt", "בחר מהתפריט:");
  },

  get b1AskTitle(): string {
    return ov("b1AskTitle", "אנא הקלד את שם הספר שאתה מחפש:");
  },
  get b1ManyMatches(): string {
    return ov("b1ManyMatches", "מצאתי כמה אפשרויות, למה התכוונת?");
  },
  get b1NoMatch(): string {
    return ov(
      "b1NoMatch",
      "מצטער, לא מצאתי את הספר בקטלוג שלנו. כדאי לוודא ששם הספר מאויית נכון. " +
        "אם הוא מדויק, כנראה שהוא חסר כרגע. תרצה להזמין אותו?",
    );
  },

  get orderAskType(): string {
    return ov("orderAskType", "איזה סוג הזמנה תרצה לבצע?");
  },
  get askName(): string {
    return ov("askName", "נא להקליד שם מלא:");
  },
  get askPhone(): string {
    return ov("askPhone", "נא להקליד מספר טלפון ליצירת קשר:");
  },
  get askAddress(): string {
    return ov("askAddress", "נא להקליד כתובת מלאה למשלוח (עיר, רחוב, מספר בית, דירה):");
  },
  get askDeliveryMethod(): string {
    return ov("askDeliveryMethod", "איזה סוג משלוח תעדיף?");
  },
  get askBookTitle(): string {
    return ov("askBookTitle", "מה שם הספר שתרצה להזמין?");
  },
  get askQuantity(): string {
    return ov("askQuantity", "מה הכמות המבוקשת?");
  },
  get askMore(): string {
    return ov("askMore", "האם יש ספרים נוספים שתרצה להזמין?");
  },
  get askNotesPickup(): string {
    return ov("askNotesPickup", "האם יש הערות או בקשות נוספות להזמנה? (אם אין, אנא הקלד 'אין'):");
  },
  get askNotesDelivery(): string {
    return ov("askNotesDelivery", "האם יש הערות או בקשות נוספות למשלוח? (אם אין, אנא הקלד 'אין'):");
  },
  get invalidQuantity(): string {
    return ov("invalidQuantity", "לא הצלחתי לקרוא את הכמות. אנא הקלד מספר (לדוגמה: 2):");
  },

  get orderDonePickup(): string {
    return ov("orderDonePickup", "ההזמנה נקלטה בהצלחה! נעדכן ברגע שהספר/ים שהזמנת יגיע לחנות.");
  },
  get orderDoneDelivery(): string {
    return ov(
      "orderDoneDelivery",
      "ההזמנה נקלטה במערכת! נעדכן ברגע שההזמנה תהיה מוכנה למשלוח. " +
        "קישור מאובטח לתשלום (כולל עלות המשלוח שנבחרה) יישלח אליך בהקדם.",
    );
  },

  get quoteHandover(): string {
    return ov(
      "quoteHandover",
      "הפנייה שלך הועברה ישירות לנציג אנושי. נחזור אליך בהקדם האפשרי עם הצעת מחיר " +
        "מותאמת עבור כמויות גדולות ומוסדות.",
    );
  },

  get supportPrompt(): string {
    return ov("supportPrompt", "באיזו בעיה נתקלת או במה נוכל לעזור?");
  },
  get supportAskBook(): string {
    return ov("supportAskBook", "מה שם הספר שלא נמצא בתא?");
  },
  get supportReportSaved(): string {
    return ov("supportReportSaved", "הדיווח נרשם ויועבר לבדיקה. תודה על העדכון!");
  },
  get supportPosText(): string {
    return ov(
      "supportPosText",
      "הדיווח הועבר למנהל החנות לטיפול מיידי. בינתיים, ניתן לבצע תשלום בחנות במזומן, " +
        "העברה בנקאית או דרך הקישורים הדיגיטליים הניידים.",
    );
  },
  get supportHumanInHours(): string {
    return ov("supportHumanInHours", "מעבירה אותך לנציג אנושי, אנא המתן 🙂");
  },
  supportOffHours: (start: number, end: number): string =>
    ov("supportOffHours", DEFAULTS.supportOffHours)
      .replaceAll("{start}", String(start))
      .replaceAll("{end}", String(end)),
  get supportQuestionSaved(): string {
    return ov("supportQuestionSaved", "שאלתך נשמרה ונציג יחזור אליך עם תחילת שעות הפעילות. תודה!");
  },
  get handoverEndHint(): string {
    return ov("handoverEndHint", "נציג יענה בקרוב. לסיום השיחה, לחץ על הכפתור:");
  },
  get handoverEndButton(): string {
    return ov("handoverEndButton", "✅ סיימתי");
  },

  get endLoopPrompt(): string {
    return ov("endLoopPrompt", "האם יש עוד משהו שאוכל לעזור לך בו?");
  },
  closing: (storeName: string): string =>
    ov("closing", DEFAULTS.closing).replaceAll("{storeName}", storeName),

  get catalogCaption(): string {
    return ov(
      "catalogCaption",
      "מצורף קטלוג הספרים המלא והמעודכן של החנות! מקווים שתמצאו בו את מה שאתם מחפשים!",
    );
  },
  get catalogMissing(): string {
    return ov("catalogMissing", "סליחה, הקטלוג אינו זמין כרגע. נציג יחזור אליך עם הקטלוג בהקדם.");
  },

  get b1ImageFallback(): string {
    return ov(
      "b1ImageFallback",
      "אני עדיין בוט צעיר ולא יודע לקרוא תמונות... 🙈 אנא הקלד את שם הספר בטקסט ואשמח למצוא לך אותו בשנייה!",
    );
  },

  get b3NoOrders(): string {
    return ov(
      "b3NoOrders",
      "לא מצאתי הזמנה פעילה במערכת שמשויכת למספר הטלפון הזה. " +
        "אם ביצעת את ההזמנה ממספר אחר, תוכל לבדוק מול נציג בשעות הפעילות.",
    );
  },
  get b3MultipleOrders(): string {
    return ov("b3MultipleOrders", "מצאתי מספר הזמנות פעילות על שמך, באיזו מהן תרצה להתעדכן?");
  },
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "הוזמן",
  sent: "הגיע לחנות וממתין לך",
  completed: "הושלם",
  archived: "הושלם",
};

/** הודעת שעות פעילות וניווט (ענף 3). קישור הוויז נשלח כ-cta_url נפרד אם הוגדר. */
export function hoursMessage(content: BotContentConfig): string {
  return (
    `📍 כתובת החנות: ${content.storeAddress}.\n\n` +
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
    lines.push("(יש לוודא בסוף התהליך שקיבלת אישור על קבלת התשלום!)");
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
  const link = content.updatesGroupUrl
    ? `\n\nלחצו על הקישור והצטרפו אלינו: ${content.updatesGroupUrl}`
    : "\n\nנציג ישלח לך את קישור ההצטרפות בהקדם.";
  return (
    `שמחים שבחרתם להצטרף לקבוצת העדכונים של '${content.storeName}'! 🎉\n` +
    "כאן תהיו הראשונים להתעדכן בספרים חדשים שמגיעים למדפים, מבצעים בלעדיים לחברי הקבוצה, " +
    `וכל מה שחם בעולם הספרים. ✨${link}\n\nברוכים הבאים! 📚`
  );
}
