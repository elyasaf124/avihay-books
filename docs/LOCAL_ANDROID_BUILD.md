# בנייה מקומית של APK (Android)

מדריך לבניית `APK` release על Windows, עם משתני `production` (מול שרת פרוס), **בלי** מכסת `EAS` בענן.

למסלול ענן (`eas build`) ראה [`DEPLOYMENT.md`](DEPLOYMENT.md) ו-[`README.md`](../README.md) (מסלול ב׳).

## דרישות מקדימות

1. **Android Studio** — ב-SDK Manager:
   - Android SDK Platform (מומלץ API 35+)
   - Android SDK Build-Tools
   - Android SDK Command-line Tools
2. **JDK 17** (לרוב מגיע עם Android Studio; `Expo SDK 54`)
3. **משתני סביבה** (קבועים ב-Windows, לא רק ב-CMD):

```text
ANDROID_HOME=C:\Users\ELYAS\AppData\Local\Android\Sdk
PATH += %ANDROID_HOME%\platform-tools
```

4. אימות: `adb version`

## מיקום הפרויקט

העתק/שכפל את ה-repo לנתיב **קצר**:

```text
C:\dev\avihay-books-V2
```

אל תבנה מתוך `OneDrive` עם נתיב ארוך — גורם לשגיאות `CMake` / `react-native-reanimated`.

```bash
cd C:\dev\avihay-books-V2
npm install
```

צור `mobile/.env.production` מ-[`mobile/.env.production.example`](../mobile/.env.production.example):

- `EXPO_PUBLIC_APP_ENV=production`
- `EXPO_PUBLIC_API_BASE_URL` — כתובת ה-API בפרודקשן
- `EXPO_PUBLIC_API_KEY` — מפתח מתאים

## הכנה חד-פעמית (prebuild)

### אוטומטי (מומלץ)

מהשורש של ה-repo:

```bat
scripts\setup-android-local.bat
```

הסקריפט בודק `ANDROID_HOME` / `adb`, מריץ `expo prebuild`, ויוצר `mobile\android\local.properties`.

### ידני

מתוך `mobile/`:

```bat
set EXPO_NO_METRO_WORKSPACE_ROOT=1
npx expo-doctor
npx expo prebuild --platform android
node scripts\write-local-properties.cjs
```

אחרי שינוי `plugins` ב-`app.json` / `withForceRTL`:

```bat
npx expo prebuild --platform android --clean
```

> `mobile/android/` **לא** נכנס ל-Git (ראה `.gitignore`).

### `local.properties`

אם חסר, צור `mobile\android\local.properties`:

```properties
sdk.dir=C:/Users/ELYAS/AppData/Local/Android/Sdk
```

(סלאשים `/`. או הרץ `node scripts\write-local-properties.cjs` מתוך `mobile/`.)

## בניית APK release

### א. סקריפט מהשורש

```bat
build-release.bat
```

(מניח שהפרויקט ב-`C:\dev\avihay-books-V2`.)

### ב. npm

```bash
npm run mobile:apk:release
```

או מתוך `mobile/`:

```bash
npm run apk:release
```

### ג. Gradle ישיר (אחרי prebuild)

```bash
npm run apk:release:gradle --workspace=@avihay-books/mobile
```

## פלט

```text
mobile\android\app\build\outputs\apk\release\app-release.apk
```

התקנה על מכשיר:

```bat
adb install -r mobile\android\app\build\outputs\apk\release\app-release.apk
```

חתימה: ב-release מקומי Gradle לרוב משתמש ב-debug keystore — **מספיק להתקנה ידנית**, לא ל-Google Play בלי `keystore` ייעודי.

## Checklist לפני build

- [ ] פרויקט ב-`C:\dev\avihay-books-V2`
- [ ] `npm install` מהשורש
- [ ] `mobile/.env.production` מלא
- [ ] `npx expo-doctor` ב-`mobile/` — ללא אדום קריטי
- [ ] `mobile/android/` קיים
- [ ] `mobile/android/local.properties` עם `sdk.dir`
- [ ] `ANDROID_HOME` מוגדר
- [ ] `build-release.bat` או `npm run mobile:apk:release`

## שגיאות נפוצות

| שגיאה | פתרון |
|--------|--------|
| `SDK location not found` | `local.properties` + `ANDROID_HOME` |
| `SDK location not found` גם אחרי זה | וודא שהנתיב ב-`ANDROID_HOME` קיים |
| שגיאות `CMake` / path too long | העבר ל-`C:\dev\...` |
| `ReanimatedNativeHierarchyManagerBase` | מחק `node_modules`, `npm install` מחדש מהשורש |
| build נכשל אחרי העתקה | אל תעתיק `node_modules` — רק קוד + `npm install` |
| אין `android/` | `scripts\setup-android-local.bat` או `npm run prebuild:android --workspace=@avihay-books/mobile` |
| מכשיר לא מזוהה | `adb devices`, הפעל USB debugging |

## שלוש דרכי build (סיכום)

| דרך | פקודה | מתי |
|-----|--------|-----|
| Dev | `npx expo run:android` | פיתוח + אמולטור |
| Gradle | `gradlew assembleRelease` | APK אחרי prebuild |
| EAS ענן | `npm run eas:build:android:production --workspace=@avihay-books/mobile` | בלי Android SDK מקומי |
