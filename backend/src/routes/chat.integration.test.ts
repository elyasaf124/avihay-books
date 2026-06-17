/**
 * בדיקות מחיקת שיחה ידנית — הודעות + סשן נמחקים; השיחה נעלמת מהרשימה.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { pool } from "../db/pool.js";
import {
  deleteConversationByPhone,
  getMessages,
  listConversations,
} from "../repos/whatsappMessages.repo.js";
import { findSessionByPhone } from "../repos/whatsappSessions.repo.js";
import { cleanupTestPhone, dbAvailable, uniqueTestPhone } from "../services/whatsapp/testHarness.js";

const skip = !(await dbAvailable());

describe("delete conversation", { skip }, () => {
  let phone: string;

  before(async () => {
    phone = uniqueTestPhone();
    await cleanupTestPhone(phone);
    await pool.query(
      `INSERT INTO whatsapp_sessions (phone_number, profile_name, status, current_node, context, last_inbound_at, updated_at)
       VALUES ($1, 'Test User', 'active', 'main_menu', '{}'::jsonb, now(), now())`,
      [phone],
    );
    await pool.query(
      `INSERT INTO whatsapp_messages (phone_number, direction, msg_type, body)
       VALUES ($1, 'in', 'text', 'hello from customer')`,
      [phone],
    );
  });

  after(async () => {
    await cleanupTestPhone(phone);
  });

  it("listConversations includes phone before delete", async () => {
    const list = await listConversations();
    assert.ok(list.some((c) => c.phone_number === phone));
  });

  it("deleteConversationByPhone removes messages, session, and list entry", async () => {
    await deleteConversationByPhone(phone);

    const messages = await getMessages(phone, 50);
    assert.equal(messages.length, 0);

    const session = await findSessionByPhone(phone);
    assert.equal(session, null);

    const list = await listConversations();
    assert.ok(!list.some((c) => c.phone_number === phone));
  });
});
