import { he } from "../../i18n/he";

/** טקסט תצוגה לסוג הודעה שאינו טקסט (מדיה / אינטראקטיב). */
export function messagePreview(
  msgType: string,
  body: string | null,
): string {
  const text = (body ?? "").trim();
  if (text.length > 0) return text;
  switch (msgType) {
    case "image":
    case "sticker":
      return he.chat.imagePlaceholder;
    case "audio":
    case "voice":
      return he.chat.audioPlaceholder;
    case "video":
      return he.chat.videoPlaceholder;
    case "document":
      return he.chat.documentPlaceholder;
    case "interactive":
    case "button":
      return he.chat.interactivePlaceholder;
    default:
      return he.chat.mediaPlaceholder;
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** שעה בפורמט HH:mm. */
export function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** זמן יחסי לרשימת השיחות: שעה היום, "אתמול", או תאריך קצר. */
export function formatListTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const msgTime = d.getTime();
  if (msgTime >= startOfToday) return formatTime(iso);
  const oneDay = 24 * 60 * 60 * 1000;
  if (msgTime >= startOfToday - oneDay) return he.chat.yesterday;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}
