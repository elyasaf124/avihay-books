const path = require("path");
const { loadProjectEnv } = require("@expo/env");
// Monorepo: `npm run mobile:dev` may use repo root cwd; קורא תמיד `mobile/.env` לפי מיקום הקובץ
loadProjectEnv(path.join(__dirname), { silent: true });

const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? process.env.EAS_PROJECT_ID ?? "";
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";
const apiKey = process.env.EXPO_PUBLIC_API_KEY ?? null;
/* מחובר ל־EXPO_PUBLIC_APP_ENV או EAS; ברירת מחדל development */
const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? "development";
const hasEasProjectId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
  easProjectId,
);

module.exports = ({ config }) => ({
  ...config,
  runtimeVersion: {
    policy: "appVersion",
  },
  updates: {
    ...config.updates,
    checkAutomatically: "ON_LOAD",
    fallbackToCacheTimeout: 0,
    ...(hasEasProjectId ? { url: `https://u.expo.dev/${easProjectId}` } : { enabled: false }),
  },
  extra: {
    ...config.extra,
    apiBaseUrl,
    apiKey,
    appEnv,
    eas: hasEasProjectId ? { projectId: easProjectId } : undefined,
  },
});
