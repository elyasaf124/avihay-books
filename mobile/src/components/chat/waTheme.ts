/**
 * פלטת צבעים בסגנון WhatsApp (מודרני) — בשימוש מסכי הצ'אט בלבד כדי לתת תחושת
 * "וואטסאפ אמיתי", במנותק מ-design tokens הכלליים של האפליקציה.
 */
export const wa = {
  /** ירוק כותרת WhatsApp (header / accents). */
  header: "#008069",
  headerDark: "#005C4B",
  /** רקע "טפט" של מסך השיחה. */
  wallpaper: "#EFEAE2",
  /** בועת הודעה יוצאת (שנשלחה על-ידינו). */
  outBubble: "#D9FDD3",
  /** בועת הודעה נכנסת (מהלקוח). */
  inBubble: "#FFFFFF",
  /** רקע רשימת השיחות. */
  listBg: "#FFFFFF",
  divider: "#E9EDEF",
  inkPrimary: "#111B21",
  inkSecondary: "#667781",
  timestamp: "#667781",
  outTimestamp: "#4A8C6E",
  /** תג הודעות שלא נקראו. */
  unreadBadge: "#25D366",
  unreadText: "#FFFFFF",
  /** שדה קלט. */
  inputBg: "#FFFFFF",
  inputBarBg: "#F0F2F5",
  sendButton: "#008069",
  sendButtonDisabled: "#9AA6AB",
  avatarBg: "#DFE5E7",
  avatarText: "#5E6B71",
  link: "#027EB5",
  warningBg: "#FFF3C4",
  warningInk: "#6B5900",
} as const;

const AVATAR_COLORS = [
  "#0EA5A4",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#F59E0B",
  "#10B981",
  "#EF4444",
  "#6366F1",
];

/** צבע אווטאר עקבי לפי מספר טלפון (כמו וואטסאפ — צבע לכל איש קשר). */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

/** אות פתיחה לאווטאר מתוך שם או מספר. */
export function avatarInitial(name: string | null, phone: string): string {
  const source = (name ?? "").trim() || phone;
  const first = source.replace(/[^\p{L}\p{N}]/gu, "").charAt(0);
  return first ? first.toUpperCase() : "?";
}
