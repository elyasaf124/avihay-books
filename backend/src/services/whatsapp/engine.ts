/**
 * מנוע השיחה של בוט הוואטסאפ (state machine) — מימוש שמונת הענפים ולולאת הסיום
 * לפי מפרט הזרימה של "נועם הספר". מצב השיחה נשמר ב-`whatsapp_sessions`
 * (`current_node` + `context`), והבוט קורא ישירות ל-`repos` הקיימים לשליפת נתונים.
 *
 * תמיכת Coexistence: כאשר נציג עונה ידנית מאפליקציית WhatsApp Business (echo) או
 * כאשר הלקוח מבקש נציג — השיחה עוברת ל-`human_handover` והבוט מושהה (`bot_paused_until`).
 */
import type { CustomFlow, FulfillmentType, DeliveryMethod, WhatsappSession } from "@avihay-books/shared";
import { logger } from "../../utils/logger.js";
import { fuzzySearchBooks, findBookById } from "../../repos/books.repo.js";
import {
  getAvailableBookLocationPaths,
  isBookAvailableForCustomer,
} from "../bookLocation.js";
import { createWhatsappOrderGroup } from "../../repos/orders.repo.js";
import { isActiveHumanHandover, notifyWhatsappHumanHandover } from "./handoverPush.js";
import {
  createSession,
  findSessionByPhone,
  updateSession,
} from "../../repos/whatsappSessions.repo.js";
import {
  currentBotContent,
  getBotConfig,
  getCachedBotConfig,
} from "../../repos/botConfig.repo.js";
import { getWhatsappConfig, isWhatsappConfigured } from "./config.js";
import {
  sendCtaUrl,
  sendDocument,
  sendListMessage,
  sendReplyButtons,
  sendText,
  type ListRow,
} from "./client.js";
import {
  BTN,
  hoursMessage,
  ORDER_EDIT,
  ORDER_EDIT_BOOK_PREFIX,
  ORDER_EDIT_BOOK_REMOVE_PREFIX,
  ORDER_STATUS_LABELS,
  paymentMessage,
  PICK_PREFIX,
  setActiveTextOverrides,
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
  B2_NOTES_ASK: "b2_notes_ask",
  B2_NOTES_TEXT: "b2_notes_text",
  B2_SUMMARY: "b2_summary",
  B2_EDIT_PICK: "b2_edit_pick",
  B2_EDIT_BOOKS: "b2_edit_books",
  B2_EDIT_BOOK_QTY: "b2_edit_book_qty",
  B8_MENU: "b8_menu",
  B8_BOOK_TITLE: "b8_book_title",
  B8_POS: "b8_pos",
  B8_OTHER: "b8_other",
  B8_OTHER_QUESTION: "b8_other_question",
  END_LOOP: "end_loop",
  HANDOVER: "handover",
  CLOSED: "closed",
} as const;

/** מצב שיחה בזרימה מותאמת אישית מקודד כ-`custom:<flowId>:<nodeId>`. */
const CUSTOM_PREFIX = "custom:";

/** שורות התפריט הראשי לפי הקונפיג השמור (פעילות בלבד, ממוינות). */
function buildMenuRows(): ListRow[] {
  return getCachedBotConfig()
    .menu_items.filter((m) => m.enabled)
    .sort((a, b) => a.order - b.order)
    .map((m) => ({
      id: m.id,
      title: m.title,
      ...(m.description ? { description: m.description } : {}),
    }));
}

/** שעות המענה האנושי מתוך הקונפיג השמור (ניתנות לעריכה באפליקציה). */
function humanHours(): { start: number; end: number } {
  const info = getCachedBotConfig().store_info;
  return { start: info.human_hours_start, end: info.human_hours_end };
}

interface Ctx {
  fulfillment_type?: FulfillmentType;
  delivery_method?: DeliveryMethod;
  delivery_fee?: number;
  customer_name?: string;
  customer_phone?: string;
  address?: string;
  order_notes?: string | null;
  current_book_title?: string;
  books?: { title: string; quantity: number }[];
  b2_return_summary?: boolean;
  edit_book_index?: number;
  edit_book_add?: boolean;
  nav_stack?: string[];
  [key: string]: unknown;
}

