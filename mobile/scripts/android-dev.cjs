/**
 * Android emulator/device dev workflow.
 *
 * Default: Metro on `--localhost` + `adb reverse` + open app (fast daily use).
 * `--build`: native Gradle build/install first (after adding native modules / prebuild).
 * `--fresh`: clear Metro cache (slow; use after dependency upgrades).
 *
 * LAN IP (`10.0.0.x`) in deep links breaks the emulator; `--localhost` + reverse fixes it.
 */
const path = require("path");
const http = require("http");
const { spawnSync, spawn } = require("child_process");

const mobileRoot = path.join(__dirname, "..");
const wantsNativeBuild = process.argv.includes("--build");
const wantsFreshCache = process.argv.includes("--fresh");

function getAndroidPackage() {
  const { getConfig } = require("@expo/config");
  const { exp } = getConfig(mobileRoot, { skipSDKVersionRequirement: true });
  const pkg = exp.android?.package;
  if (!pkg) {
    console.error("\nCould not resolve android.package from Expo config (mobile/app.config.js).\n");
    process.exit(1);
  }
  return pkg;
}

function isAppInstalled(packageName) {
  const result = spawnSync("adb", ["shell", "pm", "path", packageName], {
    encoding: "utf8",
    shell: true,
  });
  return (result.stdout || "").trim().startsWith("package:");
}

function ensureAdbReady() {
  const result = spawnSync("adb", ["devices"], { encoding: "utf8", shell: true });
  const ready = (result.stdout || "").split("\n").some((line) => /\tdevice\s*$/.test(line.trim()));
  if (!ready) {
    console.error("\nNo Android device/emulator ready (`adb devices` must show `device`, not offline).\n");
    process.exit(1);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    cwd: mobileRoot,
    ...options,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function waitForMetroReady(timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      const req = http.get("http://127.0.0.1:8081/status", (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else schedule();
      });
      req.on("error", schedule);
      req.setTimeout(2_000, () => {
        req.destroy();
        schedule();
      });
    };
    const schedule = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Metro did not become ready in time"));
        return;
      }
      setTimeout(poll, 500);
    };
    poll();
  });
}

function openOnAndroid(packageName) {
  const url =
    "exp+avihay-books://expo-development-client/?url=" +
    encodeURIComponent("http://127.0.0.1:8081");
  run("adb", [
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    url,
    `${packageName}/.MainActivity`,
  ]);
}

function ensureAppInstalled(packageName) {
  if (isAppInstalled(packageName)) return;
  console.log(`\n${packageName} is not installed on the device — building debug APK…\n`);
  run("npx", ["expo", "run:android", "--no-bundler"]);
}

ensureAdbReady();
run("adb", ["reverse", "tcp:8081", "tcp:8081"]);

if (wantsNativeBuild) {
  console.log("\nBuilding/installing debug APK (no LAN Metro)…\n");
  run("npx", ["expo", "run:android", "--no-bundler"]);
}

console.log("\nStarting Metro on localhost (emulator via adb reverse)…\n");

const metroArgs = ["expo", "start", "--dev-client", "--localhost"];
if (wantsFreshCache) metroArgs.push("--clear");

const metro = spawn("npx", metroArgs, {
  cwd: mobileRoot,
  shell: true,
  stdio: "inherit",
  env: process.env,
});

metro.on("exit", (code) => process.exit(code ?? 1));

void (async () => {
  try {
    await waitForMetroReady();
    const packageName = getAndroidPackage();
    ensureAppInstalled(packageName);
    console.log("\nMetro ready — opening app on Android…\n");
    openOnAndroid(packageName);
  } catch (error) {
    console.error(String(error));
    metro.kill();
    process.exit(1);
  }
})();
