/**
 * Runs gradlew assembleRelease in mobile/android/
 */
const path = require("path");
const { spawnSync } = require("child_process");

const androidDir = path.join(__dirname, "..", "android");
const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";

const result = spawnSync(gradlew, ["assembleRelease"], {
  cwd: androidDir,
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 1);
