/**
 * מנוע השיחה של בוט הוואטסאפ (state machine) — מימוש שמונת הענפים ולולאת הסיום
 * לפי מפרט הזרימה של "נועם הספר". מצב השיחה נשמר ב-`whatsapp_sessions`
 * (`current_node` + `context`), והבוט קורא ישירות ל-`repos` הקיימים לשליפת נתונים.
 *
 * תמיכת Coexistence: כאשר נציג עונה ידנית מאפליקציית WhatsApp Business (echo) או
 * כאשר הלקוח מבקש נציג — השיחה עוברת ל-`human_handover` והבוט מושהה (`bot_paused_until`).
 */
import type { FulfillmentType, DeliveryMethod, WhatsappSession } from "@avihay-books/shared";
import { logger } from "../../utils/logger.js";
import { fuzzySearchBooks, findBookById } from "../../repos/books.repo.js";
import { getBookLocationPaths } from "../bookLocation.js";
import { createWhatsappOrderGroup } from "../../repos/orders.repo.js";
import { upsertNotification } from "../../repos/notifications.repo.js";
import {
  createSession,
  findSessionByPhone,
  updateSession,
} from "../../repos/whatsappSessions.repo.js";
import { getBotContent, getWhatsappConfig, isWhatsappConfigured } from "./config.js";
import {
  sendCtaUrl,
  sendDocument,
  sendListMessage,
  sendReplyButtons,
  sendText,
} from "./client.js";
import {
  BTN,
  hoursMessage,
  MAIN_MENU_ROWS,
  MENU_IDS,
  ORDER_STATUS_LABELS,
  paymentMessage,
  PICK_PREFIX,
  STATUS_PICK_PREFIX,
  T,
  updatesMessage,
} from "./text.js";
import { pool } from "../../db/pool.js";

export interface ParsedInbound {
  /** מזהה כפתור/שורה שנבחר (interactive reply id), אם קיים. */
  replyId?: string;
  /** טקסט חופשי שהלקוח הקליד, אם קיים. */
  text?: string;
  /** סוג ההודעה המקורי מ-Meta (text, image, sticker, audio, video וכו'). */
  msgType?: string;
}

const NODES = {
  NEW: "new",
  MAIN_MENU: "main_menu",
  B1_TITLE: "b1_title",
  B1_PICK: "b1_pick",
  B3_STATUS: "b3_status",
  B3_PICK: "b3_pick",
  B2_TYPE: "b2_type",
  B2_NAME: "b2_name",
  B2_PHONE: "b2_phone",
  B2_ADDRESS: "b2_address",
  B2_DELIVERY_METHOD: "b2_delivery_method",
  B2_BOOK_TITLE: "b2_book_title",
  B2_BOOK_QTY: "b2_book_qty",
  B2_MORE: "b2_more",
  B2_NOTES: "b2_notes",
  B8_MENU: "b8_menu",
  B8_BOOK_TITLE: "b8_book_title",
  B8_POS: "b8_pos",
  B8_OTHER: "b8_other",
  B8_OTHER_QUESTION: "b8_other_question",
  END_LOOP: "end_loop",
  HANDOVER: "handover",
  CLOSED: "closed",
} as const;

interface Ctx {
  fulfillment_type?: FulfillmentType;
  delivery_method?: DeliveryMethod;
  delivery_fee?: number;
  customer_name?: string;
  customer_phone?: string;
  address?: string;
  current_book_title?: string;
  books?: { title: string; quantity: number }[];
  [key: string]: unknown;
}

function ctxOf(session: WhatsappSession): Ctx {
  return { ...(session.context as Ctx) };
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/[?!.׳״]/g, "");
}

function isMenuKeyword(norm: string): boolean {
  return ["תפריט", "תפריט ראשי", "menu", "/menu", "בוט", "start"].includes(norm);
}

function isGreeting(norm: string): boolean {
  return ["שלום", "היי", "הי", "הלו", "hi", "hello"].includes(norm);
}

function currentIsraelHour(): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      hour12: false,
    });
    return Number.parseInt(fmt.format(new Date()), 10) % 24;
  } catch {
    return new Date().getHours();
  }
}

