/**
 * Production release APK build (no device install).
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

const result = spawnSync(
  "npx",
  [
    "dotenv",
    "-e",
    ".env.production",
    "--",
    "npx",
    "expo",
    "run:android",
    "--variant",
    "release",
    "--no-install",
  ],
  { cwd: mobileRoot, env, stdio: "inherit", shell: true },
);

process.exit(result.status ?? 1);
