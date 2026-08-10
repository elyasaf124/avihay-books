---
name: dev-run
description: >-
  Runs avihay-books in local development mode (backend + Expo Metro + Android emulator and/or web).
  Use when the user asks to run/start the app in development mode, dev mode, locally, on the emulator,
  in the browser, or in Hebrew: הרץ במצב פיתוח, הרצה בפיתוח, תריץ בפיתוח, הפעל בפיתוח, על האמולטור,
  בדפדפן, או עקוב אחרי הסקיל / לפי הסקיל for dev startup.
---

# הרצה במצב פיתוח — avihay-books

**קרא סקיל זה מיד** כשהמשתמש מבקש להריץ את האפליקציה בפיתוח. אל תנחש — עקוב לפי ה-workflow.

## מה רץ בפיתוח

| רכיב | פקודה / כתובת | env |
|------|----------------|-----|
| Backend API | `npm run backend:dev` → `http://localhost:4000/api/v1` | `backend` — `NODE_ENV=development` |
| Metro | `mobile/` — פורט `8081` | `mobile/.env.development` (נטען אוטומטית) |
| Android | dev client `com.avihay.books` + `adb reverse` | אותו `.env.development` |
| Web | `http://localhost:8081` | אותו `.env.development` |

## בחר workflow לפי בקשת המשתמש

| בקשה | Workflow |
|------|----------|
| "בפיתוח" / "dev" ללא פירוט | **Full** — backend + Metro (web+android) + אמולטור + דפדפן |
| רק אמולטור / Android | **Android** |
| רד web / דפדפן | **Web** |
| רק API / backend | **Backend** בלבד |

ברירת מחדל: **Full** (כמו "תריץ במצב פיתוח על האמולטור ובדפדפן").

---

## שלב 0 — בדיקות לפני הרצה

```powershell
# Backend
try { (Invoke-WebRequest -Uri http://127.0.0.1:4000/api/v1/health -UseBasicParsing -TimeoutSec 3).StatusCode } catch { "down" }

# Metro
try { (Invoke-WebRequest -Uri http://127.0.0.1:8081/status -UseBasicParsing -TimeoutSec 5).StatusCode } catch { "down" }

# Android
adb devices -l
```

- **Windows / PowerShell** — אל תשתמש ב-`||`; השתמש ב-`try/catch`.
- אם יש **יותר מאמולטור/מכשיר אחד** — הגדר `$env:ANDROID_SERIAL="<serial>"` לפני פקודות `adb` / `android:dev`.
- אמולטור פיתוח נפוץ: `Pixel_10_Pro_-_dev` (`adb -s <serial> emu avd name`).

---

## Workflow A — Full (Android + Web + Backend)

### A1. Backend (אם down)

```powershell
# repo root, background
npm run backend:dev
```

### A2. Metro — **instance יחיד** עם web + dev-client

**אל תריץ `android:dev` אם Metro כבר על 8081** — ב-non-interactive הוא נכשל (שאלת port 8082).

אם Metro **לא** רץ — מהתיקייה `mobile/` (background):

```powershell
adb reverse tcp:8081 tcp:8081
adb reverse tcp:4000 tcp:4000
npx expo start --dev-client --localhost --web --port 8081
```

(עם `$env:ANDROID_SERIAL` + `adb -s <serial> reverse ...` אם יש serial ספציפי.)

### A3. המתן ל-Metro

- קompile ראשון: **2–5 דקות** — זה תקין.
- עקוב אחרי לוג Metro: `Web Bundled` / `Android Bundled`.
- **אל** תבטל בגלל timeout של `curl` ב-10s — `/status` עלול להיות איטי בזמן bundle.

### A4. פתיחת Web

```powershell
Start-Process "http://localhost:8081"
```

(או `--web` כבר פתח — אם לא, פתח ידנית.)

### A5. פתיחת Android (אם Metro כבר רץ — **adb בלבד**)

```powershell
adb shell am force-stop com.avihay.books
adb shell am start -a android.intent.action.VIEW `
  -d "exp+avihay-books://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081" `
  com.avihay.books/.MainActivity
```

(הוסף `-s <serial>` אם נדרש.)

אם `com.avihay.books` לא מותקן:

```powershell
npm run mobile:android:dev:build
```

---

## Workflow B — Android בלבד

כש-Metro **לא** רץ — השתמש בסקריפט הפרויקט (repo root):

```powershell
$env:ANDROID_SERIAL="emulator-5554"   # אם נדרש
npm run mobile:android:dev
```

סקריפט: `mobile/scripts/android-dev.cjs` — `adb reverse`, Metro `--localhost`, חימום bundle, פתיחת dev client.

דגלים:

| דגל | מתי |
|-----|-----|
| `--build` | `npm run mobile:android:dev:build` — אחרי native modules / prebuild |
| `--fresh` | cache Metro נקי — אחרי שדרוג dependencies |

אם Metro **כבר** רץ על 8081 → עבור ל-**A5** (adb בלבד), לא `android:dev`.

---

## Workflow C — Web בלבד

1. Backend — A1 אם down.
2. אם Metro לא רץ — מ-`mobile/`:

```powershell
npx expo start --web --port 8081
```

3. אם Metro כבר רץ (ללא `--web`) — `Start-Process "http://localhost:8081"`.

---

## Workflow D — Backend בלבד

```powershell
npm run backend:dev
```

---

## Pitfalls (חובה)

1. **Port 8081 תפוס** — לא להריץ שני Metro; reuse + adb ל-Android.
2. **`android:dev` + Metro קיים** → שגיאת "Use port 8082?" — השתמש ב-A5.
3. **אמולטור** — חייב `adb reverse` ל-8081 ו-4000; deep link חייב `127.0.0.1`, לא IP LAN.
4. **`.env.development`** — `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4000/api/v1` (מתאים לאמולטור עם reverse).
5. **הרצה ברקע** — `backend:dev` ו-Metro ברקע; דווח למשתמש URLs וסטטוס bundle.

---

## דיווח למשתמש (בסיום)

ציין בקצרה:

- Backend: `http://localhost:4000/api/v1`
- Metro / Web: `http://localhost:8081`
- Android: serial + שם AVD, האם האפליקציה נפתחה
- אם bundle ראשון — צפוי עיכוב של כמה דקות

---

## סיום משימה

אם קיים `docs/notify_me.py` — הרץ בסיום.
