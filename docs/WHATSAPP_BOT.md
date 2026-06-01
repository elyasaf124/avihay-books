# בוט וואטסאפ — "נועם הספר"

חיבור בוט וואטסאפ למספר העסקי דרך `WhatsApp Cloud API` הרשמי של `Meta`, במצב `Coexistence`
(שמירה על אפשרות מענה אנושי דרך אפליקציית `WhatsApp Business` הרגילה במקביל לבוט האוטומטי).

הבוט רץ **בתוך הבקאנד הקיים** (`backend/`) וקורא ישירות לפונקציות ה-`repos`/`services`,
כך שהוא "שולף נתונים מה-DB" באותו מנגנון כמו אפליקציית הניהול.

---

## 1. הקמה מול Meta (חד-פעמי)

1. צור `Meta App` מסוג **Business** ב-[developers.facebook.com](https://developers.facebook.com/apps).
2. הוסף את מוצר **WhatsApp** לאפליקציה. ייווצר `WhatsApp Business Account` (`WABA`).
3. **Coexistence**: חבר את המספר העסקי דרך `Embedded Signup` תוך בחירת המסלול
   "onboard with existing WhatsApp Business app". דרישות:
   - אפליקציית `WhatsApp Business` בגרסה `2.24.17`+ פעילה על המספר.
   - רישום כ-`Tech Provider`/`Solution Partner`, או ביצוע ה-`onboarding` דרך `BSP` שתומך ב-Coexistence.
   - `webhook` ציבורי שמסוגל לקלוט אירועים (ראה שלב 3).
   - המסלול אינו זמין ב-`EU`/`EEA`/`UK` (ישראל נתמכת).
4. **אימות עסק** (`Meta Business Verification`) — נדרש כדי לעבור את מגבלת 250 שיחות יזומות ב-24 שעות.
5. הפק את הערכים הבאים והכנס ל-`backend/.env` (ראה `backend/.env.example`):
   - `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID` — מ-`API Setup`.
   - `WHATSAPP_ACCESS_TOKEN` — טוקן קבוע של `System User` עם `whatsapp_business_messaging`.
   - `WHATSAPP_APP_SECRET` — מ-`Settings > Basic`.
   - `WHATSAPP_VERIFY_TOKEN` — מחרוזת שרירותית שתגדיר גם בקונפיגורציית ה-Webhook.

### מגבלות Coexistence שחשוב להכיר
- יש לפתוח את אפליקציית `WhatsApp Business` לפחות פעם ב-~13 יום, אחרת החיבור מתנתק.
- הודעות שנשלחות **ידנית** מהאפליקציה מגיעות ל-`webhook` כ-`smb_message_echoes`
  ולא מפעילות אוטומציה — הבוט מזהה זאת ומשהה את עצמו (מענה אנושי).
- אין תמיכה ב-`Marketing Messages Lite`. עדכוני הזמנה יזומים נשלחים דרך `Templates` מאושרות.

---

## 2. Templates לעדכוני הזמנה (order_updates_only)

צור ואשר ב-`Meta` (WhatsApp Manager > Message Templates) שתי תבניות בעברית:

- `order_ready_pickup` — הודעה שהספר הגיע / מוכן לאיסוף. פרמטר גוף אחד: שם הספר.
- `order_payment_link` — הודעה עם קישור תשלום מאובטח. פרמטר גוף (שם הספר) + כפתור `URL` דינמי.

שמות התבניות והשפה ניתנים לשינוי ב-`WHATSAPP_TEMPLATE_*`.

---

## 3. Webhook ואירוח

- כתובת ה-`webhook`: `https://<HOST>/api/v1/webhooks/whatsapp`
  - `GET` — אימות (`hub.verify_token` מול `WHATSAPP_VERIFY_TOKEN`).
  - `POST` — קליטת הודעות, עם אימות חתימת `X-Hub-Signature-256` מול `WHATSAPP_APP_SECRET`.
- הירשם ל-`webhook fields`: `messages` (וגם `smb_message_echoes` עבור Coexistence).
- **אירוח always-on חובה**: שירות חינמי שנרדם (כמו `Render free`) יחמיץ/יעכב הודעות.
  יש לעבור לתוכנית always-on (למשל `Render Starter`) ולעדכן את `render.yaml`.

---

## 4. הרצה מקומית ובדיקות (ngrok)

```bash
# 1. החל מיגרציות (כולל טבלאות הבוט והרחבת orders)
npm run db:migrate

# 2. הפעל את הבקאנד
cd backend && npm run dev

# 3. חשוף את הפורט המקומי ל-HTTPS ציבורי
ngrok http 4000
# הגדר ב-Meta webhook: https://<ngrok-id>.ngrok.io/api/v1/webhooks/whatsapp
```

הגדר ב-`backend/.env`: `WHATSAPP_ENABLED=true` + כל הטוקנים. שלח הודעה למספר העסקי ועבור על כל
שמונת הענפים ולולאת הסיום. בדוק שמענה ידני מאפליקציית `WhatsApp Business` משהה את הבוט.

שליחת עדכון יזום ללקוח (מתוך אפליקציית הניהול / `curl`):

```bash
curl -X POST https://<HOST>/api/v1/orders/<ORDER_ID>/notify-customer \
  -H "x-api-key: $APP_API_KEY" -H "Content-Type: application/json" \
  -d '{"template":"order_ready"}'
```

---

## 5. ארכיטקטורה (קוד)

- `backend/src/routes/webhooks/whatsapp.ts` — קליטת ה-`webhook` + אימות חתימה.
- `backend/src/services/whatsapp/engine.ts` — מנוע השיחה (state machine) ושמונת הענפים.
- `backend/src/services/whatsapp/client.ts` — שליחה ל-`Graph API` (טקסט, כפתורים, רשימה, מסמך, cta_url, template).
- `backend/src/services/whatsapp/config.ts` + `text.ts` — קונפיגורציה ותוכן עברי.
- `backend/src/repos/whatsappSessions.repo.ts` / `whatsappMessages.repo.ts` — מצב שיחה ולוג הודעות.
- מצב השיחה נשמר ב-`whatsapp_sessions` (`current_node`, `context`, `status`, `bot_paused_until`).
