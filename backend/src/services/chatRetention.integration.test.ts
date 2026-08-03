/**
 * בדיקות retention להודעות צ'אט — מחיקה פיזית וסינון ב-getMessages.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { pool } from "../db/pool.js";
import {
  deleteWhatsappMessagesOlderThan,
  getMessages,
} from "../repos/whatsappMessages.repo.js";
import { runChatMessageRetentionJob } from "./chatRetention.js";
import { cleanupTestPhone, dbAvailable, uniqueTestPhone } from "./whatsapp/testHarness.js";

const skip = !(await dbAvailable());

describe("chat message retention", { skip }, () => {
  const phone = uniqueTestPhone();
  const RETENTION = "1 month";
  let previousRetention: string | undefined;

  before(async () => {
    previousRetention = process.env.CHAT_MESSAGE_RETENTION;
    process.env.CHAT_MESSAGE_RETENTION = RETENTION;
    await cleanupTestPhone(phone);
    await pool.query(
      `INSERT INTO whatsapp_messages (phone_number, direction, msg_type, body, created_at)
       VALUES ($1, 'in', 'text', 'old message', now() - interval '2 months')`,
      [phone],
    );
    await pool.query(
      `INSERT INTO whatsapp_messages (phone_number, direction, msg_type, body, created_at)
       VALUES ($1, 'in', 'text', 'recent message', now() - interval '1 day')`,
      [phone],
    );
  });

  after(async () => {
    await cleanupTestPhone(phone);
    if (previousRetention === undefined) {
      delete process.env.CHAT_MESSAGE_RETENTION;
    } else {
      process.env.CHAT_MESSAGE_RETENTION = previousRetention;
    }
  });

  it("deleteWhatsappMessagesOlderThan removes only messages outside retention window", async () => {
    const deleted = await deleteWhatsappMessagesOlderThan(RETENTION);
    assert.ok(deleted >= 1);

    const { rows } = await pool.query<{ body: string | null }>(
      `SELECT body FROM whatsapp_messages WHERE phone_number = $1 ORDER BY created_at DESC`,
      [phone],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.body, "recent message");
  });

  it("getMessages excludes messages older than retention interval", async () => {
    const messages = await getMessages(phone, 50);
    assert.equal(messages.length, 1);
    assert.equal(messages[0]!.body, "recent message");
  });

  it("runChatMessageRetentionJob returns deleted_count and retention", async () => {
    await pool.query(
      `INSERT INTO whatsapp_messages (phone_number, direction, msg_type, body, created_at)
       VALUES ($1, 'out', 'text', 'stale outbound', now() - interval '40 days')`,
      [phone],
    );

    const result = await runChatMessageRetentionJob();
    assert.equal(result.retention, RETENTION);
    assert.ok(result.deleted_count >= 1);
    assert.ok(result.ran_at.length > 0);

    const remaining = await getMessages(phone, 50);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0]!.body, "recent message");
  });
});