function withinHumanHours(): boolean {
  const cfg = getWhatsappConfig();
  const h = currentIsraelHour();
  return h >= cfg.humanHoursStart && h < cfg.humanHoursEnd;
}

// ---------------------------------------------------------------------------
// כניסה ראשית
// ---------------------------------------------------------------------------

export async function handleIncomingMessage(args: {
  from: string;
  profileName: string | null;
  inbound: ParsedInbound;
}): Promise<void> {
  if (!isWhatsappConfigured()) return;
  const { from, profileName, inbound } = args;

  let session = await findSessionByPhone(from);
  if (!session) session = await createSession(from, profileName);

  session = await updateSession(session.id, {
    touchInbound: true,
    profile_name: profileName ?? session.profile_name,
  });

  // מענה אנושי פעיל: הבוט שותק עד שעובר חלון ההשהיה.
  if (session.status === "human_handover") {
    const pausedUntil = session.bot_paused_until ? new Date(session.bot_paused_until).getTime() : 0;
    if (pausedUntil > Date.now()) {
      logger.info({ from }, "[whatsapp] session in human_handover — bot paused");
      return;
    }
    session = await updateSession(session.id, {
      status: "active",
      current_node: NODES.NEW,
      context: {},
      bot_paused_until: null,
    });
  }

  const token = inbound.replyId?.trim() ?? "";
  const text = inbound.text?.trim() ?? "";
  const norm = normalize(text);

  if (isMenuKeyword(norm)) {
    await startMainMenu(from, session, false);
    return;
  }

  const isFresh =
    session.current_node === NODES.NEW ||
    session.current_node === NODES.CLOSED ||
    session.status === "closed";
  if (isFresh || (token === "" && isGreeting(norm) && session.current_node === NODES.MAIN_MENU)) {
    await startMainMenu(from, session, true);
    return;
  }

  try {
    await dispatch(from, session, token, text, inbound.msgType);
  } catch (err) {
    logger.error({ err, from, node: session.current_node }, "[whatsapp] dispatch error");
    await sendText(from, "אירעה תקלה זמנית. בוא נתחיל מחדש 🙂");
    await startMainMenu(from, session, false);
  }
}

/** מענה אנושי ידני מאפליקציית WhatsApp Business (smb_message_echoes) — השהיית הבוט. */
export async function handleStaffEcho(from: string): Promise<void> {
  let session = await findSessionByPhone(from);
  if (!session) session = await createSession(from, null);
  const cfg = getWhatsappConfig();
  const until = new Date(Date.now() + cfg.handoverTimeoutMin * 60 * 1000);
  await updateSession(session.id, {
    status: "human_handover",
    current_node: NODES.HANDOVER,
    bot_paused_until: until,
  });
  logger.info({ from }, "[whatsapp] staff echo — bot paused for human handover");
}

// ---------------------------------------------------------------------------
// Dispatch לפי מצב נוכחי
// ---------------------------------------------------------------------------

async function dispatch(
  from: string,
  session: WhatsappSession,
  token: string,
  text: string,
  msgType?: string,
): Promise<void> {
  switch (session.current_node) {
    case NODES.MAIN_MENU:
      return handleMainMenu(from, session, token);
    case NODES.B1_TITLE:
      return handleB1Title(from, session, text, msgType);
    case NODES.B1_PICK:
      return handleB1Pick(from, session, token);
    case NODES.B2_TYPE:
      return handleB2Type(from, session, token);
    case NODES.B2_NAME:
      return handleB2Name(from, session, text);
    case NODES.B2_PHONE:
      return handleB2Phone(from, session, text);
    case NODES.B2_ADDRESS:
      return handleB2Address(from, session, text);
    case NODES.B2_DELIVERY_METHOD:
      return handleB2DeliveryMethod(from, session, token);
    case NODES.B2_BOOK_TITLE:
      return handleB2BookTitle(from, session, text);
    case NODES.B2_BOOK_QTY:
      return handleB2BookQty(from, session, text);
    case NODES.B2_MORE:
      return handleB2More(from, session, token);
    case NODES.B2_NOTES:
      return finishOrder(from, session, text);
    case NODES.B3_STATUS:
      return handleB3Status(from, session, token);
    case NODES.B3_PICK:
      return handleB3Pick(from, session, token);
    case NODES.B8_MENU:
      return handleSupportMenu(from, session, token);
    case NODES.B8_BOOK_TITLE:
      return handleSupportBookReport(from, session, text);
    case NODES.B8_POS:
      return handleSupportPos(from, session, token);
    case NODES.B8_OTHER:
      return handleSupportOther(from, session, token);
    case NODES.B8_OTHER_QUESTION:
      return handleSupportQuestion(from, session, text);
    case NODES.END_LOOP:
      return handleEndLoop(from, session, token);
    default:
      return startMainMenu(from, session, false);
  }
}

