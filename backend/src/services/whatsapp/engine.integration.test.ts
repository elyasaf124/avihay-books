/**
 * WhatsApp bot integration tests — implements the full manual test plan.
 * Runs against local DB with WHATSAPP_TEST_MOCK=true (no Meta API quota used).
 */
import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";
import type { Book, BotConfigData } from "@avihay-books/shared";
import { pool } from "../../db/pool.js";
import { BTN, MENU_IDS, PICK_PREFIX, STATUS_PICK_PREFIX, T } from "./text.js";
import {
  buildDefaultBotConfig,
  resetBotConfigForTests,
  saveBotConfig,
} from "../../repos/botConfig.repo.js";
import {
  assertLastMsgType,
  assertSomeBodyContains,
  botConfigTableAvailable,
  cleanupTestPhone,
  countMessages,
  countNotificationsLike,
  countWhatsappOrders,
  dbAvailable,
  expireHandover,
  getInStockBook,
  getOutOfStockBook,
  getSession,
  goToMainMenu,
  resetPhone,
  selectMenu,
  sendInbound,
  setHumanHoursExcludingNow,
  setHumanHoursIncludingNow,
  setupWhatsappTestEnv,
  staffEcho,
  uniqueCustomerPhone,
  uniqueTestPhone,
} from "./testHarness.js";
import { getOutboundRecords } from "./outboundCapture.js";

const skip = !(await dbAvailable());