function getNavStack(ctx: Ctx): string[] {
  return Array.isArray(ctx.nav_stack) ? [...ctx.nav_stack] : [];
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

function isBackKeyword(norm: string): boolean {
  return ["חזור", "אחורה", "back", "/back", "שלב אחורה", "צעד אחורה"].includes(norm);
}

function findEnabledMenuItem(token: string) {
  return getCachedBotConfig().menu_items.find((m) => m.id === token && m.enabled);
}

/** מעבר לענף אחר מהתפריט — מאפס context ומנתב מחדש (גם מרשימה ישנה בצ'אט). */
async function switchToMenuItem(
  from: string,
  session: WhatsappSession,
  menuToken: string,
): Promise<void> {
  const updated = await updateSession(session.id, {
    status: "active",
    current_node: NODES.MAIN_MENU,
    context: {},
    bot_paused_until: null,
  });
  await handleMainMenu(from, updated, menuToken);
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
  const { start, end } = humanHours();
  const h = currentIsraelHour();
  return h >= start && h < end;
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

  // טעינת הקונפיג הניתן לעריכה (תפריט, תוכן, טקסטים) + הפעלת עקיפות הטקסט להודעה זו.
  const botConfig = await getBotConfig();
  setActiveTextOverrides(botConfig.text_overrides);

  let session = await findSessionByPhone(from);
  if (!session) session = await createSession(from, profileName);

  session = await updateSession(session.id, {
    touchInbound: true,
    profile_name: profileName ?? session.profile_name,
  });

  const token = inbound.replyId?.trim() ?? "";

  // מענה אנושי פעיל: הבוט שותק עד שעובר חלון ההשהיה (מלבד כפתור «סיימתי»).
  if (session.status === "human_handover") {
    const pausedUntil = session.bot_paused_until ? new Date(session.bot_paused_until).getTime() : 0;
    if (pausedUntil > Date.now()) {
      if (token === BTN.handoverEnd) {
        await endHumanHandover(from, session, "customer");
      }
      return;
    }
    session = await updateSession(session.id, {
      status: "active",
      current_node: NODES.NEW,
      context: {},
      bot_paused_until: null,
    });
  }
  const text = inbound.text?.trim() ?? "";
  const norm = normalize(text);

  if (isMenuKeyword(norm)) {
    await startMainMenu(from, session, false);
    return;
  }

  if (token === BTN.navMainMenu) {
    await startMainMenu(from, session, false);
    return;
  }

  if (token === BTN.navBack || isBackKeyword(norm)) {
    await goBackOneStep(from, session);
    return;
  }

  if (token && session.current_node !== NODES.MAIN_MENU && findEnabledMenuItem(token)) {
    await switchToMenuItem(from, session, token);
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

/** מענה אנושי ידני מאפליקציית WhatsApp Business (smb_message_echoes) או מאפליקציית הצ'אט — השהיית הבוט בלבד. */
export async function handleStaffEcho(from: string): Promise<void> {
  let session = await findSessionByPhone(from);
  if (!session) session = await createSession(from, null);
  const cfg = getWhatsappConfig();
  const until = new Date(Date.now() + cfg.handoverTimeoutMin * 60 * 1000);
  const ctx = ctxOf(session);
  session = await updateSession(session.id, {
    status: "human_handover",
    current_node: NODES.HANDOVER,
    bot_paused_until: until,
    context: { ...ctx, staff_engaged_at: new Date().toISOString() },
  });
  logger.info({ from }, "[whatsapp] staff echo — bot paused for human handover");
}

// ---------------------------------------------------------------------------
// Dispatch לפי מצב נוכחי
// ---------------------------------------------------------------------------

const MEDIA_TYPES = new Set(["image", "sticker", "video", "audio", "voice", "document"]);

async function dispatch(
  from: string,
  session: WhatsappSession,
  token: string,
  text: string,
  msgType?: string,
): Promise<void> {
  if (!token && msgType && MEDIA_TYPES.has(msgType)) {
    await sendText(from, T.mediaUnsupported);
    return;
  }
  if (session.current_node.startsWith(CUSTOM_PREFIX)) {
    return handleCustomFlowButton(from, session, token);
  }
  switch (session.current_node) {
    case NODES.MAIN_MENU:
      return handleMainMenu(from, session, token);
    case NODES.B1_TITLE:
      return handleB1Title(from, session, text);
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
    case NODES.B2_NOTES_ASK:
      return handleB2NotesAsk(from, session, token);
    case NODES.B2_NOTES_TEXT:
      return handleB2NotesText(from, session, text);
    case NODES.B2_SUMMARY:
      return handleB2Summary(from, session, token);
    case NODES.B2_EDIT_PICK:
      return handleB2EditPick(from, session, token);
    case NODES.B2_EDIT_BOOKS:
      return handleB2EditBooks(from, session, token);
    case NODES.B2_EDIT_BOOK_QTY:
      return handleB2EditBookQty(from, session, text);
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
  const content = currentBotContent();
  if (welcome) await sendText(from, T.welcome(content.storeName));
  await sendListMessage(from, T.menuPrompt, T.menuButton, buildMenuRows());
  await updateSession(session.id, {
    status: "active",
    current_node: NODES.MAIN_MENU,
    context: {},
    bot_paused_until: null,
  });
}

async function handleMainMenu(from: string, session: WhatsappSession, token: string): Promise<void> {
  const item = getCachedBotConfig().menu_items.find((m) => m.id === token && m.enabled);
  if (!item) {
    await sendListMessage(from, T.menuPrompt, T.menuButton, buildMenuRows());
    return;
  }
  if (item.type === "custom") {
    return startCustomFlow(from, session, item.flow_id ?? "");
  }

  const content = currentBotContent();
  switch (item.builtin_key) {
    case "stock":
      await sendTextPrompt(from, T.b1AskTitle);
      return setNode(session, NODES.B1_TITLE);
    case "order":
      return askOrderType(from, session);
    case "order_status":
      return checkOrderStatus(from, session);
    case "hours":
      await sendText(from, hoursMessage(content));
      if (content.wazeUrl) {
        await sendCtaUrl(from, "ניווט נוח לחנות:", "🚗 הגעה בוויז", content.wazeUrl);
      }
      return goEndLoop(from, session);
    case "payment":
      await sendText(from, paymentMessage(content));
      return goEndLoop(from, session);
    case "catalog":
      if (content.catalogPdfUrl) {
        await sendDocument(from, content.catalogPdfUrl, "catalog.pdf", T.catalogCaption);
      } else {
        await sendText(from, T.catalogMissing);
      }
      return goEndLoop(from, session);
    case "quote":
      await sendText(from, T.quoteHandover);
      return handover(from, session, "הצעת מחיר למוסדות");
    case "updates":
      await sendText(from, updatesMessage(content));
      return goEndLoop(from, session);
    case "support":
      return sendSupportMenu(from, session);
    default:
      await sendListMessage(from, T.menuPrompt, T.menuButton, buildMenuRows());
      return;
  }
}

// ---------------------------------------------------------------------------
// ענפים מותאמים אישית (Custom Flows) — נבנים מהאפליקציה, סטטיים בלבד
// ---------------------------------------------------------------------------

async function startCustomFlow(
  from: string,
  session: WhatsappSession,
  flowId: string,
): Promise<void> {
  const flow = getCachedBotConfig().custom_flows[flowId];
  if (!flow || !flow.entry_node_id) return startMainMenu(from, session, false);
  return runFlowNode(from, session, flowId, flow, flow.entry_node_id);
}

/** משלוח צעד בזרימה. צעד `buttons` ממתין לתגובה; שאר הסוגים ממשיכים לפי `after`. */
async function runFlowNode(
  from: string,
  session: WhatsappSession,
  flowId: string,
  flow: CustomFlow,
  nodeId: string,
): Promise<void> {
  const node = flow.nodes[nodeId];
  if (!node) return goEndLoop(from, session);

  if (node.type === "buttons") {
    const buttons = (node.buttons ?? [])
      .filter((b) => b.title.trim().length > 0)
      .slice(0, 3)
      .map((b) => ({ id: b.id, title: b.title }));
    if (buttons.length === 0) return goEndLoop(from, session);
    const body = node.text.trim() || "בחרו אפשרות:";
    await sendReplyButtonsWithNav(from, body, buttons);
    await transitionToNode(session, `${CUSTOM_PREFIX}${flowId}:${nodeId}`);
    return;
  }

  if (node.type === "link" && node.link_url) {
    await sendCtaUrl(from, node.text, node.link_label ?? "פתח קישור", node.link_url);
  } else if (node.type === "document" && node.document_url) {
    await sendDocument(from, node.document_url, node.document_filename ?? "file", node.text);
  } else {
    await sendText(from, node.text);
  }

  return advanceAfterNode(from, session, flowId, flow, node.after, node.next_node_id);
}

async function advanceAfterNode(
  from: string,
  session: WhatsappSession,
  flowId: string,
  flow: CustomFlow,
  after: string | undefined,
  nextNodeId: string | undefined,
): Promise<void> {
  if (after === "handover") return handover(from, session, `זרימה: ${flow.name}`);
  if (after === "next" && nextNodeId) {
    return runFlowNode(from, session, flowId, flow, nextNodeId);
  }
  return goEndLoop(from, session);
}

async function handleCustomFlowButton(
  from: string,
  session: WhatsappSession,
  token: string,
): Promise<void> {
  const rest = session.current_node.slice(CUSTOM_PREFIX.length);
  const sep = rest.indexOf(":");
  const flowId = sep >= 0 ? rest.slice(0, sep) : rest;
  const nodeId = sep >= 0 ? rest.slice(sep + 1) : "";

  const flow = getCachedBotConfig().custom_flows[flowId];
  const node = flow?.nodes[nodeId];
  if (!flow || !node || node.type !== "buttons") {
    return startMainMenu(from, session, false);
  }

  const button = (node.buttons ?? []).find((b) => b.id === token);
  if (!button) {
    // לחיצה לא מזוהה — מציגים שוב את כפתורי הצעד.
    return runFlowNode(from, session, flowId, flow, nodeId);
  }

  switch (button.action) {
    case "goto":
      if (button.target_node_id) {
        return runFlowNode(from, session, flowId, flow, button.target_node_id);
      }
      return goEndLoop(from, session);
    case "main_menu":
      return startMainMenu(from, session, false);
    case "handover":
      return handover(from, session, `זרימה: ${flow.name}`);
    case "end_loop":
    default:
      return goEndLoop(from, session);
  }
}

async function goEndLoop(from: string, session: WhatsappSession): Promise<void> {
  await sendReplyButtons(from, T.endLoopPrompt, [
    { id: BTN.loopYes, title: T.loopYesButton },
    { id: BTN.loopNo, title: T.loopNoButton },
  ]);
  const ctx = ctxOf(session);
  const stack = getNavStack(ctx);
  stack.push(session.current_node);
  await updateSession(session.id, { current_node: NODES.END_LOOP, context: { nav_stack: stack } });
}

async function handleEndLoop(from: string, session: WhatsappSession, token: string): Promise<void> {
  if (token === BTN.loopYes) return startMainMenu(from, session, false);
  if (token === BTN.loopNo) {
    const content = currentBotContent();
    await sendText(from, T.closing(content.storeName));
    await updateSession(session.id, { status: "closed", current_node: NODES.CLOSED, context: {} });
    return;
  }
  await sendReplyButtons(from, T.endLoopPrompt, [
    { id: BTN.loopYes, title: T.loopYesButton },
    { id: BTN.loopNo, title: T.loopNoButton },
  ]);
}

// ---------------------------------------------------------------------------
// ענף 1 — בירור מלאי, מחיר ומיקום
// ---------------------------------------------------------------------------

async function handleB1Title(from: string, session: WhatsappSession, text: string): Promise<void> {
  if (text.length === 0) {
    await sendTextPrompt(from, T.b1AskTitle);
    return;
  }
  const matches = await fuzzySearchBooks(text, 8);
  if (matches.length === 0) {
    await sendReplyButtonsWithNav(from, T.b1NoMatch, [
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
  await sendListWithNav(from, T.b1ManyMatches, "בחרו ספר", rows);
  return setNode(session, NODES.B1_PICK);
}

async function handleB1Pick(from: string, session: WhatsappSession, token: string): Promise<void> {
  if (token.startsWith(PICK_PREFIX) && token !== BTN.pickNone) {
    const bookId = token.slice(PICK_PREFIX.length);
    const book = await findBookById(bookId);
    if (!book) {
      await sendTextPrompt(from, T.b1AskTitle);
      return setNode(session, NODES.B1_TITLE);
    }
    const inStock = await isBookAvailableForCustomer(bookId, book.stock_quantity);
    if (inStock) {
      const locations = await getAvailableBookLocationPaths(bookId);
      const where = locations[0]?.short_path ?? "פנה לנציג בחנות";
      const msg =
        `שם הספר: ${book.title} | מחבר: ${book.author} | מחיר: ${book.price} ש"ח\n` +
        `📍 מיקום בחנות: ${where}\n` +
        "ניתן להגיע לחנות ולרכוש את הספר!";
      await sendReplyButtonsWithNav(from, msg, [
        { id: BTN.searchAgain, title: "🔄 חיפוש נוסף" },
        { id: BTN.finish, title: "✅ סיום" },
      ]);
    } else {
      const msg =
        `שם הספר: ${book.title} | מחבר: ${book.author}\n` + "סטטוס: חסר כרגע במלאי.";
      await sendReplyButtonsWithNav(from, msg, [
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
      await sendTextPrompt(from, T.b1AskTitle);
      return setNode(session, NODES.B1_TITLE);
    case BTN.finish:
      return goEndLoop(from, session);
    default:
      await sendTextPrompt(from, T.b1AskTitle);
      return setNode(session, NODES.B1_TITLE);
  }
}

// ---------------------------------------------------------------------------
// ענף 2 — הזמנה חדשה (איסוף / משלוח)
// ---------------------------------------------------------------------------

function phonePrompt(ctx: Ctx): string {
  return ctx.fulfillment_type === "delivery" ? T.askPhoneDelivery : T.askPhone;
}

function notesAskPrompt(ctx: Ctx): string {
  return ctx.fulfillment_type === "delivery" ? T.askNotesDelivery : T.askNotesPickup;
}

function notesDetailPrompt(ctx: Ctx): string {
  return ctx.fulfillment_type === "delivery" ? T.askNotesDetailDelivery : T.askNotesDetailPickup;
}

function deliveryPointButtonTitle(fee: number): string {
  return `📦 נקודת איסוף הקרובה לביתך ₪${fee}`;
}

function normalizeOrderNotes(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" || trimmed === "אין" ? null : trimmed;
}

function deliveryMethodSummaryLabel(ctx: Ctx): string {
  if (ctx.delivery_method === "home") return `עד הבית (₪${ctx.delivery_fee ?? 0})`;
  if (ctx.delivery_method === "pickup_point") return `נקודת איסוף (₪${ctx.delivery_fee ?? 0})`;
  return "—";
}

function buildOrderSummaryText(ctx: Ctx): string {
  const parts: string[] = [T.orderSummaryIntro, ""];
  parts.push(`📋 *סוג:* ${ctx.fulfillment_type === "delivery" ? "משלוח 🚚" : "איסוף עצמי 📦"}`);
  parts.push(`👤 *שם:* ${ctx.customer_name ?? "—"}`);
  parts.push(`📞 *טלפון:* ${ctx.customer_phone ?? "—"}`);
  if (ctx.fulfillment_type === "delivery") {
    parts.push(`📍 *כתובת:* ${ctx.address ?? "—"}`);
    parts.push(`🚚 *משלוח:* ${deliveryMethodSummaryLabel(ctx)}`);
  }
  parts.push("", "📚 *ספרים:*");
  for (const [i, book] of (ctx.books ?? []).entries()) {
    parts.push(`${i + 1}. «${book.title}» × ${book.quantity}`);
  }
  parts.push("", `📝 *הערות:* ${ctx.order_notes ?? "אין"}`, "", T.orderSummaryConfirmQuestion);
  return parts.join("\n");
}

function orderBooksWithTitles(ctx: Ctx): { title: string; quantity: number }[] {
  return (ctx.books ?? []).filter((b) => b.title.trim().length > 0);
}

async function showOrderSummary(
  from: string,
  session: WhatsappSession,
  ctxPatch?: Partial<Ctx>,
): Promise<void> {
  const ctx = { ...ctxOf(session), ...ctxPatch };
  if (orderBooksWithTitles(ctx).length === 0) {
    await sendTextPrompt(from, T.orderSummaryNoBooks);
    await transitionToNode(session, NODES.B2_BOOK_TITLE, ctx);
    return;
  }
  await sendReplyButtonsWithNav(from, buildOrderSummaryText(ctx), [
    { id: BTN.orderConfirm, title: "✅ אישור הזמנה" },
    { id: BTN.orderEdit, title: "✏️ עריכה" },
    { id: BTN.orderCancel, title: "❌ ביטול" },
  ]);
  await transitionToNode(session, NODES.B2_SUMMARY, ctx);
}

async function showOrderEditPickList(from: string, session: WhatsappSession): Promise<void> {
  const ctx = ctxOf(session);
  const rows: ListRow[] = [
    { id: ORDER_EDIT.type, title: "סוג הזמנה", description: ctx.fulfillment_type === "delivery" ? "משלוח" : "איסוף עצמי" },
    { id: ORDER_EDIT.name, title: "שם", description: ctx.customer_name ?? "" },
    { id: ORDER_EDIT.phone, title: "טלפון", description: ctx.customer_phone ?? "" },
  ];
  if (ctx.fulfillment_type === "delivery") {
    rows.push(
      { id: ORDER_EDIT.address, title: "כתובת", description: ctx.address ?? "" },
      { id: ORDER_EDIT.delivery, title: "סוג משלוח", description: deliveryMethodSummaryLabel(ctx) },
    );
  }
  rows.push(
    {
      id: ORDER_EDIT.books,
      title: "ספרים",
      description: `${orderBooksWithTitles(ctx).length} פריטים`,
    },
    {
      id: ORDER_EDIT.notes,
      title: "הערות",
      description: ctx.order_notes ?? "אין",
    },
  );
  await sendListWithNav(from, T.orderEditListTitle, "בחרו שדה", rows.slice(0, 10));
  await setNode(session, NODES.B2_EDIT_PICK, ctx);
}

async function showOrderEditBooksList(from: string, session: WhatsappSession): Promise<void> {
  const ctx = ctxOf(session);
  const books = orderBooksWithTitles(ctx);
  const rows: ListRow[] = books.map((book, index) => ({
    id: `${ORDER_EDIT_BOOK_PREFIX}${index}`,
    title: `📖 ${book.title}`,
    description: `כמות: ${book.quantity} — לחצו לשינוי (0 = מחיקה)`,
  }));
  rows.push({ id: ORDER_EDIT.bookAdd, title: "➕ הוסף ספר" });
  rows.push({ id: ORDER_EDIT.booksDone, title: "✔️ סיום עריכת ספרים" });
  await sendListWithNav(from, T.orderEditBooksTitle, "בחרו פעולה", rows.slice(0, 10));
  await setNode(session, NODES.B2_EDIT_BOOKS, ctx);
}

async function startOrderFieldEdit(
  from: string,
  session: WhatsappSession,
  targetNode: string,
  ctx: Ctx,
): Promise<void> {
  ctx.b2_return_summary = true;
  const content = currentBotContent();
  switch (targetNode) {
    case NODES.B2_TYPE:
      await sendReplyButtonsWithNav(from, T.orderAskType, [
        { id: BTN.orderPickup, title: "📦 איסוף עצמי" },
        { id: BTN.orderDelivery, title: "🚚 משלוח" },
      ]);
      break;
    case NODES.B2_NAME:
      await sendTextPrompt(from, T.askName);
      break;
    case NODES.B2_PHONE:
      await sendTextPrompt(from, phonePrompt(ctx));
      break;
    case NODES.B2_ADDRESS:
      await sendTextPrompt(from, T.askAddress);
      break;
    case NODES.B2_DELIVERY_METHOD:
      await sendReplyButtonsWithNav(from, T.askDeliveryMethod, [
        { id: BTN.deliveryHome, title: `🛵 עד הבית ₪${content.deliveryHomeFee}` },
        { id: BTN.deliveryPoint, title: deliveryPointButtonTitle(content.deliveryPointFee) },
      ]);
      break;
    case NODES.B2_NOTES_ASK:
      await sendNotesAsk(from, ctx);
      break;
    default:
      return showOrderSummary(from, session, ctx);
  }
  await transitionToNode(session, targetNode, ctx);
}

async function returnToOrderSummary(from: string, session: WhatsappSession, ctx: Ctx): Promise<void> {
  ctx.b2_return_summary = false;
  await showOrderSummary(from, session, ctx);
}

async function sendNotesAsk(from: string, ctx: Ctx): Promise<void> {
  await sendReplyButtonsWithNav(from, notesAskPrompt(ctx), [
    { id: BTN.notesYes, title: "כן" },
    { id: BTN.notesNo, title: "לא" },
  ]);
}

async function askOrderType(from: string, session: WhatsappSession): Promise<void> {
  await sendReplyButtonsWithNav(from, T.orderAskType, [
    { id: BTN.orderPickup, title: "📦 איסוף עצמי" },
    { id: BTN.orderDelivery, title: "🚚 משלוח" },
  ]);
  await transitionToNode(session, NODES.B2_TYPE, { books: [] }, { clearOtherContext: true });
}

async function handleB2Type(from: string, session: WhatsappSession, token: string): Promise<void> {
  const ctx = ctxOf(session);
  ctx.books = ctx.books ?? [];
  if (token === BTN.orderPickup) ctx.fulfillment_type = "pickup";
  else if (token === BTN.orderDelivery) ctx.fulfillment_type = "delivery";
  else {
    await sendReplyButtonsWithNav(from, T.orderAskType, [
      { id: BTN.orderPickup, title: "📦 איסוף עצמי" },
      { id: BTN.orderDelivery, title: "🚚 משלוח" },
    ]);
    return;
  }

  if (ctx.b2_return_summary) {
    if (ctx.fulfillment_type === "pickup") {
      delete ctx.address;
      delete ctx.delivery_method;
      delete ctx.delivery_fee;
      return returnToOrderSummary(from, session, ctx);
    }
    if (!ctx.address?.trim()) {
      await sendTextPrompt(from, T.askAddress);
      await transitionToNode(session, NODES.B2_ADDRESS, ctx);
      return;
    }
    if (!ctx.delivery_method) {
      const content = currentBotContent();
      await sendReplyButtonsWithNav(from, T.askDeliveryMethod, [
        { id: BTN.deliveryHome, title: `🛵 עד הבית ₪${content.deliveryHomeFee}` },
        { id: BTN.deliveryPoint, title: deliveryPointButtonTitle(content.deliveryPointFee) },
      ]);
      await transitionToNode(session, NODES.B2_DELIVERY_METHOD, ctx);
      return;
    }
    return returnToOrderSummary(from, session, ctx);
  }

  await sendTextPrompt(from, T.askName);
  await transitionToNode(session, NODES.B2_NAME, ctx);
}

async function handleB2Name(from: string, session: WhatsappSession, text: string): Promise<void> {
  if (text.length === 0) {
    await sendTextPrompt(from, T.askName);
    return;
  }
  const ctx = ctxOf(session);
  ctx.customer_name = text;
  if (ctx.b2_return_summary) {
    return returnToOrderSummary(from, session, ctx);
  }
  await sendTextPrompt(from, phonePrompt(ctx));
  await transitionToNode(session, NODES.B2_PHONE, ctx);
}

const ISRAELI_PHONE_DIGIT_COUNT = 10;

function isValidCustomerPhone(text: string): boolean {
  return text.replace(/\D/g, "").length === ISRAELI_PHONE_DIGIT_COUNT;
}

async function handleB2Phone(from: string, session: WhatsappSession, text: string): Promise<void> {
  if (!isValidCustomerPhone(text)) {
    await sendTextPrompt(from, T.invalidPhone);
    return;
  }
  const ctx = ctxOf(session);
  ctx.customer_phone = text.trim();
  if (ctx.b2_return_summary) {
    return returnToOrderSummary(from, session, ctx);
  }
  if (ctx.fulfillment_type === "delivery") {
    await sendTextPrompt(from, T.askAddress);
    await transitionToNode(session, NODES.B2_ADDRESS, ctx);
  } else {
    await sendTextPrompt(from, T.askBookTitle);
    await transitionToNode(session, NODES.B2_BOOK_TITLE, ctx);
  }
}

async function handleB2Address(from: string, session: WhatsappSession, text: string): Promise<void> {
  if (text.length === 0) {
    await sendTextPrompt(from, T.askAddress);
    return;
  }
  const ctx = ctxOf(session);
  const content = currentBotContent();
  ctx.address = text;
  if (ctx.b2_return_summary) {
    if (!ctx.delivery_method) {
      await sendReplyButtonsWithNav(from, T.askDeliveryMethod, [
        { id: BTN.deliveryHome, title: `🛵 עד הבית ₪${content.deliveryHomeFee}` },
        { id: BTN.deliveryPoint, title: deliveryPointButtonTitle(content.deliveryPointFee) },
      ]);
      await transitionToNode(session, NODES.B2_DELIVERY_METHOD, ctx);
      return;
    }
    return returnToOrderSummary(from, session, ctx);
  }
  await sendReplyButtonsWithNav(from, T.askDeliveryMethod, [
    { id: BTN.deliveryHome, title: `🛵 עד הבית ₪${content.deliveryHomeFee}` },
    { id: BTN.deliveryPoint, title: deliveryPointButtonTitle(content.deliveryPointFee) },
  ]);
  await transitionToNode(session, NODES.B2_DELIVERY_METHOD, ctx);
}

async function handleB2DeliveryMethod(
  from: string,
  session: WhatsappSession,
  token: string,
): Promise<void> {
  const ctx = ctxOf(session);
  const content = currentBotContent();
  if (token === BTN.deliveryHome) {
    ctx.delivery_method = "home";
    ctx.delivery_fee = content.deliveryHomeFee;
  } else if (token === BTN.deliveryPoint) {
    ctx.delivery_method = "pickup_point";
    ctx.delivery_fee = content.deliveryPointFee;
  } else {
    await sendReplyButtonsWithNav(from, T.askDeliveryMethod, [
      { id: BTN.deliveryHome, title: `🛵 עד הבית ₪${content.deliveryHomeFee}` },
      { id: BTN.deliveryPoint, title: deliveryPointButtonTitle(content.deliveryPointFee) },
    ]);
    return;
  }
  if (ctx.b2_return_summary) {
    return returnToOrderSummary(from, session, ctx);
  }
  await sendTextPrompt(from, T.askBookTitle);
  await transitionToNode(session, NODES.B2_BOOK_TITLE, ctx);
}

async function handleB2BookTitle(
  from: string,
  session: WhatsappSession,
  text: string,
): Promise<void> {
  if (text.length === 0) {
    await sendTextPrompt(from, T.askBookTitle);
    return;
  }
  const ctx = ctxOf(session);
  ctx.current_book_title = text;
  await sendTextPrompt(from, T.askQuantity);
  await transitionToNode(session, NODES.B2_BOOK_QTY, ctx);
}

async function handleB2BookQty(
  from: string,
  session: WhatsappSession,
  text: string,
): Promise<void> {
  const match = /\d+/.exec(text);
  const qty = match ? Number.parseInt(match[0], 10) : NaN;
  if (!Number.isFinite(qty) || qty <= 0) {
    await sendTextPrompt(from, T.invalidQuantity);
    return;
  }
  const ctx = ctxOf(session);
  ctx.books = ctx.books ?? [];
  if (ctx.current_book_title) {
    ctx.books.push({ title: ctx.current_book_title, quantity: qty });
  }
  ctx.current_book_title = undefined;

  if (ctx.edit_book_add) {
    ctx.edit_book_add = false;
    return returnToOrderSummary(from, session, ctx);
  }

  await sendReplyButtonsWithNav(from, T.askMore, [
    { id: BTN.moreYes, title: "כן" },
    { id: BTN.moreNo, title: "לא" },
  ]);
  await transitionToNode(session, NODES.B2_MORE, ctx);
}

async function handleB2More(from: string, session: WhatsappSession, token: string): Promise<void> {
  const ctx = ctxOf(session);
  if (token === BTN.moreYes) {
    await sendTextPrompt(from, T.askBookTitle);
    return setNode(session, NODES.B2_BOOK_TITLE);
  }
  if (token === BTN.moreNo) {
    await sendNotesAsk(from, ctx);
    return setNode(session, NODES.B2_NOTES_ASK);
  }
  await sendReplyButtonsWithNav(from, T.askMore, [
    { id: BTN.moreYes, title: "כן" },
    { id: BTN.moreNo, title: "לא" },
  ]);
}

async function handleB2NotesAsk(
  from: string,
  session: WhatsappSession,
  token: string,
): Promise<void> {
  const ctx = ctxOf(session);
  if (token === BTN.notesYes) {
    await sendTextPrompt(from, notesDetailPrompt(ctx));
    return setNode(session, NODES.B2_NOTES_TEXT);
  }
  if (token === BTN.notesNo) {
    ctx.order_notes = null;
    if (ctx.b2_return_summary) {
      return returnToOrderSummary(from, session, ctx);
    }
    return showOrderSummary(from, session, ctx);
  }
  await sendNotesAsk(from, ctx);
}

async function handleB2NotesText(
  from: string,
  session: WhatsappSession,
  text: string,
): Promise<void> {
  if (text.trim().length === 0) {
    const ctx = ctxOf(session);
    await sendTextPrompt(from, notesDetailPrompt(ctx));
    return;
  }
  const ctx = ctxOf(session);
  ctx.order_notes = normalizeOrderNotes(text);
  if (ctx.b2_return_summary) {
    return returnToOrderSummary(from, session, ctx);
  }
  return showOrderSummary(from, session, ctx);
}

async function handleB2Summary(from: string, session: WhatsappSession, token: string): Promise<void> {
  if (token === BTN.orderConfirm) {
    return finishOrder(from, session);
  }
  if (token === BTN.orderEdit) {
    return showOrderEditPickList(from, session);
  }
  if (token === BTN.orderCancel) {
    await sendText(from, T.orderCancelled);
    return startMainMenu(from, session, false);
  }
  return showOrderSummary(from, session);
}

async function handleB2EditPick(from: string, session: WhatsappSession, token: string): Promise<void> {
  const ctx = ctxOf(session);
  switch (token) {
    case ORDER_EDIT.type:
      return startOrderFieldEdit(from, session, NODES.B2_TYPE, ctx);
    case ORDER_EDIT.name:
      return startOrderFieldEdit(from, session, NODES.B2_NAME, ctx);
    case ORDER_EDIT.phone:
      return startOrderFieldEdit(from, session, NODES.B2_PHONE, ctx);
    case ORDER_EDIT.address:
      return startOrderFieldEdit(from, session, NODES.B2_ADDRESS, ctx);
    case ORDER_EDIT.delivery:
      return startOrderFieldEdit(from, session, NODES.B2_DELIVERY_METHOD, ctx);
    case ORDER_EDIT.books:
      return showOrderEditBooksList(from, session);
    case ORDER_EDIT.notes:
      return startOrderFieldEdit(from, session, NODES.B2_NOTES_ASK, ctx);
    default:
      return showOrderEditPickList(from, session);
  }
}

async function handleB2EditBooks(from: string, session: WhatsappSession, token: string): Promise<void> {
  const ctx = ctxOf(session);

  if (token === ORDER_EDIT.booksDone) {
    return showOrderSummary(from, session, ctx);
  }

  if (token === ORDER_EDIT.bookAdd) {
    ctx.edit_book_add = true;
    await sendTextPrompt(from, T.askBookTitle);
    await transitionToNode(session, NODES.B2_BOOK_TITLE, ctx);
    return;
  }

  if (token.startsWith(ORDER_EDIT_BOOK_REMOVE_PREFIX)) {
    const index = Number.parseInt(token.slice(ORDER_EDIT_BOOK_REMOVE_PREFIX.length), 10);
    if (Number.isFinite(index) && ctx.books?.[index]) {
      ctx.books.splice(index, 1);
    }
    if (orderBooksWithTitles(ctx).length === 0) {
      await sendTextPrompt(from, T.orderSummaryNoBooks);
      ctx.edit_book_add = true;
      await transitionToNode(session, NODES.B2_BOOK_TITLE, ctx);
      return;
    }
    return showOrderEditBooksList(from, session);
  }

  if (token.startsWith(ORDER_EDIT_BOOK_PREFIX)) {
    const index = Number.parseInt(token.slice(ORDER_EDIT_BOOK_PREFIX.length), 10);
    if (!Number.isFinite(index) || !ctx.books?.[index]) {
      return showOrderEditBooksList(from, session);
    }
    ctx.edit_book_index = index;
    await sendTextPrompt(from, `${T.askQuantity}\n(«${ctx.books[index]!.title}» — הקלידו 0 למחיקה)`);
    await transitionToNode(session, NODES.B2_EDIT_BOOK_QTY, ctx);
    return;
  }

  return showOrderEditBooksList(from, session);
}

async function handleB2EditBookQty(
  from: string,
  session: WhatsappSession,
  text: string,
): Promise<void> {
  const match = /\d+/.exec(text);
  const qty = match ? Number.parseInt(match[0], 10) : NaN;
  if (!Number.isFinite(qty) || qty < 0) {
    await sendTextPrompt(from, T.invalidQuantity);
    return;
  }

  const ctx = ctxOf(session);
  const index = ctx.edit_book_index;
  if (index == null || !ctx.books?.[index]) {
    delete ctx.edit_book_index;
    return showOrderEditBooksList(from, session);
  }

  if (qty === 0) {
    ctx.books.splice(index, 1);
  } else {
    ctx.books[index]!.quantity = qty;
  }
  delete ctx.edit_book_index;

  if (orderBooksWithTitles(ctx).length === 0) {
    await sendTextPrompt(from, T.orderSummaryNoBooks);
    ctx.edit_book_add = true;
    await transitionToNode(session, NODES.B2_BOOK_TITLE, ctx);
    return;
  }

  return showOrderEditBooksList(from, session);
}

async function finishOrder(from: string, session: WhatsappSession): Promise<void> {
  const ctx = ctxOf(session);
  const notes = ctx.order_notes ?? null;
  const lines = orderBooksWithTitles(ctx);

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
    await notifyWhatsappHumanHandover({
      phone: from,
      message:
        `הזמנת וואטסאפ חדשה (${ctx.fulfillment_type === "delivery" ? "משלוח" : "איסוף"}) ` +
        `מ-${ctx.customer_name ?? from} · ${lines.length} פריטים`,
      pushBody: `הזמנת וואטסאפ חדשה מ-${ctx.customer_name ?? from}`,
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

interface OrderStatusLine {
  id: string;
  order_group_id: string | null;
  status: string;
  quantity: number;
  manual_book_title: string | null;
  book_title: string | null;
  created_at: string;
}

interface OrderStatusGroup {
  groupKey: string;
  status: string;
  created_at: string;
  lines: OrderStatusLine[];
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

const ORDER_STATUS_LINE_SQL = `
  SELECT o.id,
         o.order_group_id,
         o.status,
         o.quantity,
         o.manual_book_title,
         b.title AS book_title,
         o.created_at::text
    FROM orders o
    LEFT JOIN books b ON b.id = o.book_id`;

function orderLineTitle(line: OrderStatusLine): string {
  return line.manual_book_title ?? line.book_title ?? "ספר";
}

function groupOrderStatusLines(rows: OrderStatusLine[]): OrderStatusGroup[] {
  const groups = new Map<string, OrderStatusGroup>();
  for (const row of rows) {
    const groupKey = row.order_group_id ?? row.id;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.lines.push(row);
      continue;
    }
    groups.set(groupKey, {
      groupKey,
      status: row.status,
      created_at: row.created_at,
      lines: [row],
    });
  }
  return [...groups.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function formatOrderBooksSection(lines: OrderStatusLine[]): string {
  const parts = ["📚 *ספרים:*"];
  for (const [i, line] of lines.entries()) {
    parts.push(`${i + 1}. «${orderLineTitle(line)}» × ${line.quantity}`);
  }
  return parts.join("\n");
}

function buildOrderStatusMessage(lines: OrderStatusLine[]): string {
  const status = lines[0]?.status ?? "pending";
  return (
    `מצאתי את ההזמנה שלך! 📋\n` +
    `${formatOrderBooksSection(lines)}\n` +
    `סטטוס עדכני: ${statusLabel(status)}\n\n` +
    "אם יש לך שאלות נוספות, נשמח לעזור."
  );
}

function orderGroupListTitle(group: OrderStatusGroup): string {
  if (group.lines.length === 1) {
    const title = orderLineTitle(group.lines[0]!);
    return title.length > 24 ? `${title.slice(0, 23)}…` : title;
  }
  const title = `הזמנה (${group.lines.length} ספרים)`;
  return title.length > 24 ? `${title.slice(0, 23)}…` : title;
}

function orderGroupListDescription(group: OrderStatusGroup): string {
  const qty = group.lines.reduce((sum, line) => sum + line.quantity, 0);
  const qtyLabel = qty === 1 ? "עותק 1" : `${qty} עותקים`;
  return `${formatDate(group.created_at)} · ${qtyLabel} · ${statusLabel(group.status)}`;
}

async function findActiveOrderLinesByPhone(waPhone: string): Promise<OrderStatusLine[]> {
  const variants = phoneVariants(waPhone);
  const placeholders = variants.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await pool.query<OrderStatusLine>(
    `${ORDER_STATUS_LINE_SQL}
      WHERE o.customer_phone IN (${placeholders})
        AND o.status IN ('pending', 'sent')
      ORDER BY o.created_at DESC, o.id
      LIMIT 30`,
    variants,
  );
  return rows;
}

async function findActiveOrderGroupLines(groupKey: string): Promise<OrderStatusLine[]> {
  const { rows } = await pool.query<OrderStatusLine>(
    `${ORDER_STATUS_LINE_SQL}
      WHERE COALESCE(o.order_group_id, o.id) = $1
        AND o.status IN ('pending', 'sent')
      ORDER BY o.created_at, o.id`,
    [groupKey],
  );
  return rows;
}

async function checkOrderStatus(
  from: string,
  session: WhatsappSession,
  opts?: { push?: boolean },
): Promise<void> {
  const resend = opts?.push === false;
  const groups = groupOrderStatusLines(await findActiveOrderLinesByPhone(from));

  if (groups.length === 0) {
    await sendReplyButtonsWithNav(from, T.b3NoOrders, [
      { id: BTN.statusToHuman, title: "🛠️ מענה אנושי" },
      { id: BTN.finish, title: "✅ סיום" },
    ]);
    if (resend) {
      await updateSession(session.id, { current_node: NODES.B3_STATUS });
    } else {
      await transitionToNode(session, NODES.B3_STATUS, {}, { clearOtherContext: true });
    }
    return;
  }

  if (groups.length === 1) {
    await sendText(from, buildOrderStatusMessage(groups[0]!.lines));
    return goEndLoop(from, session);
  }

  const rows = groups.map((group) => ({
    id: `${STATUS_PICK_PREFIX}${group.groupKey}`,
    title: orderGroupListTitle(group),
    description: orderGroupListDescription(group),
  }));
  await sendListWithNav(from, T.b3MultipleOrders, "בחרו הזמנה", rows);
  if (resend) {
    await updateSession(session.id, { current_node: NODES.B3_PICK });
  } else {
    await transitionToNode(session, NODES.B3_PICK, {}, { clearOtherContext: true });
  }
}

async function handleB3Status(from: string, session: WhatsappSession, token: string): Promise<void> {
  if (token === BTN.statusToHuman) {
    return handover(from, session, "בירור סטטוס הזמנה — מענה אנושי");
  }
  if (token === BTN.finish) return goEndLoop(from, session);
  await sendReplyButtonsWithNav(from, T.b3NoOrders, [
    { id: BTN.statusToHuman, title: "🛠️ מענה אנושי" },
    { id: BTN.finish, title: "✅ סיום" },
  ]);
}

async function handleB3Pick(from: string, session: WhatsappSession, token: string): Promise<void> {
  if (token.startsWith(STATUS_PICK_PREFIX)) {
    const groupKey = token.slice(STATUS_PICK_PREFIX.length);
    const lines = await findActiveOrderGroupLines(groupKey);
    if (lines.length === 0) {
      await sendText(from, "לא נמצאה הזמנה. בוא נחזור לתפריט.");
      return startMainMenu(from, session, false);
    }
    await sendText(from, buildOrderStatusMessage(lines));
    return goEndLoop(from, session);
  }
  await checkOrderStatus(from, session);
}

// ---------------------------------------------------------------------------
// ענף 8 — מענה אנושי / דיווח על תקלה
// ---------------------------------------------------------------------------

async function sendSupportMenu(
  from: string,
  session: WhatsappSession,
  opts?: { push?: boolean },
): Promise<void> {
  const resend = opts?.push === false;
  await sendReplyButtonsWithNav(from, T.supportPrompt, [
    { id: BTN.supportNotFound, title: "📕 ספר לא בתא" },
    { id: BTN.supportPos, title: "🖥️ תקלת תשלום" },
    { id: BTN.supportOther, title: "❓ שאלה אחרת" },
  ]);
  if (resend) {
    await updateSession(session.id, { current_node: NODES.B8_MENU });
  } else {
    await transitionToNode(session, NODES.B8_MENU, {}, { clearOtherContext: true });
  }
}

async function handleSupportMenu(
  from: string,
  session: WhatsappSession,
  token: string,
): Promise<void> {
  switch (token) {
    case BTN.supportNotFound:
      await sendTextPrompt(from, T.supportAskBook);
      return setNode(session, NODES.B8_BOOK_TITLE);
    case BTN.supportPos:
      await sendReplyButtonsWithNav(from, T.supportPosText, [
        { id: BTN.toPayment, title: "💳 אפשרויות תשלום" },
        { id: BTN.finish, title: "✅ סיום" },
      ]);
      await notifyWhatsappHumanHandover({
        phone: from,
        message: `וואטסאפ: דווח על תקלה בעמדת התשלום (${from})`,
        pushBody: "תקלה בעמדת התשלום",
      });
      return setNode(session, NODES.B8_POS);
    case BTN.supportOther:
      if (withinHumanHours()) {
        await sendReplyButtonsWithNav(from, "אפשר להעביר אותך לנציג אנושי:", [
          { id: BTN.toHuman, title: "💬 מענה אנושי" },
        ]);
        return setNode(session, NODES.B8_OTHER);
      }
      await sendTextPrompt(from, T.supportOffHours(humanHours().start, humanHours().end));
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
    await sendTextPrompt(from, T.supportAskBook);
    return;
  }
  await notifyWhatsappHumanHandover({
    phone: from,
    message: `וואטסאפ: דווח שספר לא נמצא בתא — "${text}" (${from})`,
    pushBody: `ספר לא בתא: ${text.slice(0, 80)}`,
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
    await sendText(from, paymentMessage(currentBotContent()));
    return goEndLoop(from, session);
  }
  if (token === BTN.finish) return goEndLoop(from, session);
  await sendReplyButtonsWithNav(from, T.supportPosText, [
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
  await sendReplyButtonsWithNav(from, "אפשר להעביר אותך לנציג אנושי:", [
    { id: BTN.toHuman, title: "💬 מענה אנושי" },
  ]);
}

async function handleSupportQuestion(
  from: string,
  session: WhatsappSession,
  text: string,
): Promise<void> {
  if (text.length === 0) {
    await sendTextPrompt(from, T.supportOffHours(humanHours().start, humanHours().end));
    return;
  }
  await notifyWhatsappHumanHandover({
    phone: from,
    message: `וואטסאפ: שאלה מחוץ לשעות מ-${from}: "${text}"`,
    pushBody: text.slice(0, 120) || "שאלה מחוץ לשעות",
  });
  await sendText(from, T.supportQuestionSaved);
  return goEndLoop(from, session);
}

// ---------------------------------------------------------------------------
// מענה אנושי (Human Takeover)
// ---------------------------------------------------------------------------

async function handover(from: string, session: WhatsappSession, reason: string): Promise<void> {
  const cfg = getWhatsappConfig();
  await notifyWhatsappHumanHandover({
    phone: from,
    profileName: session.profile_name,
    message: `וואטסאפ: דרוש מענה אנושי ל-${from} (${reason})`,
    pushBody: `דרוש מענה אנושי (${reason})`,
  });
  const until = new Date(Date.now() + cfg.handoverTimeoutMin * 60 * 1000);
  session = await updateSession(session.id, {
    status: "human_handover",
    current_node: NODES.HANDOVER,
    bot_paused_until: until,
  });
  await refreshHandoverEndButton(from, session, { force: true });
}

const HANDOVER_BUTTON_DEBOUNCE_MS = 60_000;

async function sendHandoverEndButton(from: string, opts: { repeat?: boolean } = {}): Promise<void> {
  const botConfig = await getBotConfig();
  setActiveTextOverrides(botConfig.text_overrides);
  const hint = opts.repeat ? T.handoverEndHintRepeat : T.handoverEndHint;
  await sendReplyButtons(from, hint, [{ id: BTN.handoverEnd, title: T.handoverEndButton }]);
}

/** מצמיד/מרענן כפתור «סיימתi» — בתחתית השיחה במהלך handover. */
export async function refreshHandoverEndButton(
  from: string,
  session: WhatsappSession,
  opts: { force?: boolean } = {},
): Promise<void> {
  const ctx = ctxOf(session);
  const lastAtRaw = ctx.last_handover_button_at;
  const lastAt = typeof lastAtRaw === "string" ? new Date(lastAtRaw).getTime() : 0;
  if (!opts.force && lastAt > 0 && Date.now() - lastAt < HANDOVER_BUTTON_DEBOUNCE_MS) {
    return;
  }

  await sendHandoverEndButton(from, { repeat: lastAt > 0 });
  await updateSession(session.id, {
    context: { ...ctx, last_handover_button_at: new Date().toISOString() },
  });
}

/** סיום מפורש של מענה אנושי — מעובד (אפליקציה) או לקוח (כפתור וואטסאפ). */
export async function endHumanHandover(
  from: string,
  session: WhatsappSession,
  source: "staff" | "customer",
): Promise<boolean> {
  if (!isActiveHumanHandover(session)) return false;
  if (source === "customer") {
    const content = currentBotContent();
    await sendText(from, T.closing(content.storeName));
  }
  await updateSession(session.id, {
    status: "closed",
    current_node: NODES.CLOSED,
    bot_paused_until: null,
    context: {},
  });
  logger.info({ from, source }, "[whatsapp] human handover ended");
  return true;
}

// ---------------------------------------------------------------------------
// ניווט — חזרה שלב / תפריט ראשי
// ---------------------------------------------------------------------------

async function sendNavButtons(from: string): Promise<void> {
  await sendReplyButtons(from, T.navHint, [
    { id: BTN.navBack, title: T.navBackButton },
    { id: BTN.navMainMenu, title: T.menuButton },
  ]);
}

async function sendReplyButtonsWithNav(
  from: string,
  body: string,
  buttons: { id: string; title: string }[],
): Promise<void> {
  await sendReplyButtons(from, body, buttons);
  await sendNavButtons(from);
}

async function sendListWithNav(
  from: string,
  body: string,
  buttonLabel: string,
  rows: ListRow[],
): Promise<void> {
  await sendListMessage(from, body, buttonLabel, rows);
  await sendNavButtons(from);
}

async function sendTextPrompt(from: string, body: string): Promise<void> {
  await sendText(from, body);
  await sendNavButtons(from);
}

interface TransitionOpts {
  push?: boolean;
  clearOtherContext?: boolean;
}

async function transitionToNode(
  session: WhatsappSession,
  nextNode: string,
  ctxPatch?: Partial<Ctx>,
  opts?: TransitionOpts,
): Promise<WhatsappSession> {
  const push = opts?.push !== false;
  let ctx: Ctx;

  if (opts?.clearOtherContext) {
    const stack = getNavStack(ctxOf(session));
    if (push && session.current_node !== nextNode) stack.push(session.current_node);
    ctx = { nav_stack: stack, ...ctxPatch };
  } else {
    ctx = { ...ctxOf(session), ...ctxPatch };
    if (push && session.current_node !== nextNode) {
      const stack = getNavStack(ctx);
      stack.push(session.current_node);
      ctx.nav_stack = stack;
    }
  }

  return updateSession(session.id, { current_node: nextNode, context: ctx });
}

async function goBackOneStep(from: string, session: WhatsappSession): Promise<void> {
  if (session.current_node === NODES.MAIN_MENU || session.current_node === NODES.NEW) {
    await sendText(from, T.navBackUnavailable);
    return;
  }

  const ctx = ctxOf(session);
  const stack = getNavStack(ctx);
  if (stack.length === 0) {
    await sendText(from, T.navBackUnavailable);
    return startMainMenu(from, session, false);
  }

  const prevNode = stack.pop()!;
  ctx.nav_stack = stack;
  const updated = await updateSession(session.id, { current_node: prevNode, context: ctx });
  await resendNodePrompt(from, updated);
}

async function resendNodePrompt(from: string, session: WhatsappSession): Promise<void> {
  const node = session.current_node;
  const ctx = ctxOf(session);
  const content = currentBotContent();

  if (node.startsWith(CUSTOM_PREFIX)) {
    const rest = node.slice(CUSTOM_PREFIX.length);
    const sep = rest.indexOf(":");
    const flowId = sep >= 0 ? rest.slice(0, sep) : rest;
    const nodeId = sep >= 0 ? rest.slice(sep + 1) : "";
    const flow = getCachedBotConfig().custom_flows[flowId];
    const flowNode = flow?.nodes[nodeId];
    if (!flow || !flowNode || flowNode.type !== "buttons") {
      return startMainMenu(from, session, false);
    }
    const buttons = (flowNode.buttons ?? [])
      .filter((b) => b.title.trim().length > 0)
      .slice(0, 3)
      .map((b) => ({ id: b.id, title: b.title }));
    const body = flowNode.text.trim() || "בחרו אפשרות:";
    await sendReplyButtonsWithNav(from, body, buttons);
    return;
  }

  switch (node) {
    case NODES.MAIN_MENU:
      return startMainMenu(from, session, false);
    case NODES.B1_TITLE:
      return sendTextPrompt(from, T.b1AskTitle);
    case NODES.B1_PICK:
      await sendTextPrompt(from, T.b1AskTitle);
      await updateSession(session.id, { current_node: NODES.B1_TITLE });
      return;
    case NODES.B2_TYPE:
      await sendReplyButtonsWithNav(from, T.orderAskType, [
        { id: BTN.orderPickup, title: "📦 איסוף עצמי" },
        { id: BTN.orderDelivery, title: "🚚 משלוח" },
      ]);
      return;
    case NODES.B2_NAME:
      return sendTextPrompt(from, T.askName);
    case NODES.B2_PHONE:
      return sendTextPrompt(from, phonePrompt(ctx));
    case NODES.B2_ADDRESS:
      return sendTextPrompt(from, T.askAddress);
    case NODES.B2_DELIVERY_METHOD:
      await sendReplyButtonsWithNav(from, T.askDeliveryMethod, [
        { id: BTN.deliveryHome, title: `🛵 עד הבית ₪${content.deliveryHomeFee}` },
        { id: BTN.deliveryPoint, title: deliveryPointButtonTitle(content.deliveryPointFee) },
      ]);
      return;
    case NODES.B2_BOOK_TITLE:
      return sendTextPrompt(from, T.askBookTitle);
    case NODES.B2_BOOK_QTY:
      if (!ctx.current_book_title && (ctx.books?.length ?? 0) > 0) {
        ctx.current_book_title = ctx.books![ctx.books!.length - 1]!.title;
      }
      if (!ctx.current_book_title) {
        await sendTextPrompt(from, T.askBookTitle);
        await updateSession(session.id, { current_node: NODES.B2_BOOK_TITLE, context: ctx });
        return;
      }
      return sendTextPrompt(from, T.askQuantity);
    case NODES.B2_MORE:
      await sendReplyButtonsWithNav(from, T.askMore, [
        { id: BTN.moreYes, title: "כן" },
        { id: BTN.moreNo, title: "לא" },
      ]);
      return;
    case NODES.B2_NOTES_ASK:
      await sendNotesAsk(from, ctx);
      return;
    case NODES.B2_NOTES_TEXT:
      await sendTextPrompt(from, notesDetailPrompt(ctx));
      return;
    case NODES.B2_SUMMARY:
      return showOrderSummary(from, session, ctx);
    case NODES.B2_EDIT_PICK:
      return showOrderEditPickList(from, session);
    case NODES.B2_EDIT_BOOKS:
      return showOrderEditBooksList(from, session);
    case NODES.B2_EDIT_BOOK_QTY: {
      const index = ctx.edit_book_index;
      const title = index != null ? ctx.books?.[index]?.title : undefined;
      const prompt = title
        ? `${T.askQuantity}\n(«${title}» — הקלידו 0 למחיקה)`
        : T.askQuantity;
      return sendTextPrompt(from, prompt);
    }
    case NODES.B3_STATUS:
      await sendReplyButtonsWithNav(from, T.b3NoOrders, [
        { id: BTN.statusToHuman, title: "🛠️ מענה אנושי" },
        { id: BTN.finish, title: "✅ סיום" },
      ]);
      return;
    case NODES.B3_PICK:
      return checkOrderStatus(from, session, { push: false });
    case NODES.B8_MENU:
      return sendSupportMenu(from, session, { push: false });
    case NODES.B8_BOOK_TITLE:
      return sendTextPrompt(from, T.supportAskBook);
    case NODES.B8_POS:
      await sendReplyButtonsWithNav(from, T.supportPosText, [
        { id: BTN.toPayment, title: "💳 אפשרויות תשלום" },
        { id: BTN.finish, title: "✅ סיום" },
      ]);
      return;
    case NODES.B8_OTHER:
      await sendReplyButtonsWithNav(from, "אפשר להעביר אותך לנציג אנושי:", [
        { id: BTN.toHuman, title: "💬 מענה אנושי" },
      ]);
      return;
    case NODES.B8_OTHER_QUESTION:
      await sendTextPrompt(from, T.supportOffHours(humanHours().start, humanHours().end));
      return;
    case NODES.END_LOOP:
      await sendReplyButtons(from, T.endLoopPrompt, [
        { id: BTN.loopYes, title: T.loopYesButton },
        { id: BTN.loopNo, title: T.loopNoButton },
      ]);
      return;
    default:
      return startMainMenu(from, session, false);
  }
}

// ---------------------------------------------------------------------------
// עזר
// ---------------------------------------------------------------------------

async function setNode(session: WhatsappSession, node: string, ctxPatch?: Partial<Ctx>): Promise<void> {
  await transitionToNode(session, node, ctxPatch);
}