// ---------------------------------------------------------------------------
// תפריט ראשי + סיום
// ---------------------------------------------------------------------------

async function startMainMenu(
  from: string,
  session: WhatsappSession,
  welcome: boolean,
): Promise<void> {
  const content = getBotContent();
  if (welcome) await sendText(from, T.welcome(content.storeName));
  await sendListMessage(from, T.menuPrompt, T.menuButton, MAIN_MENU_ROWS);
  await updateSession(session.id, {
    status: "active",
    current_node: NODES.MAIN_MENU,
    context: {},
    bot_paused_until: null,
  });
}

async function handleMainMenu(from: string, session: WhatsappSession, token: string): Promise<void> {
  const content = getBotContent();
  switch (token) {
    case MENU_IDS.stock:
      await sendText(from, T.b1AskTitle);
      return setNode(session, NODES.B1_TITLE);
    case MENU_IDS.order:
      return askOrderType(from, session);
    case MENU_IDS.orderStatus:
      return checkOrderStatus(from, session);
    case MENU_IDS.hours:
      await sendText(from, hoursMessage(content));
      if (content.wazeUrl) {
        await sendCtaUrl(from, "ניווט נוח לחנות:", "🚗 הגעה בוויז", content.wazeUrl);
      }
      return goEndLoop(from, session);
    case MENU_IDS.payment:
      await sendText(from, paymentMessage(content));
      return goEndLoop(from, session);
    case MENU_IDS.catalog:
      if (content.catalogPdfUrl) {
        await sendDocument(from, content.catalogPdfUrl, "catalog.pdf", T.catalogCaption);
      } else {
        await sendText(from, T.catalogMissing);
      }
      return goEndLoop(from, session);
    case MENU_IDS.quote:
      await sendText(from, T.quoteHandover);
      return handover(from, session, "הצעת מחיר למוסדות");
    case MENU_IDS.updates:
      await sendText(from, updatesMessage(content));
      return goEndLoop(from, session);
    case MENU_IDS.support:
      return sendSupportMenu(from, session);
    default:
      await sendListMessage(from, T.menuPrompt, T.menuButton, MAIN_MENU_ROWS);
      return;
  }
}

async function goEndLoop(from: string, session: WhatsappSession): Promise<void> {
  await sendReplyButtons(from, T.endLoopPrompt, [
    { id: BTN.loopYes, title: "כן 👍" },
    { id: BTN.loopNo, title: "לא 👎" },
  ]);
  await updateSession(session.id, { current_node: NODES.END_LOOP, context: {} });
}

async function handleEndLoop(from: string, session: WhatsappSession, token: string): Promise<void> {
  if (token === BTN.loopYes) return startMainMenu(from, session, false);
  if (token === BTN.loopNo) {
    const content = getBotContent();
    await sendText(from, T.closing(content.storeName));
    await updateSession(session.id, { status: "closed", current_node: NODES.CLOSED, context: {} });
    return;
  }
  await sendReplyButtons(from, T.endLoopPrompt, [
    { id: BTN.loopYes, title: "כן 👍" },
    { id: BTN.loopNo, title: "לא 👎" },
  ]);
}

