/**
 * בדיקות Push במענה אנושי — isActiveHumanHandover + notify/send עם spy ל-Push.
 */
process.env.WHATSAPP_TEST_PUSH_SPY = "true";

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type { WhatsappSession } from "@avihay-books/shared";
import { pool } from "../../db/pool.js";
import { BTN, MENU_IDS } from "./text.js";
import {
  getTestPushLog,
  isActiveHumanHandover,
  notifyWhatsappHumanHandover,
  resetTestPushLog,
  sendOngoingHandoverPush,
} from "./handoverPush.js";
import {
  cleanupTestPhone,
  dbAvailable,
  goToMainMenu,
  resetPhone,
  selectMenu,
  sendInbound,
  setHumanHoursIncludingNow,
  setupWhatsappTestEnv,
  uniqueTestPhone,
} from "./testHarness.js";

function session(partial: Partial<WhatsappSession>): WhatsappSession {
  return {
    id: "test-id",
    phone_number: "972500000000",
    profile_name: null,
    status: "active",
    current_node: "main_menu",
    context: {},
    bot_paused_until: null,
    book_id: null,
    order_id: null,
    last_inbound_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partial,
  };
}

describe("isActiveHumanHandover", () => {
  test("returns false for null session", () => {
    assert.equal(isActiveHumanHandover(null), false);
  });

  test("returns false for active status", () => {
    assert.equal(isActiveHumanHandover(session({ status: "active" })), false);
  });

  test("returns false when handover expired", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    assert.equal(
      isActiveHumanHandover(session({ status: "human_handover", bot_paused_until: past })),
      false,
    );
  });

  test("returns true when handover active", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    assert.equal(
      isActiveHumanHandover(session({ status: "human_handover", bot_paused_until: future })),
      true,
    );
  });
});

const skipIntegration = !(await dbAvailable());

describe("handover push integration", { skip: skipIntegration }, () => {
  before(() => {
    setupWhatsappTestEnv();
    resetTestPushLog();
  });

  after(() => {
    resetTestPushLog();
  });

  test("notifyWhatsappHumanHandover records push", async () => {
    resetTestPushLog();
    await notifyWhatsappHumanHandover({
      phone: "972501234567",
      message: "test notification",
      pushBody: "test push body",
    });
    assert.equal(getTestPushLog().length, 1);
    assert.equal(getTestPushLog()[0]?.body, "test push body");
    assert.equal(getTestPushLog()[0]?.phone, "972501234567");
    await pool.query(`DELETE FROM notifications WHERE message = 'test notification'`);
  });

  test("sendOngoingHandoverPush records push", async () => {
    resetTestPushLog();
    await sendOngoingHandoverPush({
      phone: "972501234567",
      profileName: "Test",
      preview: "hello",
    });
    assert.equal(getTestPushLog().length, 1);
  });

  test("main menu greeting does not send push", async () => {
    resetTestPushLog();
    const phone = uniqueTestPhone();
    await resetPhone(phone);
    await sendInbound(phone, { text: "שלום" });
    assert.equal(getTestPushLog().length, 0);
    await cleanupTestPhone(phone);
  });

  test("handover entry sends push once", async () => {
    resetTestPushLog();
    setHumanHoursIncludingNow();
    const phone = uniqueTestPhone();
    await resetPhone(phone);
    await goToMainMenu(phone);
    await selectMenu(phone, MENU_IDS.support);
    await sendInbound(phone, { replyId: BTN.supportOther });
    await sendInbound(phone, { replyId: BTN.toHuman });
    assert.ok(getTestPushLog().length >= 1);
    assert.match(getTestPushLog().at(-1)!.body, /מענה אנושי/);
    await cleanupTestPhone(phone);
  });

  test("second message during handover does not push from engine alone", async () => {
    resetTestPushLog();
    setHumanHoursIncludingNow();
    const phone = uniqueTestPhone();
    await resetPhone(phone);
    await goToMainMenu(phone);
    await selectMenu(phone, MENU_IDS.support);
    await sendInbound(phone, { replyId: BTN.supportOther });
    await sendInbound(phone, { replyId: BTN.toHuman });
    const countAfterHandover = getTestPushLog().length;
    await sendInbound(phone, { text: "עוד הודעה" });
    assert.equal(getTestPushLog().length, countAfterHandover);
    await cleanupTestPhone(phone);
  });
});
