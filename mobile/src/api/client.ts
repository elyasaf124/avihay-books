import axios from "axios";
import Constants from "expo-constants";
import { Platform } from "react-native";

type ApiExtra = { apiBaseUrl?: string; apiKey?: string | null } | undefined;

function firstNonBlank(...candidates: (string | null | undefined)[]): string | undefined {
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const t = c.trim();
    if (t.length > 0) return t;
  }
  return undefined;
}

function isPrivateLanHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1") return false;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  return false;
}

/** Chrome חוסם בקשות מ־`localhost` (Expo Web) ל־IP ברשת מקומית — Private Network Access. */
function rewriteLanToLocalhostForWebDev(url: string): string {
  if (!__DEV__ || Platform.OS !== "web") return url;
  try {
    const normalized = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url) ? url : `http://${url}`;
    const parsed = new URL(normalized);
    if (!isPrivateLanHost(parsed.hostname)) return url;
    parsed.hostname = "localhost";
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Android emulator: reach the dev machine via `10.0.2.2` (not `localhost` / LAN IP). */
function rewriteForAndroidEmulator(url: string): string {
  if (!__DEV__ || Platform.OS !== "android" || Constants.isDevice) return url;
  try {
    const normalized = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url) ? url : `http://${url}`;
    const parsed = new URL(normalized);
    if (parsed.protocol === "https:") return url;
    const host = parsed.hostname;
    const isLocalDevHost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "10.0.2.2" ||
      isPrivateLanHost(host);
    if (!isLocalDevHost) return url;
    if (host === "10.0.2.2") return url;
    parsed.hostname = "10.0.2.2";
    return parsed.toString();
  } catch {
    return url;
  }
}

/** @internal Previous name — kept so stale Metro HMR bundles don't crash on reload. */
function rewriteLocalhostForAndroidEmulator(url: string): string {
  return rewriteForAndroidEmulator(url);
}

const extra = Constants.expoConfig?.extra as ApiExtra;

/** כתובת ידועה מראש — אם המשתנים לא נטענו בפרודקשן, נפנה לכאן */
const PRODUCTION_API_URL = "https://avihay-books-api.onrender.com/api/v1";
const PRODUCTION_API_KEY = "15b9cb452363ad4f6df728cad766018ddc788ca0ec8c4d0e2610030eb70356de";

/**
 * בפיתוח — `EXPO_PUBLIC_*` מה־`.env` קודם ל־`extra` (ב־`app.json` נשאר `localhost` לברירת מחדל).
 * בפרודקשן — `extra` מה־manifest קודם (EAS / prebuild).
 */
const resolvedUrl = __DEV__
  ? (firstNonBlank(process.env.EXPO_PUBLIC_API_BASE_URL, extra?.apiBaseUrl) ??
    "http://localhost:4000/api/v1")
  : (firstNonBlank(extra?.apiBaseUrl, process.env.EXPO_PUBLIC_API_BASE_URL) ??
    "http://localhost:4000/api/v1");

/** בפרודקשן — אם ה־URL נשאר `localhost` (סימן שהסביבה לא נטענה לבילד), נפנה ל־Render */
const isLocalhost = resolvedUrl.includes("localhost") || resolvedUrl.includes("127.0.0.1");
const afterProdFallback = !__DEV__ && isLocalhost ? PRODUCTION_API_URL : resolvedUrl;
export const API_BASE_URL = rewriteForAndroidEmulator(
  rewriteLanToLocalhostForWebDev(afterProdFallback),
);

const resolvedKey = firstNonBlank(extra?.apiKey ?? undefined, process.env.EXPO_PUBLIC_API_KEY);
const apiKey = resolvedKey ?? (!__DEV__ ? PRODUCTION_API_KEY : undefined);

export const api = axios.create({
  baseURL: API_BASE_URL,
  /** Local dev: fail fast; Render cold-start may need longer in production builds. */
  timeout: __DEV__ ? 12_000 : 45_000,
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