// ---------------------------------------------------------------------------
// ענף 1 — בירור מלאי, מחיר ומיקום
// ---------------------------------------------------------------------------

const MEDIA_TYPES = new Set(["image", "sticker", "video", "audio", "voice", "document"]);

async function handleB1Title(from: string, session: WhatsappSession, text: string, msgType?: string): Promise<void> {
  if (msgType && MEDIA_TYPES.has(msgType)) {
    await sendReplyButtons(from, T.b1ImageFallback, [
      { id: BTN.b1ImageRetry, title: "🔄 נסה שוב" },
    ]);
    return;
  }
  if (text.length === 0) {
    await sendText(from, T.b1AskTitle);
    return;
  }
  const matches = await fuzzySearchBooks(text, 8);
  if (matches.length === 0) {
    await sendReplyButtons(from, T.b1NoMatch, [
      { id: BTN.toOrder, title: "🛒 כן, להזמנה" },
      { id: BTN.searchAgain, title: "🔄 נסה שוב" },
      { id: BTN.finish, title: "✅ סיום" },
    ]);
    return setNode(session, NODES.B1_PICK);
  }
  const rows = matches.map((b) => ({
    id: `${PICK_PREFIX}${b.id}`,
    title: b.title,
    description: `${b.author} · ₪${b.price}`,
  }));
  rows.push({ id: BTN.pickNone, title: "אף אחד מהם", description: "אף אחת מהאפשרויות" });
  await sendListMessage(from, T.b1ManyMatches, "בחר ספר", rows);
  return setNode(session, NODES.B1_PICK);
}

async function handleB1Pick(from: string, session: WhatsappSession, token: string): Promise<void> {
  if (token.startsWith(PICK_PREFIX) && token !== BTN.pickNone) {
    const bookId = token.slice(PICK_PREFIX.length);
    const book = await findBookById(bookId);
    if (!book) {
      await sendText(from, T.b1AskTitle);
      return setNode(session, NODES.B1_TITLE);
    }
    const locations = await getBookLocationPaths(bookId);
    const inStock = Number(book.stock_quantity) > 0;
    if (inStock) {
      const where = locations[0]?.short_path ?? "פנה לנציג בחנות";
      const msg =
        `שם הספר: ${book.title} | מחבר: ${book.author} | מחיר: ${book.price} ש"ח\n` +
        `📍 מיקום בחנות: ${where}\n` +
        "ניתן להגיע לחנות ולרכוש את הספר!";
      await sendReplyButtons(from, msg, [
        { id: BTN.searchAgain, title: "🔄 חיפוש נוסף" },
        { id: BTN.finish, title: "✅ סיום" },
      ]);
    } else {
      const msg =
        `שם הספר: ${book.title} | מחבר: ${book.author}\n` + "סטטוס: חסר כרגע במלאי.";
      await sendReplyButtons(from, msg, [
        { id: BTN.toOrder, title: "🛒 להזמנת הספר" },
        { id: BTN.searchAgain, title: "🔄 חיפוש נוסף" },
        { id: BTN.finish, title: "✅ סיום" },
      ]);
    }
    return; // נשארים ב-B1_PICK לטיפול בכפתור ההמשך
  }

  switch (token) {
    case BTN.toOrder:
      return askOrderType(from, session);
    case BTN.b1ImageRetry:
    case BTN.searchAgain:
    case BTN.pickNone:
      await sendText(from, T.b1AskTitle);
      return setNode(session, NODES.B1_TITLE);
    case BTN.finish:
      return goEndLoop(from, session);
    default:
      await sendText(from, T.b1AskTitle);
      return setNode(session, NODES.B1_TITLE);
  }
}

// ---------------------------------------------------------------------------
// ענף 2 — הזמנה חדשה (איסוף / משלוח)
// ---------------------------------------------------------------------------

async function askOrderType(from: string, session: WhatsappSession): Promise<void> {
  await sendReplyButtons(from, T.orderAskType, [
    { id: BTN.orderPickup, title: "📦 איסוף עצמי" },
    { id: BTN.orderDelivery, title: "🚚 משלוח" },
  ]);
  await updateSession(session.id, { current_node: NODES.B2_TYPE, context: { books: [] } });
}

