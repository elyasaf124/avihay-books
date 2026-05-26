/**
 * Runs a command from mobile/ with EXPO_NO_METRO_WORKSPACE_ROOT=1 (monorepo Metro).
 * Usage: node scripts/run-with-monorepo-root.cjs npx expo prebuild --platform android
 */
const path = require("path");
const { spawnSync } = require("child_process");

const mobileRoot = path.join(__dirname, "..");
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/run-with-monorepo-root.cjs <command> [args...]");
  process.exit(1);
}

const env = {
  ...process.env,
  EXPO_NO_METRO_WORKSPACE_ROOT: "1",
};

const result = spawnSync(args[0], args.slice(1), {
  cwd: mobileRoot,
  env,
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 1);
