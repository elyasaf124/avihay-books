/**
 * Tests E1-E5: notify-customer outbound templates (mock mode — no Meta quota).
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { pool } from "../db/pool.js";
import { ordersRouter } from "./orders.js";
import { errorHandler } from "../middleware/errorHandler.js";
import { setupWhatsappTestEnv, dbAvailable } from "../services/whatsapp/testHarness.js";
import { clearOutboundRecords, getOutboundRecords } from "../services/whatsapp/outboundCapture.js";

const skip = !(await dbAvailable());

interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

async function request(
  app: express.Express,
  method: string,
  path: string,
  body?: unknown,
): Promise<HttpResult> {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;

  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { "Content-Type": "application/json", "x-api-key": "test-api-key" },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, body: json };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

function createApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/orders", ordersRouter);
  app.use(errorHandler);
  return app;
}

async function insertTestOrder(opts: {
  customer_phone: string | null;
  customer_name?: string;
  manual_book_title?: string;
}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO orders (
       book_id, supplier_id, order_type, quantity,
       customer_name, customer_phone, manual_book_title, status
     ) VALUES (NULL, NULL, 'whatsapp', 1, $1, $2, $3, 'pending')
     RETURNING id`,
    [opts.customer_name ?? "Test Customer", opts.customer_phone, opts.manual_book_title ?? "ספר בדיקה"],
  );
  return rows[0]!.id;
}

async function deleteTestOrder(id: string): Promise<void> {
  await pool.query(`DELETE FROM orders WHERE id = $1`, [id]);
}

describe("E — Notify customer", { skip }, () => {
  let app: express.Express;
  const savedEnv: Record<string, string | undefined> = {};

  before(() => {
    setupWhatsappTestEnv();
    savedEnv.APP_API_KEY = process.env.APP_API_KEY;
    process.env.APP_API_KEY = "test-api-key";
    app = createApp();
    clearOutboundRecords();
  });

  after(() => {
    if (savedEnv.APP_API_KEY !== undefined) process.env.APP_API_KEY = savedEnv.APP_API_KEY;
    else delete process.env.APP_API_KEY;
  });

  test("E2: order_ready template sent (mock)", async () => {
    clearOutboundRecords();
    const phone = "972501112233";
    const orderId = await insertTestOrder({ customer_phone: phone, customer_name: "דני" });

    const res = await request(app, "POST", `/orders/${orderId}/notify-customer`, {
      template: "order_ready",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.sent, true);

    const out = getOutboundRecords();
    assert.ok(out.some((r) => r.msgType === "template" && r.body.includes("order_ready_pickup")));

    await deleteTestOrder(orderId);
  });

  test("E3: payment_link template with URL (mock)", async () => {
    clearOutboundRecords();
    const phone = "972502223344";
    const orderId = await insertTestOrder({ customer_phone: phone });

    const res = await request(app, "POST", `/orders/${orderId}/notify-customer`, {
      template: "payment_link",
      paymentUrl: "https://example.com/pay/123",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.sent, true);

    const out = getOutboundRecords();
    assert.ok(out.some((r) => r.msgType === "template" && r.body.includes("order_payment_link")));

    await deleteTestOrder(orderId);
  });

  test("E4: order without phone returns 400", async () => {
    const orderId = await insertTestOrder({ customer_phone: null });

    const res = await request(app, "POST", `/orders/${orderId}/notify-customer`, {
      template: "order_ready",
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "order_missing_customer_phone");

    await deleteTestOrder(orderId);
  });

  test("E5: whatsapp disabled returns 503", async () => {
    const prev = process.env.WHATSAPP_ENABLED;
    process.env.WHATSAPP_ENABLED = "false";
    const orderId = await insertTestOrder({ customer_phone: "972503334455" });

    const res = await request(app, "POST", `/orders/${orderId}/notify-customer`, {
      template: "order_ready",
    });
    assert.equal(res.status, 503);
    assert.equal(res.body.error, "whatsapp_not_configured");

    process.env.WHATSAPP_ENABLED = prev;
    await deleteTestOrder(orderId);
  });
});