async function handleB2Type(from: string, session: WhatsappSession, token: string): Promise<void> {
  const ctx = ctxOf(session);
  ctx.books = ctx.books ?? [];
  if (token === BTN.orderPickup) ctx.fulfillment_type = "pickup";
  else if (token === BTN.orderDelivery) ctx.fulfillment_type = "delivery";
  else {
    await sendReplyButtons(from, T.orderAskType, [
      { id: BTN.orderPickup, title: "📦 איסוף עצמי" },
      { id: BTN.orderDelivery, title: "🚚 משלוח" },
    ]);
    return;
  }
  await sendText(from, T.askName);
  await updateSession(session.id, { current_node: NODES.B2_NAME, context: ctx });
}

async function handleB2Name(from: string, session: WhatsappSession, text: string): Promise<void> {
  if (text.length === 0) {
    await sendText(from, T.askName);
    return;
  }
  const ctx = ctxOf(session);
  ctx.customer_name = text;
  await sendText(from, T.askPhone);
  await updateSession(session.id, { current_node: NODES.B2_PHONE, context: ctx });
}

async function handleB2Phone(from: string, session: WhatsappSession, text: string): Promise<void> {
  const digits = text.replace(/\D/g, "");
  if (digits.length < 7) {
    await sendText(from, T.askPhone);
    return;
  }
  const ctx = ctxOf(session);
  ctx.customer_phone = text.trim();
  if (ctx.fulfillment_type === "delivery") {
    await sendText(from, T.askAddress);
    await updateSession(session.id, { current_node: NODES.B2_ADDRESS, context: ctx });
  } else {
    await sendText(from, T.askBookTitle);
    await updateSession(session.id, { current_node: NODES.B2_BOOK_TITLE, context: ctx });
  }
}

async function handleB2Address(from: string, session: WhatsappSession, text: string): Promise<void> {
  if (text.length === 0) {
    await sendText(from, T.askAddress);
    return;
  }
  const ctx = ctxOf(session);
  const content = getBotContent();
  ctx.address = text;
  await sendReplyButtons(from, T.askDeliveryMethod, [
    { id: BTN.deliveryHome, title: `🛵 עד הבית ₪${content.deliveryHomeFee}` },
    { id: BTN.deliveryPoint, title: `📦 נקודת איסוף ₪${content.deliveryPointFee}` },
  ]);
  await updateSession(session.id, { current_node: NODES.B2_DELIVERY_METHOD, context: ctx });
}

async function handleB2DeliveryMethod(
  from: string,
  session: WhatsappSession,
  token: string,
): Promise<void> {
  const ctx = ctxOf(session);
  const content = getBotContent();
  if (token === BTN.deliveryHome) {
    ctx.delivery_method = "home";
    ctx.delivery_fee = content.deliveryHomeFee;
  } else if (token === BTN.deliveryPoint) {
    ctx.delivery_method = "pickup_point";
    ctx.delivery_fee = content.deliveryPointFee;
  } else {
    await sendReplyButtons(from, T.askDeliveryMethod, [
      { id: BTN.deliveryHome, title: `🛵 עד הבית ₪${content.deliveryHomeFee}` },
      { id: BTN.deliveryPoint, title: `📦 נקודת איסוף ₪${content.deliveryPointFee}` },
    ]);
    return;
  }
  await sendText(from, T.askBookTitle);
  await updateSession(session.id, { current_node: NODES.B2_BOOK_TITLE, context: ctx });
}

async function handleB2BookTitle(
  from: string,
  session: WhatsappSession,
  text: string,
): Promise<void> {
  if (text.length === 0) {
    await sendText(from, T.askBookTitle);
    return;
  }
  const ctx = ctxOf(session);
  ctx.current_book_title = text;
  await sendText(from, T.askQuantity);
  await updateSession(session.id, { current_node: NODES.B2_BOOK_QTY, context: ctx });
}

