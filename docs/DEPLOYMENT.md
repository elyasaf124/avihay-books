# פריסת `DB` + `backend` והתאמה למובייל

מסמך זה משלים את [`README.md`](../README.md). הוא מתאר פריסת `PostgreSQL` ו־`Express` לשרת, ויצירת בקשות מהאפליקציה עם `HTTPS`.

## 1. `PostgreSQL`

### בסיוע שירות מנוהל (`Neon`, `Supabase`, `AWS RDS`, …)

צור משתמש, סיסמה, ושם בסיס נתונים (למשל `book-store`). הרכב `DATABASE_URL` בצורת:

```text
postgres://USER:PASSWORD@HOST:5432/book-store
```

הגדר בחומת האש שרק כתובת ה־`IP` של שרת ה־`API` מורשית להתחבר למסד (לא להשאיר `Postgres` פתוח לאינטרנט).

### עם `Docker Compose` במחשב/שרת משלך

בשורש הפרויקט:

```bash
docker compose up --build db
```

או הפעלה מלאה של `db` + `api` (ראה סעיף 2).

## 2. `backend` בתוך `Docker`

קבצים: [`Dockerfile`](../Dockerfile), [`docker-compose.yml`](../docker-compose.yml), [`docker/entrypoint.sh`](../docker/entrypoint.sh).

שרות `api`:

- רץ מיגרציות (`npm run db:migrate`) בכל הפעלה.
- אופציונלית הרצת seed אם משתנה הסביבה `RUN_SEED_ON_START=true`.
- מתחיל את ה־`API` עם `npm run start --workspace=@avihay-books/backend`.

דוגמה:

```bash
cp deploy.env.example deploy.env
# ערוך deploy.env — הגדר APP_API_KEY אם צריך
docker compose --env-file deploy.env up --build
```

או מהשורש (ללא קובץ secrets): `npm run compose:up`.

בדיקה: `curl http://localhost:4000/api/v1/health`.

## 3. `HTTPS` בפרודקשן

כל שרת `reverse proxy` (`Caddy`, `nginx`, מאזן עומס בענן) שמקבל תעודות `TLS` ומפנה ל־פורט `4000` (או הפורט שבחרת ל־`Express`) מתאים. ודא שכותרות וגוף הבקשה מועברים ל־`Node` והנתיב החיצוני נשמר (למשל `https://api.example.com/api/v1`).

משתנה `CORS_ORIGIN`:

- פרודקשן מדויק: רשימה מופרדת בפסיקים של דומיינים מורשים.
- פריסה מהירה: `*` (מתאים לרוב בתרחיש עם `HTTPS` ציבורי ואימות עם `APP_API_KEY`).

## 4. הגדרות סביבה (`backend`)

השתמש ב־[`backend/.env.example`](../backend/.env.example) בתור רשימת שדות. בפריסה ללא `Docker`, קובץ `backend/.env` על השרט עם ערכים מלאים והרצת:

```bash
npm ci
npm run shared:build
npm run db:migrate
npm run db:seed
npm run backend:build
npm run start --workspace=@avihay-books/backend
```

## 5. אפליקציה על הטלפון מול השרת

לאחר שה־`API` זמין בכתובת ציבורית (למשל `https://api.example.com/api/v1`):

1. הגדר **`EXPO_PUBLIC_API_BASE_URL`** לאותה כתובת (קבצי סביבה או פרופיל ב־`EAS`; ראו [`mobile/.env.example`](../mobile/.env.example)).
2. אם בשימוש `APP_API_KEY` בשרת, הגדר **`EXPO_PUBLIC_API_KEY`** עם אותו ערך (כותרת `x-api-key` נקבעת ב־[`mobile/src/api/client.ts`](../mobile/src/api/client.ts)).

מהיר: `Expo Go` עם `mobile/.env`. התקנה עצמאית: `eas build` (ראה `README.md`).

## 6. סט חינמי מומלץ: `Neon` + `Render` + `APK` ב־`EAS`

מדריך צעד־אחר־צעד ל־`Render` בלבד: [`RENDER.md`](RENDER.md).

### `PostgreSQL` חינמי — `Neon`

