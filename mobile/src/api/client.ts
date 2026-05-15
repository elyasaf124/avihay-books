import axios from "axios";
import Constants from "expo-constants";

type ApiExtra = { apiBaseUrl?: string; apiKey?: string | null } | undefined;

function firstNonBlank(...candidates: (string | null | undefined)[]): string | undefined {
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const t = c.trim();
    if (t.length > 0) return t;
  }
  return undefined;
}

const extra = Constants.expoConfig?.extra as ApiExtra;
/** `??` לא מדלג על מחרוזת ריקה — אחרי EAS לפעמים נשאר `""` וה־`baseURL` נשבר בלי fallback ל־`extra`. קודם `extra` מה־manifest. */
export const API_BASE_URL =
  firstNonBlank(extra?.apiBaseUrl, process.env.EXPO_PUBLIC_API_BASE_URL) ??
  "http://localhost:4000/api/v1";

const apiKey = firstNonBlank(extra?.apiKey ?? undefined, process.env.EXPO_PUBLIC_API_KEY);

export const api = axios.create({
  baseURL: API_BASE_URL,
  /** שרותים חינמיים (כגון Render) עלולים «להירדם» ולענות אחרי 10–60 שניות מהקריאה הראשונה */
  timeout: 45_000,
});

if (apiKey) {
  api.defaults.headers.common["x-api-key"] = apiKey;
}

/** שם המארח מה־`baseURL` (בלי סודות) לתצוגה באבחון בעיות. */
export function apiPublicBaseHost(): string | null {
  const raw = API_BASE_URL.trim();
  if (!raw) return null;
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw) ? raw : `https://${raw}`;
    return new URL(withScheme).host;
  } catch {
    /** גיבוי כשהכתובת לא תקינה ל־`URL()` אבל עדיין נראית כמו `host/path`. */
    const noProto = raw.replace(/^https?:\/\//iu, "");
    const host = noProto.split("/")[0]?.trim();
    return host && host.length > 0 ? host : null;
  }
}
