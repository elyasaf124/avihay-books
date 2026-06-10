/**
 * בדיקות onboarding (Coexistence) — mock ל-Graph API, ללא קריאות Meta אמיתיות.
 */
import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import {
  checkCoexistenceStatus,
  completeCoexistenceOnboarding,
  exchangeEmbeddedSignupCode,
  resolvePhoneNumberId,
  subscribeAppToWaba,
} from "./onboarding.js";

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetch(handlers: Record<string, (url: string, init?: RequestInit) => Response>) {
  globalThis.fetch = mock.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    for (const [prefix, handler] of Object.entries(handlers)) {
      if (url.includes(prefix)) return handler(url, init);
    }
    return new Response(JSON.stringify({ error: { message: `unmocked: ${url}` } }), {
      status: 404,
    });
  }) as typeof fetch;
}

before(() => {
  process.env.WHATSAPP_APP_ID = "app123";
  process.env.WHATSAPP_APP_SECRET = "secret456";
  process.env.WHATSAPP_GRAPH_VERSION = "v21.0";
});

after(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("whatsapp onboarding service", () => {
  it("exchangeEmbeddedSignupCode returns access_token", async () => {
    mockFetch({
      "/oauth/access_token": () =>
        new Response(JSON.stringify({ access_token: "tok_abc", token_type: "bearer" })),
    });
    const result = await exchangeEmbeddedSignupCode("code_xyz");
    assert.equal(result.access_token, "tok_abc");
  });

  it("resolvePhoneNumberId prefers explicit id", async () => {
    const id = await resolvePhoneNumberId("waba1", "tok", "phone_explicit");
    assert.equal(id, "phone_explicit");
  });

  it("resolvePhoneNumberId fetches from WABA when missing", async () => {
    mockFetch({
      "/waba99/phone_numbers": () =>
        new Response(JSON.stringify({ data: [{ id: "phone_from_waba" }] })),
    });
    const id = await resolvePhoneNumberId("waba99", "tok");
    assert.equal(id, "phone_from_waba");
  });

  it("subscribeAppToWaba posts to subscribed_apps", async () => {
    let called = false;
    mockFetch({
      "/waba1/subscribed_apps": (_url, init) => {
        called = init?.method === "POST";
        return new Response(JSON.stringify({ success: true }));
      },
    });
    await subscribeAppToWaba("waba1", "tok");
    assert.equal(called, true);
  });

  it("checkCoexistenceStatus returns is_on_biz_app", async () => {
    mockFetch({
      "phone1?fields=is_on_biz_app": () =>
        new Response(
          JSON.stringify({ is_on_biz_app: true, platform_type: "CLOUD_API", id: "phone1" }),
        ),
    });
    const status = await checkCoexistenceStatus("phone1", "tok");
    assert.equal(status.is_on_biz_app, true);
    assert.equal(status.platform_type, "CLOUD_API");
  });

  it("completeCoexistenceOnboarding runs full flow", async () => {
    mockFetch({
      "/oauth/access_token": () =>
        new Response(JSON.stringify({ access_token: "tok_full" })),
      "/waba_full/subscribed_apps": () => new Response(JSON.stringify({ success: true })),
      "/phone_full/smb_app_data": () =>
        new Response(JSON.stringify({ request_id: "req_sync" })),
      "?fields=is_on_biz_app": () =>
        new Response(
          JSON.stringify({ is_on_biz_app: true, platform_type: "CLOUD_API", id: "phone_full" }),
        ),
    });

    const result = await completeCoexistenceOnboarding({
      code: "code_full",
      wabaId: "waba_full",
      phoneNumberId: "phone_full",
    });

    assert.equal(result.wabaId, "waba_full");
    assert.equal(result.phoneNumberId, "phone_full");
    assert.equal(result.accessToken, "tok_full");
    assert.equal(result.coexistence.is_on_biz_app, true);
    assert.equal(result.envHints.WHATSAPP_WABA_ID, "waba_full");
    assert.equal(result.sync.contactsRequestId, "req_sync");
    assert.equal(result.sync.historyRequestId, "req_sync");
  });
});
