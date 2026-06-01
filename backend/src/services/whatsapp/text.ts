/**
 * מחרוזות עברית ובוני-הודעות לבוט הוואטסאפ של "נועם הספר".
 * מזהי הכפתורים/שורות (`*_ID`) הם הערכים שחוזרים ב-`interactive reply` מ-Meta
 * ומשמשים את מנוע השיחה לניתוב.
 */
import type { BotContentConfig } from "./config.js";

/** מזהי שורות התפריט הראשי (List Message — עד 10 שורות). */
export const MENU_IDS = {
  stock: "menu:stock",
  order: "menu:order",
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
} as const;

export const PICK_PREFIX = "pick:";

export const T = {
  welcome: (storeName: string): string =>
    `שלום! ברוך הבא לחנות הספרים '${storeName}' 📚\n` +
    `אני נועם, העוזר הווירטואלי של החנות. איך אוכל לעזור לך?`,
  menuButton: "תפריט ראשי",
  menuPrompt: "בחר מהתפריט:",

  b1AskTitle: "אנא הקלד את שם הספר שאתה מחפש:",
  b1ManyMatches: "מצאתי כמה אפשרויות, למה התכוונת?",
  b1NoMatch:
    "מצטער, לא מצאתי את הספר בקטלוג שלנו. כדאי לוודא ששם הספר מאויית נכון. " +
    "אם הוא מדויק, כנראה שהוא חסר כרגע. תרצה להזמין אותו?",

  orderAskType: "איזה סוג הזמנה תרצה לבצע?",
  askName: "נא להקליד שם מלא:",
  askPhone: "נא להקליד מספר טלפון ליצירת קשר:",
  askAddress: "נא להקליד כתובת מלאה למשלוח (עיר, רחוב, מספר בית, דירה):",
  askDeliveryMethod: "איזה סוג משלוח תעדיף?",
  askBookTitle: "מה שם הספר שתרצה להזמין?",
  askQuantity: "מה הכמות המבוקשת?",
  askMore: "האם יש ספרים נוספים שתרצה להזמין?",
  askNotesPickup: "האם יש הערות או בקשות נוספות להזמנה? (אם אין, אנא הקלד 'אין'):",
  askNotesDelivery: "האם יש הערות או בקשות נוספות למשלוח? (אם אין, אנא הקלד 'אין'):",
  invalidQuantity: "לא הצלחתי לקרוא את הכמות. אנא הקלד מספר (לדוגמה: 2):",

  orderDonePickup:
    "ההזמנה נקלטה בהצלחה! נעדכן ברגע שהספר/ים שהזמנת יגיע לחנות.",
  orderDoneDelivery:
    "ההזמנה נקלטה במערכת! נעדכן ברגע שההזמנה תהיה מוכנה למשלוח. " +
    "קישור מאובטח לתשלום (כולל עלות המשלוח שנבחרה) יישלח אליך בהקדם.",

  quoteHandover:
    "הפנייה שלך הועברה ישירות לנציג אנושי. נחזור אליך בהקדם האפשרי עם הצעת מחיר " +
    "מותאמת עבור כמויות גדולות ומוסדות.",

  supportPrompt: "באיזו בעיה נתקלת או במה נוכל לעזור?",
  supportAskBook: "מה שם הספר שלא נמצא בתא?",
  supportReportSaved: "הדיווח נרשם ויועבר לבדיקה. תודה על העדכון!",
  supportPosText:
    "הדיווח הועבר למנהל החנות לטיפול מיידי. בינתיים, ניתן לבצע תשלום בחנות במזומן, " +
    "העברה בנקאית או דרך הקישורים הדיגיטליים הניידים.",
  supportHumanInHours: "מעבירה אותך לנציג אנושי, אנא המתן 🙂",
  supportOffHours: (start: number, end: number): string =>
    `המענה האנושי שלנו פעיל בין השעות ${start}:00 ל-${end}:00. ` +
    "באפשרותך לכתוב כאן את שאלתך בטקסט חופשי, ונציג יחזור אליך מיד עם תחילת שעות הפעילות!",
  supportQuestionSaved: "שאלתך נשמרה ונציג יחזור אליך עם תחילת שעות הפעילות. תודה!",

  endLoopPrompt: "האם יש עוד משהו שאוכל לעזור לך בו?",
  closing: (storeName: string): string =>
    `שמחתי מאוד לעזור! אשמח לעזור לך גם בעתיד בכל דבר שתרצה! ` +
    `נועם, הבוט של '${storeName}' 😉`,

  catalogCaption:
    "מצורף קטלוג הספרים המלא והמעודכן של החנות! מקווים שתמצאו בו את מה שאתם מחפשים!",
  catalogMissing:
    "סליחה, הקטלוג אינו זמין כרגע. נציג יחזור אליך עם הקטלוג בהקדם.",
} as const;

/** הודעת שעות פעילות וניווט (ענף 3). קישור הוויז נשלח כ-cta_url נפרד אם הוגדר. */
export function hoursMessage(content: BotContentConfig): string {
  return (
    `📍 כתובת החנות: ${content.storeAddress}.\n\n` +
    `🕒 שעות פעילות:\n${content.hoursText}`
  );
}

/** הודעת אפשרויות תשלום (ענף 4). */
export function paymentMessage(content: BotContentConfig): string {
  const links: string[] = [];
  if (content.paymentCreditUrl) links.push(`💳 תשלום באשראי: ${content.paymentCreditUrl}`);
  if (content.paymentBitUrl) links.push(`📱 תשלום בביט: ${content.paymentBitUrl}`);
  if (content.paymentPayboxUrl) links.push(`💼 תשלום בפייבוקס: ${content.paymentPayboxUrl}`);
  const linksBlock = links.length > 0 ? `\n\n📱 תשלום דיגיטלי מהיר:\n${links.join("\n")}` : "";
  return (
    "באפשרותך לשלם במגוון דרכים לבחירתך:\n\n" +
    "💵 מזומן: ניתן לשלם ישירות בקופת המזומן בחנות.\n\n" +
    `🏦 העברה בנקאית:\n${content.bankDetails}${linksBlock}`
  );
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
