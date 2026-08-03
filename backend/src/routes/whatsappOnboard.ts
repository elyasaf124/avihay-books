/**
 * Embedded Signup (Coexistence) — דף HTML + endpoint להחלפת code.
 * רשום לפני apiKeyAuth; POST /exchange דורש x-api-key כש-APP_API_KEY מוגדר.
 */
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { HttpError } from "../middleware/errorHandler.js";
import { getWhatsappConfig, isEmbeddedSignupConfigured } from "../services/whatsapp/config.js";
import { completeCoexistenceOnboarding } from "../services/whatsapp/onboarding.js";
import { logger } from "../utils/logger.js";

export const whatsappOnboardRouter = Router();

const exchangeBodySchema = z.object({
  code: z.string().min(1),
  waba_id: z.string().min(1),
  phone_number_id: z.string().min(1).optional(),
});

const optionalApiKey: RequestHandler = (req, _res, next) => {
  const expected = process.env.APP_API_KEY?.trim();
  if (!expected) {
    next();
    return;
  }
  if (req.header("x-api-key") !== expected) {
    next(new HttpError(401, "unauthorized"));
    return;
  }
  next();
};

function renderOnboardPage(appId: string, configId: string): string {
  const exchangePath = "/api/v1/whatsapp-onboard/exchange";
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>חיבור WhatsApp Business — נועם הספר</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      max-width: 520px;
      margin: 2rem auto;
      padding: 0 1rem;
      line-height: 1.5;
      color: #1a1a1a;
    }
    h1 { font-size: 1.35rem; margin-bottom: 0.5rem; }
    p { color: #444; }
    button {
      background: #25D366;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 0.85rem 1.25rem;
      font-size: 1rem;
      cursor: pointer;
      width: 100%;
      margin-top: 1rem;
    }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    #status { margin-top: 1rem; padding: 0.75rem; border-radius: 8px; display: none; }
    #status.ok { display: block; background: #e8f5e9; }
    #status.err { display: block; background: #ffebee; color: #b71c1c; }
    pre {
      background: #f5f5f5;
      padding: 0.75rem;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 0.8rem;
      direction: ltr;
      text-align: left;
    }
    .steps { font-size: 0.9rem; color: #555; }
    .steps li { margin: 0.35rem 0; }
  </style>
</head>
<body>
  <h1>חיבור WhatsApp Business (Coexistence)</h1>
  <p>חבר את המספר העסקי מהאפליקציה בטלפון לבוט — בלי לנתק את WhatsApp Business.</p>
  <ol class="steps">
    <li>ודא ש-WhatsApp Business בגרסה 2.24.17+ פתוח על המספר</li>
    <li>לחץ על הכפתור והתחבר ל-Facebook</li>
    <li>בחר «חבר WhatsApp Business קיים» וסרוק QR / הזן קוד</li>
    <li>אשר שיתוף היסטוריה (מומלץ)</li>
  </ol>
  <button id="connectBtn" type="button">חבר WhatsApp Business</button>
  <div id="status"></div>

  <script async defer crossorigin="anonymous" src="https://connect.facebook.net/en_US/sdk.js"></script>
  <script>
    const APP_ID = ${JSON.stringify(appId)};
    const CONFIG_ID = ${JSON.stringify(configId)};
    const EXCHANGE_PATH = ${JSON.stringify(exchangePath)};

    let sessionWabaId = null;
    let sessionPhoneNumberId = null;

    window.fbAsyncInit = function () {
      FB.init({ appId: APP_ID, cookie: true, xfbml: true, version: "v21.0" });
    };

    window.addEventListener("message", function (event) {
      if (!event.origin.endsWith("facebook.com")) return;
      try {
        const payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (payload.type !== "WA_EMBEDDED_SIGNUP") return;
        const data = payload.data || {};
        if (data.waba_id) sessionWabaId = data.waba_id;
        if (data.phone_number_id) sessionPhoneNumberId = data.phone_number_id;
        if (payload.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
          setStatus("ה-onboarding הושלם — מחליף token...", false);
        }
      } catch (_) { /* ignore non-JSON */ }
    });

    function setStatus(text, isError, json) {
      const el = document.getElementById("status");
      el.className = isError ? "err" : "ok";
      el.innerHTML = "<p>" + text + "</p>" + (json ? "<pre>" + JSON.stringify(json, null, 2) + "</pre>" : "");
    }

    async function exchangeCode(code) {
      const headers = { "Content-Type": "application/json" };
      const apiKey = new URLSearchParams(location.search).get("api_key");
      if (apiKey) headers["x-api-key"] = apiKey;

      const body = { code, waba_id: sessionWabaId };
      if (sessionPhoneNumberId) body.phone_number_id = sessionPhoneNumberId;

      const res = await fetch(EXCHANGE_PATH, { method: "POST", headers, body: JSON.stringify(body) });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.message || data.error || "Exchange failed");
      return data;
    }

    document.getElementById("connectBtn").addEventListener("click", function () {
      const btn = document.getElementById("connectBtn");
      btn.disabled = true;
      setStatus("פותח חלון Meta...", false);

      FB.login(
        function (response) {
          if (!response.authResponse || !response.authResponse.code) {
            setStatus("ההתחברות בוטלה או נכשלה.", true);
            btn.disabled = false;
            return;
          }
          if (!sessionWabaId) {
            setStatus("לא התקבל waba_id מה-session. נסה שוב.", true);
            btn.disabled = false;
            return;
          }
          exchangeCode(response.authResponse.code)
            .then(function (result) {
              setStatus(
                "החיבור הצליח! העתק את envHints ל-Render / .env והפעל מחדש את השרת.",
                false,
                result
              );
            })
            .catch(function (err) {
              setStatus(err.message || String(err), true);
              btn.disabled = false;
            });
        },
        {
          config_id: CONFIG_ID,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            setup: {},
            featureType: "whatsapp_business_app_onboarding",
            sessionInfoVersion: "3",
          },
        }
      );
    });
  </script>
</body>
</html>`;
}

whatsappOnboardRouter.get("/", (_req, res) => {
  const cfg = getWhatsappConfig();
  if (!isEmbeddedSignupConfigured(cfg)) {
    res.status(503).type("html").send(`<!DOCTYPE html><html lang="he" dir="rtl"><body>
      <p>Embedded Signup לא מוגדר. הגדר <code>WHATSAPP_APP_ID</code>, <code>WHATSAPP_ES_CONFIG_ID</code>, <code>WHATSAPP_APP_SECRET</code>.</p>
      <p>ראה docs/WHATSAPP_COEXISTENCE_ONBOARDING.md</p>
    </body></html>`);
    return;
  }
  res.type("html").send(renderOnboardPage(cfg.appId!, cfg.esConfigId!));
});

whatsappOnboardRouter.post("/exchange", optionalApiKey, async (req, res, next) => {
  try {
    const parsed = exchangeBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, "invalid_body", parsed.error.flatten());
    }
    const { code, waba_id, phone_number_id } = parsed.data;
    logger.info({ waba_id, phone_number_id }, "[whatsapp-onboard] exchange started");

    const result = await completeCoexistenceOnboarding({
      code,
      wabaId: waba_id,
      phoneNumberId: phone_number_id,
    });

    res.json({
      ok: true,
      wabaId: result.wabaId,
      phoneNumberId: result.phoneNumberId,
      coexistence: result.coexistence,
      sync: result.sync,
      envHints: result.envHints,
      message:
        "העתק envHints ל-Render/backend .env, הגדר WHATSAPP_ENABLED=true, והפעל redeploy.",
    });
  } catch (err) {
    next(err);
  }
});
