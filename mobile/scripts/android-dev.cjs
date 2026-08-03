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

function adbArgs(...args) {
  const serial = process.env.ANDROID_SERIAL?.trim();
  return serial ? ["-s", serial, ...args] : args;
}

function isAppInstalled(packageName) {
  const result = spawnSync("adb", adbArgs("shell", "pm", "path", packageName), {
    encoding: "utf8",
    shell: true,
  });
  return (result.stdout || "").trim().startsWith("package:");
}

function listReadyDevices() {
  const result = spawnSync("adb", ["devices"], { encoding: "utf8", shell: true });
  return (result.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /\tdevice\s*$/.test(line))
    .map((line) => line.split("\t")[0]);
}

function ensureAdbReady() {
  const devices = listReadyDevices();
  if (devices.length === 0) {
    console.error("\nNo Android device/emulator ready (`adb devices` must show `device`, not offline).\n");
    process.exit(1);
  }
  if (devices.length > 1 && !process.env.ANDROID_SERIAL) {
    console.error(
      "\nMultiple Android devices/emulators connected — set ANDROID_SERIAL to the target device id.\n" +
        `Ready devices: ${devices.join(", ")}\n`,
    );
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

/** Compile the Android bundle before opening the dev client (avoids DevLauncher timeout on cold start). */
function warmMetroAndroidBundle(timeoutMs = 300_000) {
  return new Promise((resolve, reject) => {
    const bundlePath =
      "/node_modules/expo-router/entry.bundle?platform=android&dev=true&minify=false";
    const req = http.get(`http://127.0.0.1:8081${bundlePath}`, (res) => {
      res.resume();
      if (res.statusCode === 200) resolve();
      else reject(new Error(`Metro Android bundle warm-up failed: HTTP ${res.statusCode}`));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error("Metro Android bundle warm-up timed out"));
    });
  });
}

function openOnAndroid(packageName) {
  run("adb", adbArgs("shell", "am", "force-stop", packageName));
  const url =
    "exp+avihay-books://expo-development-client/?url=" +
    encodeURIComponent("http://127.0.0.1:8081");
  run("adb", adbArgs(
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    url,
    `${packageName}/.MainActivity`,
  ));
}

function ensureAppInstalled(packageName) {
  if (isAppInstalled(packageName)) return;
  console.log(`\n${packageName} is not installed on the device — building debug APK…\n`);
  run("npx", ["expo", "run:android", "--no-bundler"]);
}

function probeMetroRunning() {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:8081/status", (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2_000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function startMetro() {
  const metroArgs = ["expo", "start", "--dev-client", "--localhost", "--port", "8081"];
  if (wantsFreshCache) metroArgs.push("--clear");
  const metro = spawn("npx", metroArgs, {
    cwd: mobileRoot,
    shell: true,
    stdio: "inherit",
    env: process.env,
  });
  metro.on("exit", (code) => process.exit(code ?? 1));
  return metro;
}

ensureAdbReady();
run("adb", adbArgs("reverse", "tcp:8081", "tcp:8081"));
run("adb", adbArgs("reverse", "tcp:4000", "tcp:4000"));

if (wantsNativeBuild) {
  console.log("\nBuilding/installing debug APK (no LAN Metro)…\n");
  run("npx", ["expo", "run:android", "--no-bundler"]);
}

void (async () => {
  let metro = null;
  try {
    const metroAlreadyRunning = await probeMetroRunning();
    if (metroAlreadyRunning) {
      console.log("\nReusing Metro on localhost:8081…\n");
    } else {
      console.log("\nStarting Metro on localhost (emulator via adb reverse)…\n");
      metro = startMetro();
      await waitForMetroReady();
    }
    console.log("\nWarming Metro Android bundle (first compile can take ~30s)…\n");
    await warmMetroAndroidBundle();
    const packageName = getAndroidPackage();
    ensureAppInstalled(packageName);
    console.log("\nMetro ready — opening app on Android…\n");
    openOnAndroid(packageName);
  } catch (error) {
    console.error(String(error));
    metro?.kill();
    process.exit(1);
  }
})();
