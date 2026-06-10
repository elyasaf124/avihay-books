/**
 * Android emulator/device dev workflow.
 *
 * Default: Metro on `--localhost` + `adb reverse` + open app (fast daily use).
 * `--build`: native Gradle build/install first (after adding native modules / prebuild).
 *
 * LAN IP (`10.0.0.x`) in deep links breaks the emulator; `--localhost` + reverse fixes it.
 */
const path = require("path");
const { spawnSync } = require("child_process");

const mobileRoot = path.join(__dirname, "..");
const wantsNativeBuild = process.argv.includes("--build");

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

ensureAdbReady();
run("adb", ["reverse", "tcp:8081", "tcp:8081"]);

if (wantsNativeBuild) {
  console.log("\nBuilding/installing debug APK (no LAN Metro)…\n");
  run("npx", ["expo", "run:android", "--no-bundler"]);
}

console.log("\nStarting Metro on localhost (emulator via adb reverse)…\n");
run("npx", [
  "expo",
  "start",
  "--dev-client",
  "--localhost",
  "--android",
  "--clear",
]);
