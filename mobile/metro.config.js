const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// Monorepo: prefer workspace + project node_modules first; hierarchical lookup resolves nested deps safely.
// Windows: npm may leave dangling optional `@esbuild/linux-*` (etc.) stubs; Metro's
// watcher can throw ENOENT. Extend the default blockList — Metro 0.83 does not expose
// `metro-config/src/defaults/exclusionList` as an importable subpath.
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
