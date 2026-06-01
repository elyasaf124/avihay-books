# בוט וואטסאפ — מה לעשות עכשיו (אחרי יישום הקוד)

מסמך זה מסכם את **השלבים החיצוניים** שנשארו אחרי שיושם הקוד של הבוט בפרויקט.
הקוד כבר קיים ב-repo; מה שנשאר הוא Meta, Render, Neon, env vars ובדיקות.

**מדריך טכני מלא:** [`WHATSAPP_BOT.md`](./WHATSAPP_BOT.md)

---

## סטטוס נוכחי (מה כבר בקוד)

- Webhook: `backend/src/routes/webhooks/whatsapp.ts`
- מנוע שיחה (8 ענפים): `backend/src/services/whatsapp/engine.ts`
- Graph API client: `backend/src/services/whatsapp/client.ts`
- מיגרציות DB: `023`–`027` (enums, sessions, messages, orders, fuzzy search)
- שליחת עדכון ללקוח: `POST /api/v1/orders/:id/notify-customer`
- כפתור "שלח עדכון" באפליקציית mobile
- משתני env: `backend/.env.example`

---

## סדר פעולות מומלץ

```
1. Push קוד → Deploy Render
2. db:migrate על Neon פרודקשן (023–027)
3. Render Starter $7 (always-on)
4. Meta App + Coexistence + Business Verification
5. Env vars ב-Render + Redeploy
6. Webhook + Verify ב-Meta
7. Templates מאושרות
8. BOT_* — תוכן וקישורים
9. בדיקות end-to-end
10. Build mobile (אם צריך) + בדיקת "שלח עדכון"
```

---

## שלב 0 — ודא שהקוד בפרודקשן

- [ ] Commit + push של כל השינויים (אם עדיין לא על branch ש-Render מפריס)
- [ ] Render בנה ו-deploy בהצלחה
- [ ] Health check עובד: `https://<RENDER-HOST>/api/v1/health`

---

## שלב 1 — מיגרציות DB ב-Neon (פרודקשן)

הרץ על **Neon של פרודקשן** (לא רק local):

```bash
npm run db:migrate
```

(עם `DATABASE_URL` של Neon.)

| מיגרציה | תוכן |
|---------|------|
| `023_whatsapp_enums.sql` | enums לבוט, fulfillment, התראות |
| `024_whatsapp_sessions_state.sql` | state machine לשיחות |
| `025_whatsapp_messages.sql` | לוג הודעות |
| `026_orders_whatsapp_fulfillment.sql` | שדות הזמנה מוואטסאפ |
| `027_books_fuzzy_search.sql` | `pg_trgm` לחיפוש fuzzy |

- [ ] כל 5 המיגרציות רצו בהצלחה על Neon פרודקשן

---

## שלב 2 — Render Starter ($7)

בוט וואטסאפ **חייב always-on**. Free נרדם אחרי ~15 דקות ומפספס webhooks.

1. Render Dashboard → שירות `avihay-books-api`
2. **Settings → Instance Type → Starter** ($7/חודש)
3. (אופציונלי) עדכן `render.yaml`: `plan: free` → `plan: starter`

- [ ] שודרג ל-Starter
- [ ] Health check: `/api/v1/health` (כבר מוגדר ב-`render.yaml`)

**הערה:** 512MB RAM מספיק לפרופיל של ~1500 ספרים + משתמש 1–2 + בוט.

---

## שלב 3 — Meta App + WhatsApp Business (Coexistence)

### 3.1 יצירת App