describe("WhatsApp Bot — Full Test Plan", { skip }, () => {
  let inStockBook: Book | null = null;
  let outOfStockBook: Book | null = null;

  before(async () => {
    setupWhatsappTestEnv();
    // מתחילים מקונפיג ריק כדי שתוכן הענפים ייגזר ממשתני הסביבה (כפי שהבדיקות מצפות).
    if (await botConfigTableAvailable()) await resetBotConfigForTests();
    inStockBook = await getInStockBook();
    outOfStockBook = await getOutOfStockBook();
  });

  // -------------------------------------------------------------------------
  // Test A: Session Start and Main Menu
  // -------------------------------------------------------------------------
  describe("A — Session start and main menu", () => {
    test("A1: greeting shows welcome + menu list", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      const out = await sendInbound(phone, { text: "שלום" });
      assertSomeBodyContains(out, "ברוך הבא");
      assertSomeBodyContains(out, T.menuPrompt);
      assert.ok(out.some((r) => r.msgType === "interactive.list"));
      const session = await getSession(phone);
      assert.equal(session?.current_node, "main_menu");
      await cleanupTestPhone(phone);
    });

    test("A2: greeting again on main menu re-shows welcome", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await sendInbound(phone, { text: "שלום" });
      const out = await sendInbound(phone, { text: "שלום" });
      assertSomeBodyContains(out, "ברוך הבא");
      await cleanupTestPhone(phone);
    });

    test("A3: תפריט keyword resets menu without welcome", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await selectMenu(phone, MENU_IDS.stock);
      const out = await sendInbound(phone, { text: "תפריט" });
      assert.ok(!out.some((r) => r.body.includes("ברוך הבא")));
      assertSomeBodyContains(out, T.menuPrompt);
      await cleanupTestPhone(phone);
    });

    test("A4: random text on main menu re-displays menu", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      const out = await sendInbound(phone, { text: "xyzabc123" });
      assertSomeBodyContains(out, T.menuPrompt);
      await cleanupTestPhone(phone);
    });
  });

  // -------------------------------------------------------------------------
  // Test B1: Stock Check
  // -------------------------------------------------------------------------
  describe("B1 — Stock check", () => {
    test("B1.1: menu stock asks for book title", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      const out = await selectMenu(phone, MENU_IDS.stock);
      assertSomeBodyContains(out, T.b1AskTitle);
      const session = await getSession(phone);
      assert.equal(session?.current_node, "b1_title");
      await cleanupTestPhone(phone);
    });

    test("B1.2: existing book returns match list", async () => {
      if (!inStockBook) return;
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      await selectMenu(phone, MENU_IDS.stock);
      const partial = inStockBook.title.slice(0, Math.min(6, inStockBook.title.length));
      const out = await sendInbound(phone, { text: partial });
      assert.ok(out.some((r) => r.msgType === "interactive.list"));
      assertSomeBodyContains(out, T.b1ManyMatches);
      await cleanupTestPhone(phone);
    });

    test("B1.3: in-stock book shows location and price", async () => {
      if (!inStockBook) return;
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      await selectMenu(phone, MENU_IDS.stock);
      await sendInbound(phone, { text: inStockBook.title });
      const out = await sendInbound(phone, { replyId: `${PICK_PREFIX}${inStockBook.id}` });
      assertSomeBodyContains(out, inStockBook.title);
      assertSomeBodyContains(out, "מיקום בחנות");
      await cleanupTestPhone(phone);
    });

    test("B1.4: out-of-stock book shows order option", async () => {
      if (!outOfStockBook) return;
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      await selectMenu(phone, MENU_IDS.stock);
      await sendInbound(phone, { text: outOfStockBook.title });
      const out = await sendInbound(phone, { replyId: `${PICK_PREFIX}${outOfStockBook.id}` });
      assertSomeBodyContains(out, "חסר כרגע במלאי");
      await cleanupTestPhone(phone);
    });

    test("B1.5: search again re-asks title", async () => {
      if (!inStockBook) return;
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      await selectMenu(phone, MENU_IDS.stock);
      await sendInbound(phone, { text: inStockBook.title });
      await sendInbound(phone, { replyId: `${PICK_PREFIX}${inStockBook.id}` });
      const out = await sendInbound(phone, { replyId: BTN.searchAgain });
      assertSomeBodyContains(out, T.b1AskTitle);
      await cleanupTestPhone(phone);
    });

    test("B1.6: finish goes to end-loop", async () => {
      if (!inStockBook) return;
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      await selectMenu(phone, MENU_IDS.stock);
      await sendInbound(phone, { text: inStockBook.title });
      await sendInbound(phone, { replyId: `${PICK_PREFIX}${inStockBook.id}` });
      const out = await sendInbound(phone, { replyId: BTN.finish });
      assertSomeBodyContains(out, T.endLoopPrompt);
      await cleanupTestPhone(phone);
    });

    test("B1.7: no match shows not-found buttons", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      await selectMenu(phone, MENU_IDS.stock);
      const out = await sendInbound(phone, { text: "ספר שלא קיים בכלל xyz999" });
      assertSomeBodyContains(out, "לא מצאתי");
      assert.ok(out.some((r) => r.msgType === "interactive.button"));
      await cleanupTestPhone(phone);
    });

    test("B1.8: order from no-match jumps to order type", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      await selectMenu(phone, MENU_IDS.stock);
      await sendInbound(phone, { text: "ספר שלא קיים בכלל xyz999" });
      const out = await sendInbound(phone, { replyId: BTN.toOrder });
      assertSomeBodyContains(out, T.orderAskType);
      const session = await getSession(phone);
      assert.equal(session?.current_node, "b2_type");
      await cleanupTestPhone(phone);
    });

    test("B1.9: pick none re-asks title", async () => {
      if (!inStockBook) return;
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      await selectMenu(phone, MENU_IDS.stock);
      await sendInbound(phone, { text: inStockBook.title });
      const out = await sendInbound(phone, { replyId: BTN.pickNone });
      assertSomeBodyContains(out, T.b1AskTitle);
      await cleanupTestPhone(phone);
    });

    test("B1.10: empty title re-asks", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      await selectMenu(phone, MENU_IDS.stock);
      const out = await sendInbound(phone, { text: "   " });
      assertSomeBodyContains(out, T.b1AskTitle);
      await cleanupTestPhone(phone);
    });

    test("B1.11: image sends fallback with retry button", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      await selectMenu(phone, MENU_IDS.stock);
      const out = await sendInbound(phone, { text: "", msgType: "image" });
      assertSomeBodyContains(out, T.b1ImageFallback);
      assert.ok(out.some((r) => r.msgType === "interactive.button"));
      await cleanupTestPhone(phone);
    });

    test("B1.12: retry button after image returns to title input", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      await selectMenu(phone, MENU_IDS.stock);
      await sendInbound(phone, { text: "", msgType: "image" });
      const out = await sendInbound(phone, { replyId: BTN.b1ImageRetry });
      assertSomeBodyContains(out, T.b1AskTitle);
      await cleanupTestPhone(phone);
    });

    test("B1.13: sticker also triggers image fallback", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      await selectMenu(phone, MENU_IDS.stock);
      const out = await sendInbound(phone, { text: "", msgType: "sticker" });
      assertSomeBodyContains(out, "בוט צעיר");
      await cleanupTestPhone(phone);
    });
  });

  // -------------------------------------------------------------------------
  // Test B3, B4, B5, B7: Info branches
  // -------------------------------------------------------------------------
  describe("B3/B4/B5/B7 — Info branches", () => {
    test("B3.1: hours shows address and hours", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      const out = await selectMenu(phone, MENU_IDS.hours);
      assertSomeBodyContains(out, "שעות פעילות");
      assertSomeBodyContains(out, T.endLoopPrompt);
      await cleanupTestPhone(phone);
    });

    test("B4.1: payment shows all payment methods", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      const out = await selectMenu(phone, MENU_IDS.payment);
      assertSomeBodyContains(out, "דרכי תשלום");
      assertSomeBodyContains(out, "מזומן");
      assertSomeBodyContains(out, "צ'ק");
      assertSomeBodyContains(out, "אשראי");
      assertSomeBodyContains(out, "ביט");
      assertSomeBodyContains(out, "העברה בנקאית");
      assertSomeBodyContains(out, T.endLoopPrompt);
      await cleanupTestPhone(phone);
    });

    test("B5.2: catalog without URL shows missing message", async () => {
      const prev = process.env.BOT_CATALOG_PDF_URL;
      delete process.env.BOT_CATALOG_PDF_URL;
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      const out = await selectMenu(phone, MENU_IDS.catalog);
      assertSomeBodyContains(out, T.catalogMissing);
      if (prev) process.env.BOT_CATALOG_PDF_URL = prev;
      await cleanupTestPhone(phone);
    });

    test("B5.1: catalog with URL sends document", async () => {
      process.env.BOT_CATALOG_PDF_URL = "https://example.com/catalog.pdf";
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      const out = await selectMenu(phone, MENU_IDS.catalog);
      assert.ok(out.some((r) => r.msgType === "document"));
      delete process.env.BOT_CATALOG_PDF_URL;
      await cleanupTestPhone(phone);
    });

    test("B7.2: updates without URL shows rep message", async () => {
      const prev = process.env.BOT_UPDATES_GROUP_URL;
      delete process.env.BOT_UPDATES_GROUP_URL;
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      const out = await selectMenu(phone, MENU_IDS.updates);
      assertSomeBodyContains(out, "נציג ישלח");
      if (prev) process.env.BOT_UPDATES_GROUP_URL = prev;
      await cleanupTestPhone(phone);
    });

    test("B7.1: updates with URL shows group link", async () => {
      process.env.BOT_UPDATES_GROUP_URL = "https://chat.whatsapp.com/test";
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      const out = await selectMenu(phone, MENU_IDS.updates);
      assertSomeBodyContains(out, "chat.whatsapp.com");
      delete process.env.BOT_UPDATES_GROUP_URL;
      await cleanupTestPhone(phone);
    });
  });

  // -------------------------------------------------------------------------
  // Test B3: Order status check
  // -------------------------------------------------------------------------
  describe("B3 — Order status check", () => {
    test("B3a: no active orders shows not-found + human/finish buttons", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      const out = await selectMenu(phone, MENU_IDS.orderStatus);
      assertSomeBodyContains(out, T.b3NoOrders);
      assert.ok(out.some((r) => r.msgType === "interactive.button"));
      const session = await getSession(phone);
      assert.equal(session?.current_node, "b3_status");
      await cleanupTestPhone(phone);
    });

    test("B3a: finish button after no orders goes to end-loop", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      await selectMenu(phone, MENU_IDS.orderStatus);
      const out = await sendInbound(phone, { replyId: BTN.finish });
      assertSomeBodyContains(out, T.endLoopPrompt);
      await cleanupTestPhone(phone);
    });

    test("B3a: human button after no orders triggers handover", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      await selectMenu(phone, MENU_IDS.orderStatus);
      await sendInbound(phone, { replyId: BTN.statusToHuman });
      const session = await getSession(phone);
      assert.equal(session?.status, "human_handover");
      await cleanupTestPhone(phone);
    });

    test("B3b: one active order shows status directly", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await pool.query(
        `INSERT INTO orders (book_id, supplier_id, order_type, quantity,
           customer_name, customer_phone, manual_book_title, status)
         VALUES (NULL, NULL, 'whatsapp', 1, 'Test', $1, 'ספר בדיקה B3', 'pending')`,
        [phone],
      );
      await goToMainMenu(phone);
      const out = await selectMenu(phone, MENU_IDS.orderStatus);
      assertSomeBodyContains(out, "מצאתי את ההזמנה שלך");
      assertSomeBodyContains(out, "ספר בדיקה B3");
      assertSomeBodyContains(out, "הוזמן");
      assertSomeBodyContains(out, T.endLoopPrompt);
      await pool.query(`DELETE FROM orders WHERE customer_phone = $1 AND manual_book_title = 'ספר בדיקה B3'`, [phone]);
      await cleanupTestPhone(phone);
    });

    test("B3c: multiple orders shows list, pick shows status", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      const { rows: r1 } = await pool.query<{ id: string }>(
        `INSERT INTO orders (book_id, supplier_id, order_type, quantity,
           customer_name, customer_phone, manual_book_title, status)
         VALUES (NULL, NULL, 'whatsapp', 1, 'Test', $1, 'ספר ראשון', 'pending')
         RETURNING id`,
        [phone],
      );
      const { rows: r2 } = await pool.query<{ id: string }>(
        `INSERT INTO orders (book_id, supplier_id, order_type, quantity,
           customer_name, customer_phone, manual_book_title, status)
         VALUES (NULL, NULL, 'whatsapp', 2, 'Test', $1, 'ספר שני', 'sent')
         RETURNING id`,
        [phone],
      );
      await goToMainMenu(phone);
      let out = await selectMenu(phone, MENU_IDS.orderStatus);
      assertSomeBodyContains(out, T.b3MultipleOrders);
      assert.ok(out.some((r) => r.msgType === "interactive.list"));

      out = await sendInbound(phone, { replyId: `status:order:${r2[0]!.id}` });
      assertSomeBodyContains(out, "מצאתי את ההזמנה שלך");
      assertSomeBodyContains(out, "ספר שני");
      assertSomeBodyContains(out, "הגיע לחנות");

      await pool.query(`DELETE FROM orders WHERE id IN ($1, $2)`, [r1[0]!.id, r2[0]!.id]);
      await cleanupTestPhone(phone);
    });

    test("B3: phone normalization — WhatsApp 972 finds order with 0 prefix", async () => {
      const waPhone = "972501119999";
      const localPhone = "0501119999";
      await resetPhone(waPhone);
      await pool.query(
        `INSERT INTO orders (book_id, supplier_id, order_type, quantity,
           customer_name, customer_phone, manual_book_title, status)
         VALUES (NULL, NULL, 'whatsapp', 1, 'Test', $1, 'ספר נורמליזציה', 'pending')`,
        [localPhone],
      );
      await goToMainMenu(waPhone);
      const out = await selectMenu(waPhone, MENU_IDS.orderStatus);
      assertSomeBodyContains(out, "מצאתי את ההזמנה שלך");
      assertSomeBodyContains(out, "ספר נורמליזציה");
      await pool.query(`DELETE FROM orders WHERE customer_phone = $1 AND manual_book_title = 'ספר נורמליזציה'`, [localPhone]);
      await cleanupTestPhone(waPhone);
    });
  });

  // -------------------------------------------------------------------------
  // Test B2: Pickup order
  // -------------------------------------------------------------------------
  describe("B2 — Pickup order", () => {
    test("B2.1-B2.12: full pickup order flow", async () => {
      const phone = uniqueTestPhone();
      const customerPhone = uniqueCustomerPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);

      let out = await selectMenu(phone, MENU_IDS.order);
      assertSomeBodyContains(out, T.orderAskType);

      out = await sendInbound(phone, { replyId: BTN.orderPickup });
      assertSomeBodyContains(out, T.askName);

      out = await sendInbound(phone, { text: "ישראל ישראלי" });
      assertSomeBodyContains(out, T.askPhone);

      out = await sendInbound(phone, { text: "123" });
      assertSomeBodyContains(out, T.askPhone);

      out = await sendInbound(phone, { text: customerPhone });
      assertSomeBodyContains(out, T.askBookTitle);

      out = await sendInbound(phone, { text: "ספר בדיקה א" });
      assertSomeBodyContains(out, T.askQuantity);

      out = await sendInbound(phone, { text: "abc" });
      assertSomeBodyContains(out, T.invalidQuantity);

      out = await sendInbound(phone, { text: "2" });
      assertSomeBodyContains(out, T.askMore);

      out = await sendInbound(phone, { replyId: BTN.moreYes });
      assertSomeBodyContains(out, T.askBookTitle);

      await sendInbound(phone, { text: "ספר בדיקה ב" });
      out = await sendInbound(phone, { text: "1" });
      assertSomeBodyContains(out, T.askMore);

      out = await sendInbound(phone, { replyId: BTN.moreNo });
      assertSomeBodyContains(out, T.askNotesPickup);

      out = await sendInbound(phone, { text: "אין" });
      assertSomeBodyContains(out, T.orderDonePickup);
      assertSomeBodyContains(out, T.endLoopPrompt);

      const orderCount = await countWhatsappOrders(customerPhone);
      assert.equal(orderCount, 2);

      const notifCount = await countNotificationsLike("הזמנת וואטסאפ חדשה");
      assert.ok(notifCount >= 1);

      const session = await getSession(phone);
      assert.equal(session?.current_node, "end_loop");

      await cleanupTestPhone(phone, customerPhone);
    });
  });

  // -------------------------------------------------------------------------
  // Test B2D: Delivery order
  // -------------------------------------------------------------------------
  describe("B2D — Delivery order", () => {
    test("B2D.1-B2D.6: home delivery flow", async () => {
      const phone = uniqueTestPhone();
      const customerPhone = uniqueCustomerPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);

      await selectMenu(phone, MENU_IDS.order);
      await sendInbound(phone, { replyId: BTN.orderDelivery });
      await sendInbound(phone, { text: "דנה כהן" });
      await sendInbound(phone, { text: customerPhone });
      await sendInbound(phone, { text: "תל אביב, הרצל 1" });

      let out = await sendInbound(phone, { replyId: BTN.deliveryHome });
      assertSomeBodyContains(out, T.askBookTitle);

      await sendInbound(phone, { text: "ספר משלוח" });
      await sendInbound(phone, { text: "1" });
      await sendInbound(phone, { replyId: BTN.moreNo });
      out = await sendInbound(phone, { text: "אין" });
      assertSomeBodyContains(out, T.orderDoneDelivery);

      const { rows } = await pool.query<{ fulfillment_type: string; delivery_method: string; delivery_fee: string }>(
        `SELECT fulfillment_type, delivery_method, delivery_fee::text FROM orders
         WHERE customer_phone = $1 AND order_type = 'whatsapp' LIMIT 1`,
        [customerPhone],
      );
      assert.equal(rows[0]?.fulfillment_type, "delivery");
      assert.equal(rows[0]?.delivery_method, "home");
      assert.equal(Number(rows[0]?.delivery_fee), 39);

      await cleanupTestPhone(phone, customerPhone);
    });

    test("B2D: pickup point delivery", async () => {
      const phone = uniqueTestPhone();
      const customerPhone = uniqueCustomerPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);

      await selectMenu(phone, MENU_IDS.order);
      await sendInbound(phone, { replyId: BTN.orderDelivery });
      await sendInbound(phone, { text: "רון לוי" });
      await sendInbound(phone, { text: customerPhone });
      await sendInbound(phone, { text: "ירושלים, יפו 5" });
      await sendInbound(phone, { replyId: BTN.deliveryPoint });
      await sendInbound(phone, { text: "ספר נקודה" });
      await sendInbound(phone, { text: "1" });
      await sendInbound(phone, { replyId: BTN.moreNo });
      await sendInbound(phone, { text: "אין" });

      const { rows } = await pool.query<{ delivery_method: string; delivery_fee: string }>(
        `SELECT delivery_method, delivery_fee::text FROM orders
         WHERE customer_phone = $1 AND order_type = 'whatsapp' LIMIT 1`,
        [customerPhone],
      );
      assert.equal(rows[0]?.delivery_method, "pickup_point");
      assert.equal(Number(rows[0]?.delivery_fee), 25);

      await cleanupTestPhone(phone, customerPhone);
    });
  });

  // -------------------------------------------------------------------------
  // Test B6: Quote handover
  // -------------------------------------------------------------------------
  describe("B6 — Institutional quote", () => {
    test("B6.1-B6.3: quote triggers handover and bot pauses", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);

      const out = await selectMenu(phone, MENU_IDS.quote);
      assertSomeBodyContains(out, T.quoteHandover);

      const session = await getSession(phone);
      assert.equal(session?.status, "human_handover");
      assert.equal(session?.current_node, "handover");
      assert.ok(session?.bot_paused_until);

      const pausedOut = await sendInbound(phone, { text: "שלום" });
      assert.equal(pausedOut.length, 0);

      await cleanupTestPhone(phone);
    });
  });

  // -------------------------------------------------------------------------
  // Test B8: Support
  // -------------------------------------------------------------------------
  describe("B8 — Support branches", () => {
    test("B8a: book not in shelf report", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);

      await selectMenu(phone, MENU_IDS.support);
      await sendInbound(phone, { replyId: BTN.supportNotFound });
      const out = await sendInbound(phone, { text: "תנך מלא" });
      assertSomeBodyContains(out, T.supportReportSaved);
      assertSomeBodyContains(out, T.endLoopPrompt);

      const notifs = await countNotificationsLike("ספר לא נמצא בתא");
      assert.ok(notifs >= 1);
      await cleanupTestPhone(phone);
    });

    test("B8b: POS problem + payment redirect", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);

      await selectMenu(phone, MENU_IDS.support);
      let out = await sendInbound(phone, { replyId: BTN.supportPos });
      assertSomeBodyContains(out, T.supportPosText);

      out = await sendInbound(phone, { replyId: BTN.toPayment });
      assertSomeBodyContains(out, "מזומן");

      const notifs = await countNotificationsLike("תקלה בעמדת התשלום");
      assert.ok(notifs >= 1);
      await cleanupTestPhone(phone);
    });

    test("B8c: human handover within hours", async () => {
      setHumanHoursIncludingNow();
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);

      await selectMenu(phone, MENU_IDS.support);
      await sendInbound(phone, { replyId: BTN.supportOther });
      const out = await sendInbound(phone, { replyId: BTN.toHuman });
      assertSomeBodyContains(out, T.supportHumanInHours);

      const session = await getSession(phone);
      assert.equal(session?.status, "human_handover");

      const pausedOut = await sendInbound(phone, { text: "עוד הודעה" });
      assert.equal(pausedOut.length, 0);
      await cleanupTestPhone(phone);
    });

    test("B8d: off-hours question saved", async () => {
      setHumanHoursExcludingNow();
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);

      await selectMenu(phone, MENU_IDS.support);
      await sendInbound(phone, { replyId: BTN.supportOther });
      const out = await sendInbound(phone, { text: "מתי תפתחו מחר?" });
      assertSomeBodyContains(out, T.supportQuestionSaved);

      const notifs = await countNotificationsLike("שאלה מחוץ לשעות");
      assert.ok(notifs >= 1);
      await cleanupTestPhone(phone);
    });
  });

  // -------------------------------------------------------------------------
  // Test D: Handover and coexistence
  // -------------------------------------------------------------------------
  describe("D — Handover and coexistence", () => {
    test("D1-D3: handover timeout recovery", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      await selectMenu(phone, MENU_IDS.quote);

      let session = await getSession(phone);
      assert.equal(session?.status, "human_handover");

      const paused = await sendInbound(phone, { text: "test" });
      assert.equal(paused.length, 0);

      await expireHandover(phone);
      const out = await sendInbound(phone, { text: "שלום" });
      assertSomeBodyContains(out, "ברוך הבא");

      session = await getSession(phone);
      assert.equal(session?.status, "active");
      await cleanupTestPhone(phone);
    });

    test("D4: staff echo pauses bot", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);

      await staffEcho(phone);
      const session = await getSession(phone);
      assert.equal(session?.status, "human_handover");

      const paused = await sendInbound(phone, { text: "hello" });
      assert.equal(paused.length, 0);
      await cleanupTestPhone(phone);
    });
  });

  // -------------------------------------------------------------------------
  // Test C: End-loop
  // -------------------------------------------------------------------------
  describe("C — End-loop", () => {
    test("C1-C3: yes/no/closed/reopen", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      await selectMenu(phone, MENU_IDS.payment);

      let out = await sendInbound(phone, { replyId: BTN.loopYes });
      assertSomeBodyContains(out, T.menuPrompt);

      await selectMenu(phone, MENU_IDS.payment);
      out = await sendInbound(phone, { replyId: BTN.loopNo });
      assertSomeBodyContains(out, "שמחתי מאוד לעזור");

      let session = await getSession(phone);
      assert.equal(session?.status, "closed");

      out = await sendInbound(phone, { text: "שלום" });
      assertSomeBodyContains(out, "ברוך הבא");
      session = await getSession(phone);
      assert.equal(session?.status, "active");
      await cleanupTestPhone(phone);
    });
  });

  // -------------------------------------------------------------------------
  // Test F: Edge cases
  // -------------------------------------------------------------------------
  describe("F — Edge cases", () => {
    test("F1: empty inbound on stock node re-asks", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      await selectMenu(phone, MENU_IDS.stock);
      const out = await sendInbound(phone, { text: "" });
      assertSomeBodyContains(out, T.b1AskTitle);
      await cleanupTestPhone(phone);
    });

    test("F2: very long book name triggers no-match", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      await selectMenu(phone, MENU_IDS.stock);
      const longName = "א".repeat(500);
      const out = await sendInbound(phone, { text: longName });
      assertSomeBodyContains(out, "לא מצאתי");
      await cleanupTestPhone(phone);
    });

    test("F3-F4: global menu keywords", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      await selectMenu(phone, MENU_IDS.stock);

      for (const kw of ["menu", "/menu", "bot", "start"]) {
        const out = await sendInbound(phone, { text: kw });
        assertSomeBodyContains(out, T.menuPrompt);
      }
      await cleanupTestPhone(phone);
    });

    test("F5: unknown button on main menu re-shows menu", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      const out = await sendInbound(phone, { replyId: "unknown:button" });
      assertSomeBodyContains(out, T.menuPrompt);
      await cleanupTestPhone(phone);
    });

    test("F6: rapid sequential messages", async () => {
      const phone = uniqueTestPhone();
      await resetPhone(phone);
      await Promise.all([
        sendInbound(phone, { text: "שלום" }),
        sendInbound(phone, { text: "היי" }),
      ]);
      const session = await getSession(phone);
      assert.ok(session);
      assert.ok(getOutboundRecords().length > 0);
      await cleanupTestPhone(phone);
    });
  });

  // -------------------------------------------------------------------------
  // Test G: DB verification
  // -------------------------------------------------------------------------
  describe("G — Database verification", () => {
    test("G: sessions, messages, orders, notifications logged", async () => {
      const phone = uniqueTestPhone();
      const customerPhone = uniqueCustomerPhone();
      await resetPhone(phone);
      await goToMainMenu(phone);
      await selectMenu(phone, MENU_IDS.order);
      await sendInbound(phone, { replyId: BTN.orderPickup });
      await sendInbound(phone, { text: "בדיקת DB" });
      await sendInbound(phone, { text: customerPhone });
      await sendInbound(phone, { text: "ספר DB" });
      await sendInbound(phone, { text: "1" });
      await sendInbound(phone, { replyId: BTN.moreNo });
      await sendInbound(phone, { text: "אין" });

      const session = await getSession(phone);
      assert.ok(session);
      assert.equal(session.phone_number, phone);

      const msgCounts = await countMessages(phone);
      assert.ok(msgCounts.out >= 5, `expected outbound logs, got ${msgCounts.out}`);

      const orders = await countWhatsappOrders(customerPhone);
      assert.equal(orders, 1);

      const { rows: msgRows } = await pool.query(
        `SELECT direction, msg_type, body, wa_message_id FROM whatsapp_messages WHERE phone_number = $1`,
        [phone],
      );
      assert.ok(msgRows.length > 0);
      assert.ok(msgRows.every((r) => r.wa_message_id != null));

      await cleanupTestPhone(phone, customerPhone);
    });
  });
});