async function handleB2BookQty(
  from: string,
  session: WhatsappSession,
  text: string,
): Promise<void> {
  const match = /\d+/.exec(text);
  const qty = match ? Number.parseInt(match[0], 10) : NaN;
  if (!Number.isFinite(qty) || qty <= 0) {
    await sendText(from, T.invalidQuantity);
    return;
  }
  const ctx = ctxOf(session);
  ctx.books = ctx.books ?? [];
  if (ctx.current_book_title) {
    ctx.books.push({ title: ctx.current_book_title, quantity: qty });
  }
  ctx.current_book_title = undefined;
  await sendReplyButtons(from, T.askMore, [
    { id: BTN.moreYes, title: "כן" },
    { id: BTN.moreNo, title: "לא" },
  ]);
  await updateSession(session.id, { current_node: NODES.B2_MORE, context: ctx });
}

async function handleB2More(from: string, session: WhatsappSession, token: string): Promise<void> {
  const ctx = ctxOf(session);
  if (token === BTN.moreYes) {
    await sendText(from, T.askBookTitle);
    return setNode(session, NODES.B2_BOOK_TITLE);
  }
  if (token === BTN.moreNo) {
    await sendText(
      from,
      ctx.fulfillment_type === "delivery" ? T.askNotesDelivery : T.askNotesPickup,
    );
    return setNode(session, NODES.B2_NOTES);
  }
  await sendReplyButtons(from, T.askMore, [
    { id: BTN.moreYes, title: "כן" },
    { id: BTN.moreNo, title: "לא" },
  ]);
}

async function finishOrder(from: string, session: WhatsappSession, text: string): Promise<void> {
  const ctx = ctxOf(session);
  const trimmed = text.trim();
  const notes = trimmed === "" || trimmed === "אין" ? null : trimmed;
  const lines = (ctx.books ?? []).filter((b) => b.title.trim().length > 0);

  if (lines.length > 0) {
    await createWhatsappOrderGroup({
      customer_name: ctx.customer_name ?? "",
      customer_phone: ctx.customer_phone ?? from,
      fulfillment_type: ctx.fulfillment_type ?? "pickup",
      delivery_method: ctx.delivery_method ?? null,
      delivery_fee: ctx.delivery_fee ?? null,
      address: ctx.address ?? null,
      notes,
      lines,
    });
    await upsertNotification({
      type: "whatsapp_human_handover",
      message:
        `הזמנת וואטסאפ חדשה (${ctx.fulfillment_type === "delivery" ? "משלוח" : "איסוף"}) ` +
        `מ-${ctx.customer_name ?? from} · ${lines.length} פריטים`,
      is_read: false,
    });
  }

  await sendText(
    from,
    ctx.fulfillment_type === "delivery" ? T.orderDoneDelivery : T.orderDonePickup,
  );
  await goEndLoop(from, session);
}

// ---------------------------------------------------------------------------
// ענף 3 — בירור סטטוס הזמנה קיימת
// ---------------------------------------------------------------------------

interface ActiveOrder {
  id: string;
  status: string;
  manual_book_title: string | null;
  book_title: string | null;
  created_at: string;
}

function phoneVariants(waPhone: string): string[] {
  const digits = waPhone.replace(/\D/g, "");
  const variants = [waPhone, digits];
  if (digits.startsWith("972")) {
    variants.push("0" + digits.slice(3));
  }
  if (digits.startsWith("0")) {
    variants.push("972" + digits.slice(1));
  }
  return [...new Set(variants)];
}

function statusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

async function findActiveOrdersByPhone(waPhone: string): Promise<ActiveOrder[]> {
  const variants = phoneVariants(waPhone);
  const placeholders = variants.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await pool.query<ActiveOrder>(
    `SELECT o.id, o.status,
            o.manual_book_title,
            b.title AS book_title,
            o.created_at::text
       FROM orders o
       LEFT JOIN books b ON b.id = o.book_id
      WHERE o.customer_phone IN (${placeholders})
        AND o.status IN ('pending', 'sent')
      ORDER BY o.created_at DESC
      LIMIT 10`,
    variants,
  );
  return rows;
}

