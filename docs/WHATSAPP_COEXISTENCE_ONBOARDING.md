# חיבור Coexistence — Embedded Signup + Meta

מדריך להקמת חיבור **WhatsApp Business app + Cloud API** (Coexistence) למספר העסקי הקיים בטלפון.

**קוד:** [`backend/src/routes/whatsappOnboard.ts`](../backend/src/routes/whatsappOnboard.ts)  
**מדריך בוט כללי:** [`WHATSAPP_BOT.md`](./WHATSAPP_BOT.md)

---

## 1. דרישות מוקדמות

- אפליקציית **WhatsApp Business** גרסה **2.24.17+** פעילה על המספר (ישראל נתמכת).
- חשבון **Meta Business** עם **Business Verification** (מומלץ לפני production).
- סטטוס **Tech Provider** על ה-Meta App (חובה ל-Coexistence Embedded Signup).
- Webhook ציבורי שעובד: `https://<HOST>/api/v1/webhooks/whatsapp`.

---

## 2. Meta App — הגדרות חד-פעמיות

### 2.1 יצירת App

1. [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Create App** → **Business**.
2. הוסף מוצר **WhatsApp**.
3. הוסף **Facebook Login for Business** (נדרש ל-Embedded Signup).

### 2.2 Tech Provider

1. App Dashboard → WhatsApp → **Getting Started** / Partner onboarding.
2. השלם תהליך **Become a Tech Provider** (Business Verification + פרטי חברה).

### 2.3 Embedded Signup Login Configuration

1. App Dashboard → **Facebook Login for Business** → **Configurations**.
2. צור Configuration חדש → העתק **`config_id`** → `WHATSAPP_ES_CONFIG_ID`.
3. ב-**Settings → Basic**: העתק **App ID** → `WHATSAPP_APP_ID`, **App Secret** → `WHATSAPP_APP_SECRET`.

### 2.4 דומיינים (חובה — Embedded Signup לא יעבוד בלי)

Meta דוחה `FB.login` אם הדומיין לא רשום **או** אם החיבור לא מאובטח (HTTPS).
עבור פיתוח מקומי — **השתמש ב-ngrok** (לא `http://localhost`).

#### א. App Domains (Settings → Basic)

```
App Dashboard → Noam Sefer Bot → Settings → Basic
→ שדה "App Domains"
```

הוסף **בלי** `https://` ו**בלי** path:

| סביבה | ערך |
|--------|-----|
| ngrok | `abc123.ngrok-free.app` |
| Render | `avihay-books-api.onrender.com` |
| (אופציונלי) | `localhost` |

לחץ **Save changes**.

#### ב. Facebook Login for Business → Settings

```
App Dashboard → Facebook Login for Business → Settings
```

| שדה | ערכים |
|-----|--------|
| **Allowed Domains for the JavaScript SDK** | אותם דומיינים: `abc123.ngrok-free.app`, `localhost` |
| **Valid OAuth Redirect URIs** | `https://abc123.ngrok-free.app/api/v1/whatsapp-onboard` |
| | `https://abc123.ngrok-free.app/` |
| | `https://<render-host>.onrender.com/api/v1/whatsapp-onboard` |

> **חשוב:** אם **"Enforce HTTPS"** מסומן — `http://localhost` **לא** יעבוד. השתמש ב-ngrok.

#### ג. Embedded Signup Builder → Manage Domains

```
WhatsApp → Embedded Signup Builder → Manage Domains
```

הוסף את אותו דומיין (ngrok / Render).

#### ד. פתיחת הדף — תמיד HTTPS בפיתוח

```bash
cd backend && npm run dev
ngrok http 4000
```

פתח:
```
https://<ngrok-id>.ngrok-free.app/api/v1/whatsapp-onboard?api_key=<APP_API_KEY>
```

**לא** `http://localhost:4000` — Meta מציגה:
*"לא משתמשת בחיבור מאובטח"* / *"הדומיין אינו כלול בדומיינים של האפליקציה"*.

> **טיפ:** הוסף גרסאות עם/בלי `/` בסוף ב-OAuth Redirect URIs.

### 2.5 Webhook fields

App Dashboard → WhatsApp → **Configuration** → Webhook:

| Field | חובה |
|-------|------|
| `messages` | כן |
| `smb_message_echoes` | כן (Coexistence — מענה ידני) |
| `history` | כן (סנכרון היסטוריה) |
| `smb_app_state_sync` | כן (סנכרון אנשי קשר) |
| `account_update` | מומלץ (ניתוק / offboard) |

**Callback URL:** `https://<HOST>/api/v1/webhooks/whatsapp`  
**Verify token:** = `WHATSAPP_VERIFY_TOKEN`

### 2.6 System User token (ל-production)

1. **Business Settings** → **Users** → **System Users** → Create.
2. Assign assets: WABA + App, הרשאות `whatsapp_business_messaging`, `whatsapp_business_management`.
3. Generate token (ללא expiry אם אפשר) → `WHATSAPP_ACCESS_TOKEN`.

---

## 3. משתני סביבה

```env
WHATSAPP_ENABLED=true
WHATSAPP_APP_ID=
WHATSAPP_APP_SECRET=
WHATSAPP_ES_CONFIG_ID=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WABA_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=
```

---

## 4. תהליך החיבור (פעם אחת)

### א. מקומי (ngrok)

```bash
npm run db:migrate
cd backend && npm run dev
ngrok http 4000
```

1. עדכן Webhook + Allowed Domains ב-Meta לכתובת ngrok.
2. פתח: `https://<ngrok-id>.ngrok.io/api/v1/whatsapp-onboard`
3. לחץ **חבר WhatsApp Business** → התחבר ל-Facebook → סרוק QR באפליקציה → אשר שיתוף היסטוריה (אופציונלי).
4. העתק את `phone_number_id` / `waba_id` / `access_token` מהתוצאה ל-`.env`.
5. הפעל מחדש את השרת עם `WHATSAPP_ENABLED=true`.

### ב. Render (production)

1. Deploy + Render Starter (always-on).
2. הגדר env vars ב-Render.
3. פתח: `https://<RENDER-HOST>/api/v1/whatsapp-onboard`
4. חזור על תהליך הסריקה.

---

## 5. אימות

```bash
# סטטוס Coexistence
curl "https://graph.facebook.com/v21.0/$WHATSAPP_PHONE_NUMBER_ID?fields=is_on_biz_app,platform_type" \
  -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN"
# צפוי: is_on_biz_app=true, platform_type=CLOUD_API
```

**Checklist:**

- [ ] הודעה למספר → הבוט עונה (8 ענפים).
- [ ] מענה ידני מאפליקציית WhatsApp Business → הבוט נעצר.
- [ ] "שלח עדכון" מהאפליקציה → template ללקוח.

---

## 6. תחזוקה

| נושא | פעולה |
|------|--------|
| ניתוק Coexistence | פתח WhatsApp Business לפחות פעם ב-**~13 יום** |
| ניתוק מ-Meta | Settings → Account → Business Platform → Disconnect |
| `PARTNER_REMOVED` webhook | התראה באפליקציית הניהול — חבר מחדש דרך דף ה-onboarding |

---

## 7. פתרון בעיות

| בעיה | פתרון |
|------|--------|
| «לא משתמשת בחיבור מאובטח» / «הדומיין אינו כלול» | השתמש ב-**HTTPS** (ngrok/Render); הוסף דומיין ב-**App Domains** + **Allowed Domains** + **Manage Domains** |
| CSP חוסם FB SDK (`script-src 'self'`) | restart אחרי עדכון `helmet` ב-`backend/src/index.ts` |
| Token exchange נכשל (redirect_uri) | אל תשלח `redirect_uri` ב-exchange; ודא שהדומיין ב-Allowed Domains |
| אין אפשרות Coexistence ב-flow | ודא Tech Provider + `featureType=whatsapp_business_app_onboarding` |
| Webhook לא מגיע | always-on (לא Render Free); בדוק Verify token |
| סנכרון נכשל תוך 24h | הרץ onboarding מחדש; השאר את האפליקציה פתוחה בזמן הסנכרון |
