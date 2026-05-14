# מדריך העלאה ל־Render (`avihay-books`)

מדריך מפורט לפריסת ה־`API` (ה־`Express` של הפרויקט) ב־[Render](https://render.com) בעזרת [`render.yaml`](../render.yaml) ו־[`Dockerfile`](../Dockerfile).  
מסד הנתונים מניח **Neon** (או כל `PostgreSQL` מרוחק עם `DATABASE_URL` תקין).

---

## לפני שמתחילים

| דרישה | הערה |
|--------|------|
| חשבון ב־`Render` | [dashboard.render.com](https://dashboard.render.com) |
| הריפו ב־`GitHub` | `Render` מתחבר לריפו ומושך קוד אוטומטית |
| `DATABASE_URL` מ־Neon | כבר הופעל אצלך מקומית עם `db:migrate` / `db:seed` — **אותה מחרוזת** תועתק ל־`Render` |
| קובץ [`render.yaml`](../render.yaml) | בשורש הריפו — חייב לכלול `plan: free` לשירות חינמי (ברירת מחדל בלי זה: `starter` בתשלום) |

### למה Render ביקש כרטיס אשראי?

- אם ב־`render.yaml` **חסר** `plan: free`, שירות `Web` נוצר ברירת מחדל כ־**starter** (בתשלום) — ואז מופיע חלון אשראי.
- לפי מפרט Render, **`plan: free` לא זמין לריפו private** (רק ל־public), אלא אם עברת לתוכנית בתשלום — אם הריפו סגור, ייתכן שתצטרך לפתוח אותו ל־`Public` או להוסיף כרטיס.


## שלב 1 — דחיפת הקוד ל־`GitHub`

```bash
git add .
git commit -m "Prepare Render deployment"
git push origin main
```

(אם הענף שלך לא `main`, התאם את שם הענף ב־`Render` בהגדרות השירות.)

---

## שלב 2 — יצירת שירות דרך `Blueprint`

1. היכנס ל־[Render Dashboard](https://dashboard.render.com).
2. **New** → **Blueprint**.
3. חבר את חשבון ה־`GitHub` ובחר את הריפו `avihay-books-V2` (או השם שלך).
4. אשר ש־`Render` מזהה את [`render.yaml`](../render.yaml) — אמור להופיע שירות אחד בשם **`avihay-books-api`** (מנה `Docker`).
5. לחץ **Apply** / **Create resources**.

אם `Render` לא מציע `Blueprint`, אפשר במקום זאת: **New** → **Web Service** → אותו ריפו → **Environment: Docker** → `Dockerfile Path`: `./Dockerfile`, **Docker Build Context**: שורש הריפו.

---

## שלב 3 — משתני סביבה (חובה)

בשירות `avihay-books-api` → **Environment**:

| משתנה | ערך |
|--------|-----|
| `DATABASE_URL` | הדבק את **מחרוזת החיבור המלאה** מ־Neon (כמו ב־`backend/.env` המקומי). |
| `APP_API_KEY` | **נוצר אוטומטית** בפריסה מ־[`render.yaml`](../render.yaml) (`generateValue: true`). אחרי ה־Deploy: **Environment** → העתק את הערך של `APP_API_KEY` לאפליקציה — **`EXPO_PUBLIC_API_KEY` חייב להיות זהה** (כותרת `x-api-key`). |

### מפתח לפיתוח מקומי

למחשב שלך (לא Render), יצירת מפתח אקראי:

```bash
npm run generate-api-key
```

הדבק ב־`backend/.env` תחת `APP_API_KEY=` וב־`mobile/.env` תחת `EXPO_PUBLIC_API_KEY=` — **אותו ערך**.

משתנים אחרים כבר מוגדרים ב־[`render.yaml`](../render.yaml) (`NODE_ENV`, `CORS_ORIGIN`, `LOG_LEVEL`, `RUN_SEED_ON_START`).

---

## משתנים אחרים (מתוך ה־Blueprint בלבד)

אלו נטענים מהקובץ `render.yaml` ואינך חייב להזין אותם ידנית אלא אם עורך את הקובץ:

`NODE_ENV`, `CORS_ORIGIN`, `LOG_LEVEL`, `RUN_SEED_ON_START`.

---

## פריסה ראשונה עם נתוני דמו

אם המסד ב־Neon **ריק** ואתה רוצה `seed` אוטומטי בעליית הקונטיינר, הגדר זמנית:

`RUN_SEED_ON_START=true`

לאחר פריסה מוצלחת ואימות שהכל עובד — החזר ל־`false` ופרוס שוב (כדי לא להריץ seed בכל restart).

---

## שלב 4 — בנייה ופריסה

1. **Manual Deploy** או המתן ל־`auto-deploy` אחרי `push`.
2. בטאב **Logs** — ודא שאין שגיאת בניית `Docker` / `npm ci`.
3. בסיום, `Render` נותן **URL** ציבורי, למשל:  
   `https://avihay-books-api.onrender.com`

**תוכנית `Free`:** השירות עלול **להירדם** אחרי עצירה; הקריאה הראשונה אחרי שקט עלולה לקחת **עשרות שניות**.

---

## שלב 5 — בדיקה

`/api/v1/health` מוגדר **לפני** אימות המפתח — אפשר לבדוק חיבור גם בלי `x-api-key`. שאר הנתיבים דורשים את הכותרת כש־`APP_API_KEY` מוגדר בשרת.

בלי כותרת (מספיק לבדיקת זמינות):

```bash
curl https://<שם-השירות>.onrender.com/api/v1/health
```

עם `APP_API_KEY`:

```bash
curl -H "x-api-key: YOUR_SECRET" https://<שם-השירות>.onrender.com/api/v1/health
```

תשובת `200` וגוף תקין = ה־`API` ו־Neon מחוברים.

---

## שלב 6 — אפליקציית מובייל

ב־`mobile` הגדר (או ב־`eas.json` / משתני `expo.dev`):

```text
EXPO_PUBLIC_API_BASE_URL=https://<שם-השירות>.onrender.com/api/v1
EXPO_PUBLIC_API_KEY=<אותו ערך כמו APP_API_KEY אם הוגדר>
```

אל תשתמש בכתובת Neon — רק בכתובת **`https`** של שירות ה־`Render`.

---

## תקלות נפוצות

| תסמין | מה לבדוק |
|--------|-----------|
| בנייה נכשלת | לוגי **Build** — חסר `package-lock.json`? שגיאת `npm ci`? |
| `Application failed to respond` | השירות רדום (`Free`); המתן או שלח בקשה שוב. |
| שגיאת `DATABASE_URL` / חיבור | שהועתקה המחרוזת המלאה מ־Neon; ב־Neon מותר חיבור מהרשת הציבורית. |
| `401` מה־API | הוגדר `APP_API_KEY` בשרת אבל באפליקציה חסר `EXPO_PUBLIC_API_KEY` או לא תואם. |

---

## קישורים בפרויקט

- קובץ ה־Blueprint: [`render.yaml`](../render.yaml)  
- מסמך כללי (כולל `Neon` + `APK`): [`DEPLOYMENT.md`](DEPLOYMENT.md)
