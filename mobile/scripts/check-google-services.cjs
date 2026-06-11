/**
 * בודק שקיים `google-services.json` לפני prebuild/APK עם Push (FCM).
 * שימוש: node scripts/check-google-services.cjs [--strict]
 *   --strict  → exit 1 אם חסר (לבניית release)
 */
const fs = require("fs");
const path = require("path");

const mobileRoot = path.join(__dirname, "..");
const target = path.join(mobileRoot, "google-services.json");
const example = path.join(mobileRoot, "google-services.json.example");
const strict = process.argv.includes("--strict");

if (fs.existsSync(target)) {
  console.log("[push] google-services.json found — OK for FCM.");
  process.exit(0);
}

console.error("");
console.error("========================================");
console.error("  חסר: mobile/google-services.json");
console.error("========================================");
console.error("");
console.error("Push (התראות צ'אט) לא יעבוד ב-Android בלי קובץ Firebase.");
console.error("");
console.error("מה לעשות:");
console.error("  1. Firebase Console → Add Android app");
console.error("     Package: com.avihay.books");
console.error("  2. הורד google-services.json");
console.error("  3. שמור ב: mobile/google-services.json");
console.error("");
console.error("מדריך מלא: docs/PUSH_NOTIFICATIONS.md");
if (fs.existsSync(example)) {
  console.error(`דוגמת מבנה: ${path.relative(process.cwd(), example)}`);
}
console.error("");

process.exit(strict ? 1 : 0);
