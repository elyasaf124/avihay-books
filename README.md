# `avihay-books-V2`

ניהול מלאי לחנות ספרים פיזית — עברית RTL, אפליקציית `Expo React Native` + `Express` + `PostgreSQL`.

## מבנה ה־monorepo

```
backend/           Express + TypeScript API
database/          SQL migrations + migration runner
seed/              Mock data seeders (Phase 1 mock data; Phase 5b → Excel)
shared/            Types & enums shared between backend and mobile
mobile/            Expo React Native app (Expo Router, RTL, Stitch theme)
docs/              DESIGN.md · DEPLOYMENT.md · תוכנית עבודה
Dockerfile          אימג׳ פרודקשן לבקאנד
docker-compose.yml  `PostgreSQL` + `api` מהירים לשרת/`VPS`
render.yaml          `Blueprint` ל־`Render` (`Web` + מנה `Docker`)
```

## דרישות מקדימות

- `Node.js 20+`
- `PostgreSQL 14+` עם מסד בשם `book-store` (קיים ב־`pgAdmin` המקומי)
- `Expo CLI` יותקן אוטומטית דרך `npx`

## התקנה והרצה ראשונית

```bash
# 1. תלויות
npm install

# 2. הגדרת חיבור למסד: העתק מ־`.env.example` את בלוק "Backend פיתוח" ל־`backend/.env` (או `backend/.env.development`)

# 3. מיגרציות + נתוני seed
npm run db:migrate
npm run db:seed

# 4. הפעלת ה־backend (פורט 4000)
npm run backend:dev

# 5. הפעלת ה־mobile (אופציונלי: בלוק "Mobile פיתוח" מ־`.env.example` → `mobile/.env`)
npm run mobile:dev
```

לאיפוס מלא של ה־DB ולהרצה מחדש: `npm run db:reset`.

## מצבי `development` ו־`production`

### `backend` (`Node`)

- הסקריפטים `dev` / `start` קובעים `NODE_ENV` בעזרת `cross-env` (`development` / `production`).
- קבצי סביבה נטענים בסדר (כל קובץ קיים בתיקיית `backend/` דורס קודם):  
  `.env` → `.env.<NODE_ENV>` → `.env.local` → `.env.<NODE_ENV>.local`  
  (ראה [`backend/.env.example`](backend/.env.example), [`backend/.env.development.example`](backend/.env.development.example), [`backend/.env.production.example`](backend/.env.production.example)).
- טעינת הסביבה ממומשת ב־[`backend/src/config/loadEnv.ts`](backend/src/config/loadEnv.ts); מיגרציות גם טוענים אותו דרך יבוא ראשון ב־`database/runMigrations.ts`.

### `mobile` (`Expo`)

- משתנה `EXPO_PUBLIC_APP_ENV`: `development` (ברירת מחדל ב־`expo start`), `preview` או `production` (בניית `EAS`).
- הערך נשמר ב־`extra.appEnv` דרך [`mobile/app.config.js`](mobile/app.config.js) ונקבע ב־[`mobile/eas.json`](mobile/eas.json) לפרופילי `preview`/`production`.
- דוגמאות: [`mobile/.env.development.example`](mobile/.env.development.example), [`mobile/.env.production.example`](mobile/.env.production.example).

## פריסת `PostgreSQL` ו־`backend` לשרת

ראה את [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md): `Docker Compose`, מאגר מנוהל, והתאמת מפתח סביב `APP_API_KEY` / `EXPO_PUBLIC_API_KEY`.

להרצה מקומית: מהשורש `npm run generate-api-key` — העתק ל־`backend/.env` (`APP_API_KEY`) ול־`mobile/.env` (`EXPO_PUBLIC_API_KEY`).

מהיר מול שירותי ענן חינמיים: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — סעיף **6**, `Neon` + `Render` + `eas build`, או מדריך Render מפורט: [`docs/RENDER.md`](docs/RENDER.md).

```bash
docker compose up --build
```

לערכים כמו `APP_API_KEY`: צור קובץ `deploy.env` (למשל `cp deploy.env.example deploy.env`), ערוך, והרץ `docker compose --env-file deploy.env up --build`.

לבדיקת אפליקציה על הטלפון מול השרת: [`mobile/.env.production.example`](mobile/.env.production.example); מדריך מלא ל־`HTTPS`: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

מהשורש גם זמין: `npm run compose:up` / `npm run compose:down`.

## הרצה על טלפון פיזי והתקנת `APK`

1. התקן את **`Expo Go`** בחנות האפליקציות.
2. צור `mobile/.env` על בסיס `mobile/.env.example` והגדר `EXPO_PUBLIC_API_BASE_URL` ל־`http://<IPv4_של_המחשב>:4000/api/v1` (אותה רשת Wi‑Fi כמו הטלפון; `ipconfig` ב־Windows).
3. הרץ `npm run backend:dev` ואז `npm run mobile:dev`. סרוק את קוד ה־`QR` עם `Expo Go` (אנדרואיד) או עקוב אחרי הוראות `Expo` לאייפון.
4. אם ה־`QR` או ה־`LAN` נחסמים, אפשר `npx expo start --tunnel` מתוך `mobile/` (נדרש חשבון `Expo`); עדיין חייבת להיות גישה מהטלפון ל־`API` בכתובת ה־`IP` (לא `localhost`).

הקובץ `mobile/app.config.js` טוען אוטומטית את `mobile/.env` לפי מיקום הפרויקט, גם כשמריצים מהשורש עם `npm run mobile:dev`.

### מסלול ב׳ — אפליקציה עצמאית (`EAS Build`)

1. חשבון ב־[expo.dev](https://expo.dev/) והתקנת `eas-cli` (`npm i -g eas-cli` או `npx eas-cli`).
2. בתיקיית `mobile`: `eas login`, ואז `eas init` (אם עדיין לא קושרים פרויקט) כדי לקבל `projectId` לשדה `EXPO_PUBLIC_EAS_PROJECT_ID` אם רוצים עדכוני `OTA`.
3. ערוך את בלוק `env` ב־`mobile/eas.json` (או הגדר את אותם משתני `EXPO_PUBLIC_*` תחת Environment variables בפרויקט ב־`expo.dev`) כך ש־`EXPO_PUBLIC_API_BASE_URL` יצביע ל־`API` פרוס ונגיש מהטלפון.
4. בניית `APK` אנדרואיד: `npm run eas:build:android:preview --workspace=@avihay-books/mobile` (או `production`). לאחר הבנייה הורד את ה־`APK` מהדשבורד של `Expo` והתקן על המכשיר.
5. **אייפון:** `npm run eas:build:ios:preview --workspace=@avihay-books/mobile` — נדרש חשבון `Apple Developer` והפצה פנימית או `TestFlight` לפי הגדרות `Apple`.

## בדיקות ידניות מהירות

```bash
curl http://localhost:4000/api/v1/health
curl http://localhost:4000/api/v1/store-map | head
curl http://localhost:4000/api/v1/suppliers
```

## הערות

- `Stitch` design — נמשך מהפרויקט `Virtual Bookshelf Simulator` (ראה `docs/DESIGN.md`).
- מפת חנות בצורת ח: `mobile/src/components/StoreMap.tsx`.
- RTL נכפה ב־`mobile/app/_layout.tsx` (`I18nManager.forceRTL(true)`).
- כל כתיבה ל־DB עוברת רק דרך `backend/src/repos/*.ts` (ה־seed וגם ה־Excel importer של פאזה 5b).
"# avihay-books" 