async function checkOrderStatus(from: string, session: WhatsappSession): Promise<void> {
  const orders = await findActiveOrdersByPhone(from);

  if (orders.length === 0) {
    await sendReplyButtons(from, T.b3NoOrders, [
      { id: BTN.statusToHuman, title: "🛠️ מענה אנושי" },
      { id: BTN.finish, title: "✅ סיום" },
    ]);
    return updateSession(session.id, { current_node: NODES.B3_STATUS, context: {} }).then(() => {});
  }

  if (orders.length === 1) {
    const o = orders[0]!;
    const title = o.manual_book_title ?? o.book_title ?? "הזמנה";
    const msg =
      `מצאתי את ההזמנה שלך! 📋\n` +
      `ספר: ${title}\n` +
      `סטטוס עדכני: ${statusLabel(o.status)}\n\n` +
      "אם יש לך שאלות נוספות, נשמח לעזור.";
    await sendText(from, msg);
    return goEndLoop(from, session);
  }

  const rows = orders.map((o) => {
    const title = o.manual_book_title ?? o.book_title ?? "הזמנה";
    return {
      id: `${STATUS_PICK_PREFIX}${o.id}`,
      title: title.length > 24 ? title.slice(0, 23) + "…" : title,
      description: `${formatDate(o.created_at)} · ${statusLabel(o.status)}`,
    };
  });
  await sendListMessage(from, T.b3MultipleOrders, "בחר הזמנה", rows);
  await updateSession(session.id, { current_node: NODES.B3_PICK, context: {} });
}

async function handleB3Status(from: string, session: WhatsappSession, token: string): Promise<void> {
  if (token === BTN.statusToHuman) {
    return handover(from, session, "בירור סטטוס הזמנה — מענה אנושי");
  }
  if (token === BTN.finish) return goEndLoop(from, session);
  await sendReplyButtons(from, T.b3NoOrders, [
    { id: BTN.statusToHuman, title: "🛠️ מענה אנושי" },
    { id: BTN.finish, title: "✅ סיום" },
  ]);
}

async function handleB3Pick(from: string, session: WhatsappSession, token: string): Promise<void> {
  if (token.startsWith(STATUS_PICK_PREFIX)) {
    const orderId = token.slice(STATUS_PICK_PREFIX.length);
    const { rows } = await pool.query<ActiveOrder>(
      `SELECT o.id, o.status,
              o.manual_book_title,
              b.title AS book_title,
              o.created_at::text
         FROM orders o
         LEFT JOIN books b ON b.id = o.book_id
        WHERE o.id = $1`,
      [orderId],
    );
    if (rows.length === 0) {
      await sendText(from, "לא נמצאה הזמנה. בוא נחזור לתפריט.");
      return startMainMenu(from, session, false);
    }
    const o = rows[0]!;
    const title = o.manual_book_title ?? o.book_title ?? "הזמנה";
    const msg =
      `מצאתי את ההזמנה שלך! 📋\n` +
      `ספר: ${title}\n` +
      `סטטוס עדכני: ${statusLabel(o.status)}\n\n` +
      "אם יש לך שאלות נוספות, נשמח לעזור.";
    await sendText(from, msg);
    return goEndLoop(from, session);
  }
  await checkOrderStatus(from, session);
}

// ---------------------------------------------------------------------------
// ענף 8 — מענה אנושי / דיווח על תקלה
// ---------------------------------------------------------------------------

async function sendSupportMenu(from: string, session: WhatsappSession): Promise<void> {
  await sendReplyButtons(from, T.supportPrompt, [
    { id: BTN.supportNotFound, title: "📕 ספר לא בתא" },
    { id: BTN.supportPos, title: "🖥️ תקלת תשלום" },
    { id: BTN.supportOther, title: "❓ שאלה אחרת" },
  ]);
  await updateSession(session.id, { current_node: NODES.B8_MENU, context: {} });
}

