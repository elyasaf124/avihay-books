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

const MEDIA_UNSUPPORTED_DEFAULT =
  "סליחה, לא הבנתי את התשובה שלך, אנא שלחו הודעת טקסט...";

/**
 * טקסטי הבוט. כל ערך נקרא דרך `ov()` כך שטקסט שהעובד הגדיר באפליקציה גובר על
 * ברירת המחדל. הטקסטים עם פרמטרים (`welcome`, `supportOffHours`)
 * תומכים ב-placeholders: `{storeName}`, `{start}`, `{end}`.
 */
const DEFAULTS = {
  welcome:
    "שלום! ברוכים הבאים לחנות הספרים '{storeName}' 📚\n" +
    "אני נועם, העוזר הווירטואלי של החנות. איך נוכל לעזור לכם?\n\n" +
    "כיוון שאני רק בוט, אני לא יכול לקבל תמונות והקלטות קוליות. אבל עם הודעות טקסט אני מסתדר מעולה 💪🏼😉",
  closing:
    "שמחתי מאוד לעזור. אשמח לסייע גם בעתיד! תמיד כאן לשירותכם!\n" +
    "נועם, העוזר החכם של 'נועם הספר' 😉",
  supportOffHours:
    "המענה האנושי שלנו פעיל בימים א'-ה' בין השעות {start}:00 ל-{end}:00.\n" +
    "באפשרותך לכתוב כאן את שאלתך בטקסט חופשי, ונציג יחזור אליך במהלך שעות הפעילות!",
} as const;

