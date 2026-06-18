import type { BotTextKey } from "./botConfig.js";

const MEDIA_UNSUPPORTED =
  "סליחה, לא הבנתי את התשובה שלך, אנא שלחו הודעת טקסט...";

/**
 * נוסחי ברירת המחדל לכל מפתח טקסט הניתן לעקיפה.
 * `welcome` ו-`closing` תומכים ב-`{storeName}`; `supportOffHours` ב-`{start}` ו-`{end}`.
 */
export const BOT_TEXT_DEFAULTS: Record<BotTextKey, string> = {
  welcome:
    "שלום! ברוכים הבאים לחנות הספרים '{storeName}' 📚\n" +
    "אני נועם, העוזר הווירטואלי של החנות. איך נוכל לעזור לכם?\n\n" +
    "כיוון שאני רק בוט, אני לא יכול לקבל תמונות והקלטות קוליות. אבל עם הודעות טקסט אני מסתדר מעולה 💪🏼😉",
  menuButton: "תפריט ראשי",
  menuPrompt: "בחרו מהתפריט:",
  closing:
    "שמחתי מאוד לעזור. אשמח לסייע גם בעתיד! תמיד כאן לשירותכם!\n" +
    "נועם, העוזר החכם של 'נועם הספר' 😉",
  b1AskTitle: "אנא הקלידו את שם הספר שאתם מחפשים:",
  b1ManyMatches: "מצאתי כמה אפשרויות, למה התכוונתם?",
  b1NoMatch:
    "מצטער, לא מצאתי את הספר בקטלוג שלנו. כדאי לוודא ששם הספר מאויית נכון. " +
    "אם הוא מדויק, כנראה שהוא חסר כרגע. תרצו להזמין אותו?",
  b1ImageFallback: MEDIA_UNSUPPORTED,
  mediaUnsupported: MEDIA_UNSUPPORTED,
  orderAskType: "איזה סוג הזמנה תרצו לבצע?",
  askName: "נא להקלידו שם מלא:",
  askPhone: "נא להקלידו מספר טלפון ליצירת קשר:",
  askPhoneDelivery:
    "נא להזין את מספר הטלפון של מי שיקבל את המשלוח (למקרה שמדובר במתנה, חייל בסדיר וכד'):",
  invalidPhone:
    "מספר הטלפון אינו תקין. נא להקלידו מספר ישראלי בן 10 ספרות (לדוגמה: 0501234567):",
  askAddress: "נא להקלידו כתובת מלאה למשלוח (עיר, רחוב, מספר בית, דירה):",
  askDeliveryMethod: "איזה סוג משלוח תעדיפו?",
  askBookTitle: "מה שם הספר שתרצו להזמין?",
  askQuantity: "מה הכמות המבוקשת?",
  askMore: "האם יש ספרים נוספים שתרצו להזמין?",
  askNotesPickup: "האם יש הערות או בקשות נוספות להזמנה?",
  askNotesDelivery: "האם יש הערות או בקשות נוספות למשלוח?",
  askNotesDetailPickup: "נא לפרט את ההערות או הבקשות:",
  askNotesDetailDelivery: "נא לפרט את ההערות או הבקשות:",
  invalidQuantity: "לא הצלחתי לקרוא את הכמות. אנא הקלידו מספר (לדוגמה: 2):",
  orderSummaryIntro: "להלן סיכום ההזמנה שלכם:",
  orderSummaryConfirmQuestion: "האם לאשר ולשלוח את ההזמנה?",
  orderSummaryNoBooks: "לא נוספו ספרים להזמנה. נא להקלידו את שם הספר שתרצו להזמין:",
  orderEditListTitle: "מה תרצו לערוך?",
  orderEditBooksTitle: "עריכת ספרים — בחרו פעולה:",
  orderCancelled: "ההזמנה בוטלה. אפשר להתחיל מחדש מהתפריט.",
  orderDonePickup: "ההזמנה נקלטה בהצלחה! נעדכן ברגע שהספר/ים שהזמנת יגיעו לחנות.",
  orderDoneDelivery:
    "ההזמנה נקלטה במערכת! נעדכן ברגע שההזמנה תהיה מוכנה למשלוח. " +
    "קישור מאובטח לתשלום (כולל עלות המשלוח שנבחרה) יישלח אליכם בהקדם.",
  quoteHandover:
    "הפנייה שלכם הועברה ישירות לנציג אנושי. נחזור אליכם בהקדם האפשרי עם הצעת מחיר " +
    "מותאמת עבור כמויות גדולות ומוסדות.",
  supportPrompt: "באיזו בעיה נתקלתם או במה נוכל לעזור?",
  supportAskBook: "מה שם הספר שלא נמצא בתא?",
  supportReportSaved: "הדיווח נרשם ויועבר לבדיקה. תודה על העדכון!",
  supportPosText:
    "הדיווח הועבר למנהל החנות לטיפול מיידי. בינתיים, ניתן לבצע תשלום בחנות במזומן, " +
    "העברה בנקאית או דרך הקישורים הדיגיטליים הניידים.",
  supportHumanInHours: "מעבירים אתכם לנציג אנושי, אנא המתינו 🙂",
  supportOffHours:
    "המענה האנושי שלנו פעיל בימים א'-ה' בין השעות {start}:00 ל-{end}:00.\n" +
    "באפשרותך לכתוב כאן את שאלתך בטקסט חופשי, ונציג יחזור אליך במהלך שעות הפעילות!",
  supportQuestionSaved: "שאלתכם נשמרה ונציג יחזור אליכם במהלך שעות הפעילות. תודה!",
  handoverEndHint: "נציג יענה בקרוב. לסיום השיחה, לחצו על הכפתור:",
  handoverEndHintRepeat: "לסיום השיחה:",
  handoverEndButton: "✅ סיימתי",
  endLoopPrompt: "האם יש עוד משהו שנוכל לעזור לכם בו?",
  catalogCaption:
    "מצורף קטלוג הספרים המלא והמעודכן של החנות! מקווים שתמצאו בו את מה שאתם מחפשים!",
  catalogMissing: "סליחה, הקטלוג אינו זמין כרגע. נציג יחזור אליכם עם הקטלוג בהקדם.",
  b3NoOrders:
    "לא מצאתי הזמנה פעילה במערכת שמשויכת למספר הטלפון הזה. " +
    "אם ביצעתם את ההזמנה ממספר אחר, תוכלו לבדוק מול נציג בשעות הפעילות.",
  b3MultipleOrders: "מצאתי מספר הזמנות פעילות על שמכם, באיזו מהן תרצו להתעדכן?",
  navBackButton: "⬅️ חזרו",
  navHint: "ניווט:",
  navBackUnavailable: "אין שלב קודם — חוזרים לתפריט הראשי.",
};

/** מחזיר override רק אם שונה מברירת המחדל; אחרת `undefined` (ללא שמירה). */
export function normalizeBotTextOverride(key: BotTextKey, value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === BOT_TEXT_DEFAULTS[key]) return undefined;
  return trimmed;
}
