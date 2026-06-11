# התראות Push לצ'אט (Android)

התראות על הודעות וואטסאפ נכנסות נשלחות דרך **Expo Push** לכל המכשירים הרשומים בטבלת `push_tokens` ב-Neon.

## דרישות

| רכיב | סטטוס |
|------|--------|
| שרver Render + `APP_API_KEY` | כבר עובד (`POST /devices/register` → 204) |
| `google-services.json` (Firebase FCM) | **אתה** מוריד מ-Firebase |
| `expo prebuild --clean` | מוסיף `POST_NOTIFICATIONS` + FCM ל-native |
| APK release חדש | **אתה** בונה מקומית (ראה למטה) |

## שלב 1 — Firebase (חד-פעמי)

1. [Firebase Console](https://console.firebase.google.com) → פרויקט חדש או קיים.
2. **Add app** → **Android**.
3. **Android package name:** `com.avihay.books` (חייב להתאים ל-`app.json`).
4. הורד **`google-services.json`**.
5. שמור ב:

   ```text
   mobile/google-services.json
   ```

   (לא ב-`android/` — `prebuild` מעתיק אוטומטית.)

6. **Cloud Messaging:** ב-Firebase → Project settings → Cloud Messaging — וודא ש-**Firebase Cloud Messaging API (V1)** פעיל (ברירת מחדל בפרויקטים חדשים).

> הקובץ **לא** נכנס ל-Git (`.gitignore`). שמור גיבוי אצלך.

## שלב 2 — משתני סביבה (mobile)

וודא ש-`mobile/.env.production` קיים (העתק מ-`.env.production.example`):

```env
EXPO_PUBLIC_APP_ENV=production
EXPO_PUBLIC_API_BASE_URL=https://avihay-books-api.onrender.com/api/v1
EXPO_PUBLIC_API_KEY=<אותו APP_API_KEY כמו ב-Render>
```

## שלב 3 — Prebuild (מחדש)

מהשורש של ה-repo:

```bat
scripts\setup-android-local.bat
```

או ידנית:

```bat
cd mobile
node scripts\check-google-services.cjs
set EXPO_NO_METRO_WORKSPACE_ROOT=1
npx expo prebuild --platform android --clean
node scripts\write-local-properties.cjs
```

**אימות:** ב-`mobile/android/app/src/main/AndroidManifest.xml` חייב להופיע:

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
```

וב-`mobile/android/app/` קיים `google-services.json`.

## שלב 4 — בניית APK מקומית (אתה)

```bat
cd C:\dev\avihay-books-V2
build-release.bat
```

או:

```bat
npm run mobile:apk:release
```

פלט:

```text
mobile\android\app\build\outputs\apk\release\app-release.apk
```

התקנה:

```bat
adb install -r mobile\android\app\build\outputs\apk\release\app-release.apk
```

מומלץ: **מחק** את האפליקציה הישנה לפני התקנה (איפוס הרשאות התראות).

## שלב 5 — בדיקה

1. פתח את האפליקציה → אשר **התראות** (דיאלוג או בהגדרות המכשיר).
2. ב-Neon:

   ```sql
   SELECT expo_token, platform, last_seen_at FROM push_tokens ORDER BY last_seen_at DESC;
   ```

   שורה חדשה: `ExponentPushToken[...]` (לא `[test]`).

3. שלח הודעת וואטסאפ לבוט — אמורה להגיע התראה Push.

## אבחון

| תסמין | פתרון |
|--------|--------|
| אין דיאלוג התראות | הגדרות → אפליקציות → נועם הספר → התראות → הפעל |
| `push_tokens` ריק | `adb logcat` — חפש `[push-register]` |
| 401 ברישום | `EXPO_PUBLIC_API_KEY` ≠ `APP_API_KEY` ב-Render |
| Expo Go | Push לא נתמך — רק APK / dev client |

## EAS (חלופה לבנייה מקומית)

```bash
cd mobile
npm run eas:build:android:production
```

EAS יכול לנהל FCM credentials; העלה `google-services.json` ב-`eas credentials`.