1. צור חשבון ב־[Neon](https://neon.tech) ופרויקט `Postgres` חדש.
2. צור מסד (למשל `book-store`) והעתק את מחרוזת החיבור (`DATABASE_URL`). אם Neon מוסיף `?sslmode=require` — אפשר להשאיר; האפליקציה מסירה את הפרמטר ומגדירה `TLS` לפי ה־host / `DATABASE_SSL`.
3. ב־`Neon` אפשר לאפשר גישה מכל IP או רשימת `IP` של `Render` (למסלול מחמיר יותר). לבדיקות ראשוניות הספקים נותנים חיבור מאובטח דרך `TLS` בלבד.

### `API` חינמי — `Render`

בשורש הריפו קיים [`render.yaml`](../render.yaml) שמגדיר שירות `Web` מסוג `Docker` (אותו [`Dockerfile`](../Dockerfile) כמו בפיתוח).

1. דחוף את הריפו ל־`GitHub` (או `GitLab`/`Bitbucket` ש־`Render` תומכים בהם).
2. ב־[Render Dashboard](https://dashboard.render.com) בחר **New → Blueprint** וחבר את הריפו; אשר יצירת השירות `avihay-books-api` מהקובץ `render.yaml`.
3. בלשונית **Environment** של השירות, הגדר בסידור הבא:

   | מפתח | ערך |
   | ----- | ----- |
   | `DATABASE_URL` | המחרוזת מ־`Neon` |
   | `APP_API_KEY` | מחרוזת סודית (אימות מאפליקציה דרך `x-api-key`) |
   | `RUN_SEED_ON_START` | לפריסה ראשונה בלבד הגדר ל־`true` לאחר ההקמה (מפעיל `npm run db:seed` בעלייה), אחר הצלחה החזר ל־`false` ופרוס מחדש |

4. חכה שהבנייה וההפעלה יושלמו. כתובת ציבורית תיראה כמו `https://avihay-books-api.onrender.com`.
5. בדוק:  
   `curl https://<שירות>.onrender.com/api/v1/health`  
   אם הוגדר `APP_API_KEY`, הוסף כותרת:  
   `curl -H "x-api-key: YOUR_KEY" ...`

**הערות:** תוכנית `Free` ב־`Render` עלולה להיכנס למצב שינה לאחר דקות ללא טראפיק; תשובת ראשונה עשויה לאחר עשרות שניות. לניסוי אישי זה מקובל.

### התקנה בטלפון — קובץ `APK`

1. מתוך החשבון ב־[expo.dev](https://expo.dev), הגדר פרויקט והתקן `eas-cli`: `npm i -g eas-cli`.
2. בתיקיית [`mobile/`](../mobile/):  
   `eas login` ו־`eas init` כדי לשייך את האפליקציה לפרויקט ב־`Expo` (אופציונלי להפעלת `OTA`).

3. עדכן כתובת ה־`API` ובמידת הצורך מפתח (חייבים להתאים ל־`APP_API_KEY` בשרת), באחד מאלה:

   - קבצים `mobile/.env.development` / `mobile/.env.production` (ראה דוגמאות `.example`) — סקריפטי `npm run eas:build:*` בפרויקט טוענים את הקובץ המתאים לפני `eas build`, והערכים נכנסים ל־[`mobile/eas.json`](../mobile/eas.json) דרך `${EXPO_PUBLIC_*}`.
   - או משתני סביבה בפרויקט תחת `expo.dev` → **Environment variables** עם אותם שמות `EXPO_PUBLIC_*`.

4. בנה `APK` (אנדרואיד) — ענן (`EAS`) או מקומי: [`LOCAL_ANDROID_BUILD.md`](LOCAL_ANDROID_BUILD.md).

   ענן:
   ```bash
   npm run eas:build:android:development --workspace=@avihay-books/mobile
   npm run eas:build:android:production --workspace=@avihay-books/mobile
   ```
   מתוך `mobile/` ברירת הקודם — אחרי ההתקנה הורד מהדשבורד את קובץ ה־`.apk` והתקן על המכשיר (הגדר הרשאה להתקנת אפליקציות שלא מחנות `Play`).

לאייפון אין `APK`; משתמשים בפרופיל `--platform ios` דרך `EAS`, ב־`TestFlight`/הפצה פנימית.
