import { getMessages } from "../../repos/whatsappMessages.repo.js";

/**
 * מפיק סיכום חינמי של הודעות הלקוח האחרונות מתוך טבלת ה-DB.
 * מקבל את מספר הלקוח ומחזיר מחרוזת מפורמטת המרכזת את תוכן הפנייה.
 */
export async function generateFreeChatSummary(phone: string, limit = 5): Promise<string> {
  try {
    const messages = await getMessages(phone, limit);
    if (!messages || messages.length === 0) {
      return "לא נמצאו הודעות קודמות בשיחה.";
    }

    // הודעות נכנסות בלבד (מהלקוח לבוט), בסדר כרונולוגי (ישן → חדש)
    const inbound = messages
      .filter((m) => m.direction === "in" && m.body && m.body.trim().length > 0)
      .reverse();

    if (inbound.length === 0) {
      return "הלקוח לא שלח הודעות טקסט לאחרונה.";
    }

    const lines = inbound.map((m) => `• ${m.body?.trim()}`);
    return lines.join("\n");
  } catch {
    return "לא ניתן היה לשלוף את היסטוריית השיחה.";
  }
}
