/**
 * Writes android/local.properties with sdk.dir from ANDROID_HOME (or default Windows SDK path).
 * Run from mobile/: node scripts/write-local-properties.cjs
 */
const fs = require("fs");
const path = require("path");

const mobileRoot = path.join(__dirname, "..");
const androidDir = path.join(mobileRoot, "android");
const defaultSdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  "C:\\Users\\ELYAS\\AppData\\Local\\Android\\Sdk";

function toSdkDirProperty(sdkPath) {
  const normalized = path.resolve(sdkPath).replace(/\\/g, "/");
  return `sdk.dir=${normalized}\n`;
}

if (!fs.existsSync(androidDir)) {
  console.error(
    "android/ not found. Run expo prebuild first:\n  npm run prebuild:android --workspace=@avihay-books/mobile",
  );
  process.exit(1);
}

const outPath = path.join(androidDir, "local.properties");
fs.writeFileSync(outPath, toSdkDirProperty(defaultSdk), "utf8");
console.log(`Wrote ${outPath}`);
console.log(toSdkDirProperty(defaultSdk).trim());
