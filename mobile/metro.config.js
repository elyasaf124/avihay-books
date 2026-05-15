const { getDefaultConfig } = require("expo/metro-config");

/**
 * ברירות המחדל של Expo (SDK 54+) כבר מוסיפות `watchFolders` / `resolver.nodeModulesPaths`
 * לפי workspaces ב־`package.json`; אל תדרוס אותן — זה מאכזב את `expo-doctor`.
 *
 * רק על Windows: מסנני stubs אופציונליים של `@esbuild/linux-*` שגורמים ל־Metro ENOENT בטעימה.
 */
const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

const esbuildExtras =
  process.platform === "win32"
    ? [/node_modules[/\\]@esbuild[/\\](?!win32).*$/]
    : [];

if (esbuildExtras.length > 0 && config.resolver) {
  const existing = Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : config.resolver.blockList != null
      ? [config.resolver.blockList]
      : [];
  config.resolver.blockList = [...existing, ...esbuildExtras];
}

module.exports = config;