1. [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Create App** → סוג **Business**
2. הוסף מוצר **WhatsApp** → נוצר `WABA`

### 3.2 חיבור המספר (Coexistence)

1. **Embedded Signup** → **"onboard with existing WhatsApp Business app"**
2. דרישות:
   - `WhatsApp Business` גרסה **2.24.17+** על המספר
   - ישראל נתמכת (לא EU/UK/EEA)
   - לפעמים נדרש Tech Provider / BSP — תלוי בחשבון Meta

### 3.3 אימות עסק

- **Meta Business Verification** — נדרש לעבור מגבלת ~250 שיחות יזומות ב-24 שעות

### 3.4 Credentials → env

| משתנה | מאיפה |
|-------|--------|
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp → API Setup |
| `WHATSAPP_WABA_ID` | WhatsApp → API Setup |
| `WHATSAPP_ACCESS_TOKEN` | System User token + `whatsapp_business_messaging` |
| `WHATSAPP_APP_SECRET` | App → Settings → Basic |
| `WHATSAPP_VERIFY_TOKEN` | מחרוזת שאתה בוחר (אותה ערך ב-Webhook) |

- [ ] Meta App נוצר
- [ ] Coexistence מחובר למספר העסקי
- [ ] Business Verification (או בתהליך)
- [ ] כל ה-credentials הופקו

---

## שלב 4 — משתני סביבה ב-Render

Render → **Environment** (בנוסף ל-`DATABASE_URL`, `APP_API_KEY`):

```env
WHATSAPP_ENABLED=true
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WABA_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_GRAPH_VERSION=v21.0
WHATSAPP_HANDOVER_TIMEOUT_MIN=180
WHATSAPP_HUMAN_HOURS=14-18
WHATSAPP_TEMPLATE_LANG=he
WHATSAPP_TEMPLATE_ORDER_READY=order_ready_pickup
WHATSAPP_TEMPLATE_PAYMENT_LINK=order_payment_link
```

### תוכן הבוט (מומלץ)

```env
BOT_WAZE_URL=
BOT_PAYMENT_CREDIT_URL=
BOT_PAYMENT_BIT_URL=
BOT_PAYMENT_PAYBOX_URL=
BOT_CATALOG_PDF_URL=
BOT_UPDATES_GROUP_URL=
BOT_STORE_ADDRESS=
BOT_BANK_DETAILS=
BOT_DELIVERY_HOME_FEE=39
BOT_DELIVERY_POINT_FEE=25
```

רשימה מלאה: `backend/.env.example`

- [ ] כל משתני `WHATSAPP_*` הוגדרו
- [ ] `WHATSAPP_ENABLED=true`
- [ ] Redeploy אחרי שמירה

---

## שלב 5 — Webhook ב-Meta

| שדה | ערך |
|-----|-----|
| **Callback URL** | `https://<RENDER-HOST>/api/v1/webhooks/whatsapp` |
| **Verify token** | = `WHATSAPP_VERIFY_TOKEN` |
| **Subscribe fields** | `messages`, `smb_message_echoes` |

- [ ] Webhook verified (Meta שולח GET — מקבל 200)
- [ ] `messages` + `smb_message_echoes` מסומנים

---

## שלב 6 — Templates לעדכוני הזמנה

WhatsApp Manager → **Message Templates** — צור ו**אשר** בעברית:

| שם (ברירת מחדל) | שימוש |
|-----------------|--------|
| `order_ready_pickup` | ספר הגיע / מוכן לאיסוף — פרמטר: שם הספר |
| `order_payment_link` | קישור תשלום — פרמטר + כפתור URL דינמי |

אם השמות שונים — עדכן `WHATSAPP_TEMPLATE_ORDER_READY` / `WHATSAPP_TEMPLATE_PAYMENT_LINK`.

- [ ] `order_ready_pickup` מאושר
- [ ] `order_payment_link` מאושר

---

## שלב 7 — בדיקות

### אופציה A — local + ngrok (לפני prod)

```bash
npm run db:migrate
cd backend && npm run dev
ngrok http 4000
```

- Webhook זמני: `https://<ngrok-id>.ngrok.io/api/v1/webhooks/whatsapp`
- `WHATSAPP_ENABLED=true` ב-`backend/.env`

### אופציה B — ישר prod

Webhook → Render, שלח הודעה למספר העסקי.

### Checklist בדיקות

- [ ] תפריט ראשי + 8 הענפים
- [ ] חיפוש ספר (fuzzy)
- [ ] יצירת הזמנה מוואטסאפ → מופיעה באפליקציה
- [ ] מענה ידני מ-WhatsApp Business → בוט נעצר
- [ ] אחרי timeout (`WHATSAPP_HANDOVER_TIMEOUT_MIN`, ברירת מחדל 180 דק) → בוט חוזר
- [ ] "שלח עדכון" מהאפליקציה → template ללקוח
- [ ] התראת `whatsapp_human_handover` באפליקציה

### בדיקת notify ב-curl

```bash
curl -X POST https://<HOST>/api/v1/orders/<ORDER_ID>/notify-customer \
  -H "x-api-key: $APP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"template":"order_ready"}'
```

---

## שלב 8 — אפליקציית mobile

- [ ] `EXPO_PUBLIC_API_KEY` = `APP_API_KEY` של Render
- [ ] `EXPO_PUBLIC_API_URL` = URL של Render
- [ ] Build חדש אם כפתור "שלח עדכון" עדיין לא ב-build שבשימוש

---

## תחזוקה שוטפת (Coexistence)

| נושא | פעולה |
|------|--------|
| ניתוק Coexistence | לפתוח WhatsApp Business לפחות פעם ב-**~13 יום** |
| מענה אנושי | הודעות ידניות → `smb_message_echoes` → בוט מושהה |
| Marketing | לא נתמך — רק templates לעדכוני הזמנה |
| ניטור | Render Metrics, לוגים |

---

## קבצים חשובים ב-repo

| קובץ | תפקיד |
|------|--------|
| `docs/WHATSAPP_BOT.md` | מדריך Meta, Coexistence, webhook |
| `backend/.env.example` | כל משתני env |
| `backend/src/routes/webhooks/whatsapp.ts` | Webhook |
| `backend/src/services/whatsapp/engine.ts` | מנוע שיחה |
| `backend/src/services/whatsapp/client.ts` | Graph API |
| `render.yaml` | הגדרות Render |

---

## לשיחה חדשה ב-Cursor — טקסט להדבקה

```
יישמתי את בוט הוואטסאפ (קוד + migrations 023–027).
אני על Render Starter $7.
עכשיו אני בשלב: [Meta / webhook / templates / בדיקות / env].
עזור לי עם: [תאר את הבעיה או השלב].
ראה docs/WHATSAPP_BOT_NEXT_STEPS.md
```

---

*נוצר כהמשך ליישום הבוט — "נועם הספר"*
