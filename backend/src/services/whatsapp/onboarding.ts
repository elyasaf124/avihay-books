/**
 * Embedded Signup / Coexistence onboarding — החלפת code, רישום ל-WABA, סנכרון SMB.
 */
import { logger } from "../../utils/logger.js";
import { getWhatsappConfig } from "./config.js";

export interface GraphError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
}

export interface TokenExchangeResult {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

export interface CoexistenceStatus {
  is_on_biz_app: boolean;
  platform_type: string;
  id: string;
}

export interface OnboardExchangeInput {
  code: string;
  wabaId: string;
  phoneNumberId?: string;
}

export interface OnboardExchangeResult {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
  coexistence: CoexistenceStatus;
  sync: {
    contactsRequestId?: string;
    historyRequestId?: string;
  };
  envHints: Record<string, string>;
}

function graphBase(cfg = getWhatsappConfig()): string {
  return `https://graph.facebook.com/${cfg.graphVersion}`;
}

async function graphJson<T>(
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T & { error?: GraphError } }> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: GraphError };
  return { ok: res.ok, status: res.status, data };
}

/** מחליף authorization code מ-Embedded Signup ל-access token (ללא redirect_uri). */
export async function exchangeEmbeddedSignupCode(code: string): Promise<TokenExchangeResult> {
  const cfg = getWhatsappConfig();
  if (!cfg.appId || !cfg.appSecret) {
    throw new Error("WHATSAPP_APP_ID and WHATSAPP_APP_SECRET are required for token exchange");
  }
  const params = new URLSearchParams({
    client_id: cfg.appId,
    client_secret: cfg.appSecret,
    code,
    grant_type: "authorization_code",
  });
  const { ok, status, data } = await graphJson<TokenExchangeResult>(
    `${graphBase(cfg)}/oauth/access_token?${params}`,
  );
  if (!ok || !data.access_token) {
    logger.error({ status, error: data.error }, "[whatsapp-onboard] token exchange failed");
    throw new Error(data.error?.message ?? "Token exchange failed");
  }
  return data;
}

/** מחזיר phone_number_id ראשון מ-WABA אם לא סופק מה-session. */
export async function resolvePhoneNumberId(
  wabaId: string,
  accessToken: string,
  preferredId?: string,
): Promise<string> {
  if (preferredId?.trim()) return preferredId.trim();
  const cfg = getWhatsappConfig();
  const { ok, data } = await graphJson<{ data?: { id?: string }[] }>(
    `${graphBase(cfg)}/${wabaId}/phone_numbers`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const id = data.data?.[0]?.id;
  if (!ok || !id) {
    throw new Error("Could not resolve phone_number_id from WABA — pass it from Embedded Signup session");
  }
  return id;
}

/** רושם את האפליקציה ל-webhooks של ה-WABA. */
export async function subscribeAppToWaba(wabaId: string, accessToken: string): Promise<void> {
  const cfg = getWhatsappConfig();
  const { ok, data } = await graphJson<{ success?: boolean }>(
    `${graphBase(cfg)}/${wabaId}/subscribed_apps`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );
  if (!ok || data.success === false) {
    logger.error({ wabaId, error: data.error }, "[whatsapp-onboard] subscribe WABA failed");
    throw new Error(data.error?.message ?? "Failed to subscribe app to WABA");
  }
}

/** מפעיל סנכרון contacts / history (חובה תוך 24 שעות מ-onboarding). */
export async function initiateSmbDataSync(
  phoneNumberId: string,
  syncType: "smb_app_state_sync" | "history",
  accessToken: string,
): Promise<string | undefined> {
  const cfg = getWhatsappConfig();
  const { ok, data } = await graphJson<{ request_id?: string }>(
    `${graphBase(cfg)}/${phoneNumberId}/smb_app_data`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", sync_type: syncType }),
    },
  );
  if (!ok) {
    logger.warn({ syncType, error: data.error }, "[whatsapp-onboard] smb_app_data sync failed");
    return undefined;
  }
  return data.request_id;
}

/** בודק ש-Coexistence פעיל (`is_on_biz_app` + `CLOUD_API`). */
export async function checkCoexistenceStatus(
  phoneNumberId: string,
  accessToken: string,
): Promise<CoexistenceStatus> {
  const cfg = getWhatsappConfig();
  const { ok, data } = await graphJson<CoexistenceStatus>(
    `${graphBase(cfg)}/${phoneNumberId}?fields=is_on_biz_app,platform_type`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!ok) {
    throw new Error(data.error?.message ?? "Failed to check coexistence status");
  }
  return data;
}

/** תהליך onboarding מלא אחרי Embedded Signup. */
export async function completeCoexistenceOnboarding(
  input: OnboardExchangeInput,
): Promise<OnboardExchangeResult> {
  const token = await exchangeEmbeddedSignupCode(input.code);
  const accessToken = token.access_token;

  await subscribeAppToWaba(input.wabaId, accessToken);

  const phoneNumberId = await resolvePhoneNumberId(
    input.wabaId,
    accessToken,
    input.phoneNumberId,
  );

  const contactsRequestId = await initiateSmbDataSync(
    phoneNumberId,
    "smb_app_state_sync",
    accessToken,
  );
  const historyRequestId = await initiateSmbDataSync(phoneNumberId, "history", accessToken);

  const coexistence = await checkCoexistenceStatus(phoneNumberId, accessToken);

  logger.info(
    { wabaId: input.wabaId, phoneNumberId, coexistence },
    "[whatsapp-onboard] coexistence onboarding complete",
  );

  return {
    wabaId: input.wabaId,
    phoneNumberId,
    accessToken,
    coexistence,
    sync: { contactsRequestId, historyRequestId },
    envHints: {
      WHATSAPP_ENABLED: "true",
      WHATSAPP_WABA_ID: input.wabaId,
      WHATSAPP_PHONE_NUMBER_ID: phoneNumberId,
      WHATSAPP_ACCESS_TOKEN: accessToken,
    },
  };
}
