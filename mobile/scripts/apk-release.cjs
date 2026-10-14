/**
 * Production release APK build (no device install).
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const mobileRoot = path.join(__dirname, "..");
const androidDir = path.join(mobileRoot, "android");
const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";

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

const prepare = spawnSync("node", ["scripts/prepare-apk-release.cjs"], {
  cwd: mobileRoot,
  stdio: "inherit",
});
if (prepare.status !== 0) {
  process.exit(prepare.status ?? 1);
}

const result = spawnSync(
  "npx",
  [
    "dotenv",
    "-e",
    ".env.production",
    "--",
    gradlew,
    "assembleRelease",
    "-x",
    "lint",
    "-x",
    "test",
  ],
  { cwd: androidDir, env, stdio: "inherit", shell: true },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const apkCandidates = [
  path.join(mobileRoot, "android", "app", "build-alt", "outputs", "apk", "release", "app-release.apk"),
  path.join(mobileRoot, "android", "app", "build", "outputs", "apk", "release", "app-release.apk"),
];
const distApk = apkCandidates.find((p) => fs.existsSync(p));
if (distApk) {
  console.log(`\nAPK ready: ${distApk}\n`);
} else {
  console.error("\nBuild finished but app-release.apk was not found under build-alt or build/outputs.\n");
  process.exit(1);
}

process.exit(0);
