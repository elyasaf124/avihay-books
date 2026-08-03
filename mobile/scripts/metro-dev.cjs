/**
 * Metro only — dev client + localhost + adb reverse (app already installed on device/emulator).
 */
const path = require("path");
const { spawnSync } = require("child_process");

const mobileRoot = path.join(__dirname, "..");

function ensureAdbReady() {
  const result = spawnSync("adb", ["devices"], { encoding: "utf8", shell: true });
  const ready = (result.stdout || "").split("\n").some((line) => /\tdevice\s*$/.test(line.trim()));
  if (!ready) {
    console.error("\nNo Android device/emulator ready (`adb devices` must show `device`).\n");
    process.exit(1);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    cwd: mobileRoot,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

ensureAdbReady();
run("adb", ["reverse", "tcp:8081", "tcp:8081"]);
run("npx", ["expo", "start", "--dev-client", "--localhost", "--android"]);
