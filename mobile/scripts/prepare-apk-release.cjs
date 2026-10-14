/**
 * Pre-release cleanup: stop Gradle, free Metro ports, patch Gradle to use build-alt/.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const mobileRoot = path.join(__dirname, "..");
const androidDir = path.join(mobileRoot, "android");
const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";

function killPort(port) {
  if (process.platform !== "win32") return;
  spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
    ],
    { stdio: "ignore" },
  );
}

if (fs.existsSync(path.join(androidDir, gradlew))) {
  spawnSync(gradlew, ["--stop"], {
    cwd: androidDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

killPort(8081);
killPort(8082);

const patch = spawnSync("node", ["scripts/patch-android-apk-output.cjs"], {
  cwd: mobileRoot,
  stdio: "inherit",
});
if (patch.status !== 0) process.exit(patch.status ?? 1);
