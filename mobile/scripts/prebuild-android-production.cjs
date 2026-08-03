/**
 * Regenerate android/ for production (com.avihay.books package).
 * Run before apk:release when native project is stale.
 */
const path = require("path");
const { spawnSync } = require("child_process");

const mobileRoot = path.join(__dirname, "..");
const env = {
  ...process.env,
  NODE_ENV: "production",
  EXPO_ENV_MODE: "production",
  EXPO_NO_METRO_WORKSPACE_ROOT: "1",
};

const check = spawnSync("node", ["scripts/check-google-services.cjs", "--strict"], {
  cwd: mobileRoot,
  stdio: "inherit",
});
if (check.status !== 0) {
  process.exit(check.status ?? 1);
}

const result = spawnSync(
  "npx",
  [
    "dotenv",
    "-e",
    ".env.production",
    "--",
    "npx",
    "expo",
    "prebuild",
    "--platform",
    "android",
    "--clean",
  ],
  { cwd: mobileRoot, env, stdio: "inherit", shell: true },
);

process.exit(result.status ?? 1);
