const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

/**
 * ברירות המחדל של Expo (SDK 54+) כבר מוסיפות `watchFolders` / `resolver.nodeModulesPaths`
 * לפי workspaces ב־`package.json`; אל תדרוס אותן — זה מאכזב את `expo-doctor`.
 *
 * רק על Windows: מסנני stubs אופציונליים של `@esbuild/linux-*` שגורמים ל־Metro ENOENT בטעימה.
 * גם: `android/build` ו־`ios/build` בתוך `node_modules` (שאריות מבניית native) — לא רלוונטיים ל־Metro.
 */
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "..");
const sharedRoot = path.join(monorepoRoot, "shared");
const config = getDefaultConfig(projectRoot);

/**
 * `shared/dist` מחוץ ל־`projectRoot` — חייב להיות ב־`watchFolders` (SHA-1 / bundling).
 * טעינה מ־`dist` דרך `package.json` → `main` + `tsconfig` paths (לא מ־`src`).
 */
config.watchFolders = [...new Set([...(config.watchFolders ?? []), monorepoRoot, sharedRoot])];

/** Native build output inside packages — not needed for JS bundling; stale paths cause ENOENT on Windows. */
const metroBlockExtras = [
  /node_modules[/\\][^/\\]+[/\\]android[/\\]build[/\\].*/,
  /node_modules[/\\][^/\\]+[/\\]ios[/\\]build[/\\].*/,
];

if (process.platform === "win32") {
  metroBlockExtras.push(/node_modules[/\\]@esbuild[/\\](?!win32).*$/);
}

if (metroBlockExtras.length > 0 && config.resolver) {
  const existing = Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : config.resolver.blockList != null
      ? [config.resolver.blockList]
      : [];
  config.resolver.blockList = [...existing, ...metroBlockExtras];
}

module.exports = config;