// ---------------------------------------------------------------------------
// Test H: Dynamic menu, custom flows & text overrides (DB-driven bot_config)
// ---------------------------------------------------------------------------
const botCfgSkip = skip || !(await botConfigTableAvailable());

describe("WhatsApp Bot — Dynamic config", { skip: botCfgSkip }, () => {
  before(() => {
    setupWhatsappTestEnv();
  });

  // מאפסים את הקונפיג (שורה ריקה) אחרי כל בדיקה כדי לא להשפיע על שאר התרחישים/ריצות.
  afterEach(async () => {
    await resetBotConfigForTests();
  });

  async function setConfig(mutate: (cfg: BotConfigData) => BotConfigData): Promise<void> {
    await saveBotConfig(mutate(buildDefaultBotConfig()));
  }

  function listRowIds(rec: { payload: Record<string, unknown> }): string[] {
    const interactive = rec.payload.interactive as
      | { action?: { sections?: { rows?: { id: string }[] }[] } }
      | undefined;
    return (interactive?.action?.sections?.[0]?.rows ?? []).map((r) => r.id);
  }

  test("H1: disabling a builtin item removes it from the menu list", async () => {
    await setConfig((cfg) => ({
      ...cfg,
      menu_items: cfg.menu_items.map((m) =>
        m.builtin_key === "updates" ? { ...m, enabled: false } : m,
      ),
    }));
    const phone = uniqueTestPhone();
    await resetPhone(phone);
    const out = await sendInbound(phone, { text: "שלום" });
    const list = out.find((r) => r.msgType === "interactive.list");
    assert.ok(list, "expected a list message");
    const ids = listRowIds(list);
    assert.ok(!ids.includes(MENU_IDS.updates), "disabled item should be hidden");
    assert.ok(ids.includes(MENU_IDS.stock), "enabled builtin should remain");
    await cleanupTestPhone(phone);
  });

  test("H2: custom flow text node sends text and ends the loop", async () => {
    const flowId = "test_flow_text";
    const itemId = "custom:promo_text";
    await setConfig((cfg) => ({
      ...cfg,
      menu_items: [
        ...cfg.menu_items,
        {
          id: itemId,
          title: "מבצע",
          description: "",
          type: "custom",
          flow_id: flowId,
          enabled: true,
          order: cfg.menu_items.length,
        },
      ],
      custom_flows: {
        [flowId]: {
          name: "מבצע",
          entry_node_id: "n1",
          nodes: { n1: { id: "n1", type: "text", text: "יש מבצע היום!", after: "end_loop" } },
        },
      },
    }));
    const phone = uniqueTestPhone();
    await resetPhone(phone);
    await goToMainMenu(phone);
    const out = await selectMenu(phone, itemId);
    assertSomeBodyContains(out, "יש מבצע היום!");
    const session = await getSession(phone);
    assert.equal(session?.current_node, "end_loop");
    await cleanupTestPhone(phone);
  });

  test("H3: custom flow buttons navigate via goto", async () => {
    const flowId = "test_flow_btn";
    const itemId = "custom:quiz";
    await setConfig((cfg) => ({
      ...cfg,
      menu_items: [
        ...cfg.menu_items,
        {
          id: itemId,
          title: "שאלון",
          description: "",
          type: "custom",
          flow_id: flowId,
          enabled: true,
          order: cfg.menu_items.length,
        },
      ],
      custom_flows: {
        [flowId]: {
          name: "שאלון",
          entry_node_id: "start",
          nodes: {
            start: {
              id: "start",
              type: "buttons",
              text: "בחר אפשרות:",
              buttons: [{ id: "opt_a", title: "א", action: "goto", target_node_id: "done" }],
            },
            done: { id: "done", type: "text", text: "תודה על הבחירה!", after: "end_loop" },
          },
        },
      },
    }));
    const phone = uniqueTestPhone();
    await resetPhone(phone);
    await goToMainMenu(phone);
    let out = await selectMenu(phone, itemId);
    assert.ok(out.some((r) => r.msgType === "interactive.button"), "expected reply buttons");
    const mid = await getSession(phone);
    assert.ok(mid?.current_node.startsWith("custom:"), "should be inside custom flow");
    out = await sendInbound(phone, { replyId: "opt_a" });
    assertSomeBodyContains(out, "תודה על הבחירה!");
    await cleanupTestPhone(phone);
  });

  test("H4: text override replaces the default menu prompt", async () => {
    await setConfig((cfg) => ({
      ...cfg,
      text_overrides: { menuPrompt: "תפריט מותאם אישית:" },
    }));
    const phone = uniqueTestPhone();
    await resetPhone(phone);
    const out = await sendInbound(phone, { text: "שלום" });
    assertSomeBodyContains(out, "תפריט מותאם אישית:");
    await cleanupTestPhone(phone);
  });
});