export const T = {
  welcome: (storeName: string): string =>
    ov("welcome", DEFAULTS.welcome).replaceAll("{storeName}", storeName),
  get menuButton(): string {
    return ov("menuButton", "תפריט ראשי");
  },
  get menuPrompt(): string {
    return ov("menuPrompt", "בחרו מהתפריט:");
  },

  get b1AskTitle(): string {
    return ov("b1AskTitle", "אנא הקלידו את שם הספר שאתם מחפשים:");
  },
  get b1ManyMatches(): string {
    return ov("b1ManyMatches", "מצאתי כמה אפשרויות, למה התכוונתם?");
  },
  get b1NoMatch(): string {
    return ov(
      "b1NoMatch",
      "מצטער, לא מצאתי את הספר בקטלוג שלנו. כדאי לוודא ששם הספר מאויית נכון. " +
        "אם הוא מדויק, כנראה שהוא חסר כרגע. תרצו להזמין אותו?",
    );
  },

  get orderAskType(): string {
    return ov("orderAskType", "איזה סוג הזמנה תרצו לבצע?");
  },
  get askName(): string {
    return ov("askName", "נא להקלידו שם מלא:");
  },
  get askPhone(): string {
    return ov("askPhone", "נא להקלידו מספר טלפון ליצירת קשר:");
  },
  get askPhoneDelivery(): string {
    return ov(
      "askPhoneDelivery",
      "נא להזין את מספר הטלפון של מי שיקבל את המשלוח (למקרה שמדובר במתנה, חייל בסדיר וכד'):",
    );
  },
  get invalidPhone(): string {
    return ov(
      "invalidPhone",
      "מספר הטלפון אינו תקין. נא להקלידו מספר ישראלי בן 10 ספרות (לדוגמה: 0501234567):",
    );
  },
  get askAddress(): string {
    return ov("askAddress", "נא להקלידו כתובת מלאה למשלוח (עיר, רחוב, מספר בית, דירה):");
  },
  get askDeliveryMethod(): string {
    return ov("askDeliveryMethod", "איזה סוג משלוח תעדיפו?");
  },
  get askBookTitle(): string {
    return ov("askBookTitle", "מה שם הספר שתרצו להזמין?");
  },
  get askQuantity(): string {
    return ov("askQuantity", "מה הכמות המבוקשת?");
  },
  get askMore(): string {
    return ov("askMore", "האם יש ספרים נוספים שתרצו להזמין?");
  },
  get askNotesPickup(): string {
    return ov("askNotesPickup", "האם יש הערות או בקשות נוספות להזמנה?");
  },
  get askNotesDelivery(): string {
    return ov("askNotesDelivery", "האם יש הערות או בקשות נוספות למשלוח?");
  },
  get askNotesDetailPickup(): string {
    return ov("askNotesDetailPickup", "נא לפרט את ההערות או הבקשות:");
  },
  get askNotesDetailDelivery(): string {
    return ov("askNotesDetailDelivery", "נא לפרט את ההערות או הבקשות:");
  },
  get invalidQuantity(): string {
    return ov("invalidQuantity", "לא הצלחתי לקרוא את הכמות. אנא הקלידו מספר (לדוגמה: 2):");
  },

  get orderSummaryIntro(): string {
    return ov("orderSummaryIntro", "להלן סיכום ההזמנה שלכם:");
  },
  get orderSummaryConfirmQuestion(): string {
    return ov("orderSummaryConfirmQuestion", "האם לאשר ולשלוח את ההזמנה?");
  },
  get orderSummaryNoBooks(): string {
    return ov(
      "orderSummaryNoBooks",
      "לא נוספו ספרים להזמנה. נא להקלידו את שם הספר שתרצו להזמין:",
    );
  },
  get orderEditListTitle(): string {
    return ov("orderEditListTitle", "מה תרצו לערוך?");
  },
  get orderEditBooksTitle(): string {
    return ov("orderEditBooksTitle", "עריכת ספרים — בחרו פעולה:");
  },
  get orderCancelled(): string {
    return ov("orderCancelled", "ההזמנה בוטלה. אפשר להתחיל מחדש מהתפריט.");
  },

  get orderDonePickup(): string {
    return ov(
      "orderDonePickup",
      "ההזמנה נקלטה בהצלחה! נעדכן ברגע שהספר/ים שהזמנת יגיעו לחנות.",
    );
  },
  get orderDoneDelivery(): string {
    return ov(
      "orderDoneDelivery",
      "ההזמנה נקלטה במערכת! נעדכן ברגע שההזמנה תהיה מוכנה למשלוח. " +
        "קישור מאובטח לתשלום (כולל עלות המשלוח שנבחרה) יישלח אליכם בהקדם.",
    );
  },

  get quoteHandover(): string {
    return ov(
      "quoteHandover",
      "הפנייה שלכם הועברה ישירות לנציג אנושי. נחזור אליכם בהקדם האפשרי עם הצעת מחיר " +
        "מותאמת עבור כמויות גדולות ומוסדות.",
    );
  },

  get supportPrompt(): string {
    return ov("supportPrompt", "באיזו בעיה נתקלתם או במה נוכל לעזור?");
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
    return ov("supportHumanInHours", "מעבירים אתכם לנציג אנושי, אנא המתינו 🙂");
  },
  supportOffHours: (start: number, end: number): string =>
    ov("supportOffHours", DEFAULTS.supportOffHours)
      .replaceAll("{start}", String(start))
      .replaceAll("{end}", String(end)),
  get supportQuestionSaved(): string {
    return ov(
      "supportQuestionSaved",
      "שאלתכם נשמרה ונציג יחזור אליכם במהלך שעות הפעילות. תודה!",
    );
  },
  get handoverEndHint(): string {
    return ov("handoverEndHint", "נציג יענה בקרוב. לסיום השיחה, לחצו על הכפתור:");
  },
  get handoverEndHintRepeat(): string {
    return ov("handoverEndHintRepeat", "לסיום השיחה:");
  },
  get handoverEndButton(): string {
    return ov("handoverEndButton", "✅ סיימתי");
  },

  get endLoopPrompt(): string {
    return ov("endLoopPrompt", "האם יש עוד משהו שנוכל לעזור לכם בו?");
  },
  closing: (_storeName: string): string => ov("closing", DEFAULTS.closing),

  get loopYesButton(): string {
    return "כן, אשמח😊";
  },
  get loopNoButton(): string {
    return "לא, תודה רבה 🙏";
  },

  get catalogCaption(): string {
    return ov(
      "catalogCaption",
      "מצורף קטלוג הספרים המלא והמעודכן של החנות! מקווים שתמצאו בו את מה שאתם מחפשים!",
    );
  },
  get catalogMissing(): string {
    return ov(
      "catalogMissing",
      "סליחה, הקטלוג אינו זמין כרגע. נציג יחזור אליכם עם הקטלוג בהקדם.",
    );
  },

  get mediaUnsupported(): string {
    return ov("mediaUnsupported", MEDIA_UNSUPPORTED_DEFAULT);
  },
  /** @deprecated השתמשו ב-`mediaUnsupported` — נשמר לתאימות עקיפות ישנות */
  get b1ImageFallback(): string {
    return ov("b1ImageFallback", MEDIA_UNSUPPORTED_DEFAULT);
  },

  get b3NoOrders(): string {
    return ov(
      "b3NoOrders",
      "לא מצאתי הזמנה פעילה במערכת שמשויכת למספר הטלפון הזה. " +
        "אם ביצעתם את ההזמנה ממספר אחר, תוכלו לבדוק מול נציג בשעות הפעילות.",
    );
  },
  get b3MultipleOrders(): string {
    return ov("b3MultipleOrders", "מצאתי מספר הזמנות פעילות על שמכם, באיזו מהן תרצו להתעדכן?");
  },

  get navBackButton(): string {
    return ov("navBackButton", "⬅️ חזרו");
  },
  get navHint(): string {
    return ov("navHint", "ניווט:");
  },
  get navBackUnavailable(): string {
    return ov("navBackUnavailable", "אין שלב קודם — חוזרים לתפריט הראשי.");
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
