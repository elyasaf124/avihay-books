/**
 * בדיקות retention להתראות — מחיקה פיזית וסינון ברשימה.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { pool } from "../db/pool.js";
import {
  deleteNotificationsOlderThan,
  findAllNotificationsExpanded,
} from "../repos/notifications.repo.js";
import { runNotificationRetentionJob } from "./notifications.js";
import { dbAvailable } from "./whatsapp/testHarness.js";

const skip = !(await dbAvailable());

describe("notification retention", { skip }, () => {
  const RETENTION = "14 days";
  let previousRetention: string | undefined;
  let recentId: string;
  let staleId: string;

  before(async () => {
    previousRetention = process.env.NOTIFICATION_RETENTION;
    process.env.NOTIFICATION_RETENTION = RETENTION;

    const recent = await pool.query<{ id: string }>(
      `INSERT INTO notifications (type, message, is_read, created_at)
       VALUES ('orders_without_supplier', 'recent notification', FALSE, now() - interval '1 day')
       RETURNING id`,
    );
    recentId = recent.rows[0]!.id;

    const stale = await pool.query<{ id: string }>(
      `INSERT INTO notifications (type, message, is_read, created_at)
       VALUES ('orders_without_supplier', 'stale notification', TRUE, now() - interval '20 days')
       RETURNING id`,
    );
    staleId = stale.rows[0]!.id;
  });

  after(async () => {
    await pool.query(`DELETE FROM notifications WHERE id = ANY($1::uuid[])`, [
      [recentId, staleId],
    ]);
    if (previousRetention === undefined) {
      delete process.env.NOTIFICATION_RETENTION;
    } else {
      process.env.NOTIFICATION_RETENTION = previousRetention;
    }
  });

  it("deleteNotificationsOlderThan removes only notifications outside retention window", async () => {
    const deleted = await deleteNotificationsOlderThan(RETENTION);
    assert.ok(deleted >= 1);

    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM notifications WHERE id = ANY($1::uuid[]) ORDER BY created_at DESC`,
      [[recentId, staleId]],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, recentId);
  });

  it("findAllNotificationsExpanded excludes notifications older than retention interval", async () => {
    const items = await findAllNotificationsExpanded();
    const ids = items.map((n) => n.id);
    assert.ok(ids.includes(recentId));
    assert.ok(!ids.includes(staleId));
  });

  it("runNotificationRetentionJob returns deleted_count and retention", async () => {
    const extra = await pool.query<{ id: string }>(
      `INSERT INTO notifications (type, message, is_read, created_at)
       VALUES ('orders_without_supplier', 'another stale', TRUE, now() - interval '21 days')
       RETURNING id`,
    );
    const extraId = extra.rows[0]!.id;

    try {
      const result = await runNotificationRetentionJob();
      assert.equal(result.retention, RETENTION);
      assert.ok(result.deleted_count >= 1);

      const remaining = await findAllNotificationsExpanded();
      assert.ok(remaining.some((n) => n.id === recentId));
      assert.ok(!remaining.some((n) => n.id === extraId));
    } finally {
      await pool.query(`DELETE FROM notifications WHERE id = $1`, [extraId]);
    }
  });
});
