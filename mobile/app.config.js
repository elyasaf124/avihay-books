const path = require("path");
const fs = require("fs");
const { loadProjectEnv } = require("@expo/env");

/** שינוי מזהה האפליקציה לפיתוח כדי לא לדרוס את גרסת הייצור בטלפון. שנה ל-false כדי לחזור לפרודקשן בקלות */
const IS_DEV_PACKAGE = false;

/** מצב טעינת קבצי `.env.*` — מתאים ל־`EAS` (`EAS_BUILD_PROFILE`) או ל־`NODE_ENV` מקומי */
function getExpoEnvMode() {
  const profile = process.env.EAS_BUILD_PROFILE;
  if (profile === "production") return "production";
  if (profile === "development") return "development";
  if (process.env.EXPO_ENV_MODE === "production" || process.env.EXPO_ENV_MODE === "development") {
    return process.env.EXPO_ENV_MODE;
  }
  return process.env.NODE_ENV || "development";
}

// סדר `@expo/env`: `.env.<mode>.local` → `.env.local` → `.env.<mode>` → `.env` (ראו `getEnvFiles`)
loadProjectEnv(path.join(__dirname), { mode: getExpoEnvMode(), silent: true });

/** `??` לא מטפל במחרוזת ריקה; בקובץ נשאר מהמחיקה ב־`git` או אחרי `${VAR}` שלא הוחלף ב־EAS. */
function firstNonBlank(...candidates) {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
  }
  return undefined;
}

/** קישור לפרויקט ב־EAS — נוצר ב־`expo.dev` (אי אפשר לכתוב לקובץ דינמי מ־`eas init`). */
const EAS_LINKED_PROJECT_ID = "7bfd3dfc-eeb0-4d5b-bd7e-90913e89af22";
function normalizeUuid(value) {
  if (typeof value !== "string") return "";
  const t = value.trim().replace(/^\uFEFF/, "").replace(/\s+$/g, "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t) ? t : "";
}

const easProjectId =
  normalizeUuid(process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? "") ||
  normalizeUuid(process.env.EAS_PROJECT_ID ?? "") ||
  EAS_LINKED_PROJECT_ID;
const PRODUCTION_API_URL = "https://avihay-books-api.onrender.com/api/v1";
const PRODUCTION_API_KEY = "15b9cb452363ad4f6df728cad766018ddc788ca0ec8c4d0e2610030eb70356de";

const rawApiBaseUrl =
  firstNonBlank(process.env.EXPO_PUBLIC_API_BASE_URL) ?? "http://localhost:4000/api/v1";
/** בפרודקשן – אם ה־URL נשאר `localhost` (סימן שהסביבה לא נטענה) — נפנה ל־Render */
const isProductionBuild = process.env.EAS_BUILD_PROFILE === "production" || process.env.EXPO_PUBLIC_APP_ENV === "production";
const apiBaseUrl =
  isProductionBuild && (rawApiBaseUrl.includes("localhost") || rawApiBaseUrl.includes("127.0.0.1"))
    ? PRODUCTION_API_URL
    : rawApiBaseUrl;
const apiKeyRaw = firstNonBlank(process.env.EXPO_PUBLIC_API_KEY);
const apiKey = apiKeyRaw ?? (isProductionBuild ? PRODUCTION_API_KEY : null);
/* מחובר ל־EXPO_PUBLIC_APP_ENV או EAS; ברירת מחדל development */
const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? "development";
const hasEasProjectId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
  easProjectId,
);

const googleServicesFile = "./google-services.json";
const hasGoogleServices = fs.existsSync(path.join(__dirname, googleServicesFile));

module.exports = ({ config }) => {
  const name = IS_DEV_PACKAGE ? `${config.name}-dev` : config.name;
  const android = {
    ...config.android,
    package: IS_DEV_PACKAGE ? `${config.android?.package ?? "com.avihay.books"}.dev` : (config.android?.package ?? "com.avihay.books"),
    permissions: [
      ...new Set([
        ...(config.android?.permissions ?? []),
        "android.permission.POST_NOTIFICATIONS",
      ]),
    ],
    ...(hasGoogleServices ? { googleServicesFile } : {}),
  };
  const ios = {
    ...config.ios,
    bundleIdentifier: IS_DEV_PACKAGE ? `${config.ios?.bundleIdentifier ?? "com.avihay.books"}.dev` : (config.ios?.bundleIdentifier ?? "com.avihay.books"),
  };

  const updatesEnabled = isProductionBuild && hasEasProjectId;

  return {
    ...config,
    name,
    android,
    ios,
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      ...config.updates,
      enabled: updatesEnabled,
      checkAutomatically: updatesEnabled ? "ON_LOAD" : "NEVER",
      fallbackToCacheTimeout: updatesEnabled ? 0 : undefined,
      ...(updatesEnabled ? { url: `https://u.expo.dev/${easProjectId}` } : {}),
    },
    extra: {
      ...config.extra,
      apiBaseUrl,
      apiKey,
      appEnv,
      eas: { projectId: easProjectId },
    },
  };
};
