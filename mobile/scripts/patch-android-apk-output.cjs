/**
 * Use android/app/build-alt for Gradle outputs so a locked stale APK under
 * build/outputs/apk/release does not break packageRelease on Windows.
 */
const fs = require("fs");
const path = require("path");

const markerBegin = "// === avihay-apk-output BEGIN ===";
const markerEnd = "// === avihay-apk-output END ===";

const block = `
${markerBegin}
project.layout.buildDirectory.set(project.layout.projectDirectory.dir("build-alt"))
${markerEnd}
`;

const buildGradle = path.join(__dirname, "..", "android", "app", "build.gradle");
if (!fs.existsSync(buildGradle)) {
  console.error("[apk-output] Missing android/app/build.gradle — run scripts/setup-android-local.bat first.");
  process.exit(1);
}

let src = fs.readFileSync(buildGradle, "utf8");
if (src.includes(markerBegin)) {
  const start = src.indexOf(markerBegin);
  const end = src.indexOf(markerEnd);
  if (end > start) {
    src = src.slice(0, start) + block.trim() + "\n" + src.slice(end + markerEnd.length);
  }
} else {
  const anchor = 'apply plugin: "com.android.application"';
  if (!src.includes(anchor)) {
    console.error("[apk-output] Could not find android.application anchor in build.gradle");
    process.exit(1);
  }
  src = src.replace(anchor, anchor + "\n" + block.trim());
}

fs.writeFileSync(buildGradle, src, "utf8");
console.log("[apk-output] Gradle outputs: mobile/android/app/build-alt/");