async function handleSupportMenu(
  from: string,
  session: WhatsappSession,
  token: string,
): Promise<void> {
  switch (token) {
    case BTN.supportNotFound:
      await sendText(from, T.supportAskBook);
      return setNode(session, NODES.B8_BOOK_TITLE);
    case BTN.supportPos:
      await sendReplyButtons(from, T.supportPosText, [
        { id: BTN.toPayment, title: "💳 אפשרויות תשלום" },
        { id: BTN.finish, title: "✅ סיום" },
      ]);
      await upsertNotification({
        type: "whatsapp_human_handover",
        message: `וואטסאפ: דווח על תקלה בעמדת התשלום (${from})`,
        is_read: false,
      });
      return setNode(session, NODES.B8_POS);
    case BTN.supportOther:
      if (withinHumanHours()) {
        await sendReplyButtons(from, "אפשר להעביר אותך לנציג אנושי:", [
          { id: BTN.toHuman, title: "💬 מענה אנושי" },
        ]);
        return setNode(session, NODES.B8_OTHER);
      }
      await sendText(from, T.supportOffHours(getWhatsappConfig().humanHoursStart, getWhatsappConfig().humanHoursEnd));
      return setNode(session, NODES.B8_OTHER_QUESTION);
    default:
      return sendSupportMenu(from, session);
  }
}

async function handleSupportBookReport(
  from: string,
  session: WhatsappSession,
  text: string,
): Promise<void> {
  if (text.length === 0) {
    await sendText(from, T.supportAskBook);
    return;
  }
  await upsertNotification({
    type: "whatsapp_human_handover",
    message: `וואטסאפ: דווח שספר לא נמצא בתא — "${text}" (${from})`,
    is_read: false,
  });
  await sendText(from, T.supportReportSaved);
  return goEndLoop(from, session);
}

async function handleSupportPos(
  from: string,
  session: WhatsappSession,
  token: string,
): Promise<void> {
  if (token === BTN.toPayment) {
    await sendText(from, paymentMessage(getBotContent()));
    return goEndLoop(from, session);
  }
  if (token === BTN.finish) return goEndLoop(from, session);
  await sendReplyButtons(from, T.supportPosText, [
    { id: BTN.toPayment, title: "💳 אפשרויות תשלום" },
    { id: BTN.finish, title: "✅ סיום" },
  ]);
}

async function handleSupportOther(
  from: string,
  session: WhatsappSession,
  token: string,
): Promise<void> {
  if (token === BTN.toHuman) {
    await sendText(from, T.supportHumanInHours);
    return handover(from, session, "מענה אנושי - שאלה אחרת");
  }
  await sendReplyButtons(from, "אפשר להעביר אותך לנציג אנושי:", [
    { id: BTN.toHuman, title: "💬 מענה אנושי" },
  ]);
}

async function handleSupportQuestion(
  from: string,
  session: WhatsappSession,
  text: string,
): Promise<void> {
  if (text.length === 0) {
    await sendText(from, T.supportOffHours(getWhatsappConfig().humanHoursStart, getWhatsappConfig().humanHoursEnd));
    return;
  }
  await upsertNotification({
    type: "whatsapp_human_handover",
    message: `וואטסאפ: שאלה מחוץ לשעות מ-${from}: "${text}"`,
    is_read: false,
  });
  await sendText(from, T.supportQuestionSaved);
  return goEndLoop(from, session);
}

// ---------------------------------------------------------------------------
// מענה אנושי (Human Takeover)
// ---------------------------------------------------------------------------

async function handover(from: string, session: WhatsappSession, reason: string): Promise<void> {
  const cfg = getWhatsappConfig();
  await upsertNotification({
    type: "whatsapp_human_handover",
    message: `וואטסאפ: דרוש מענה אנושי ל-${from} (${reason})`,
    is_read: false,
  });
  const until = new Date(Date.now() + cfg.handoverTimeoutMin * 60 * 1000);
  await updateSession(session.id, {
    status: "human_handover",
    current_node: NODES.HANDOVER,
    bot_paused_until: until,
  });
}

// ---------------------------------------------------------------------------
// עזר
// ---------------------------------------------------------------------------

async function setNode(session: WhatsappSession, node: string): Promise<void> {
  await updateSession(session.id, { current_node: node });
}
