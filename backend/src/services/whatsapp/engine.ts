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
import { getBookLocationPaths } from "../bookLocation.js";
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
  current_book_title?: string;
  books?: { title: string; quantity: number }[];
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
      } else {
        await refreshHandoverEndButton(from, session, { force: false });
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

/** מענה אנושי ידני מאפליקציית WhatsApp Business (smb_message_echoes) — השהיית הבוט. */
export async function handleStaffEcho(from: string): Promise<void> {
  let session = await findSessionByPhone(from);
  if (!session) session = await createSession(from, null);
  const cfg = getWhatsappConfig();
  const until = new Date(Date.now() + cfg.handoverTimeoutMin * 60 * 1000);
  session = await updateSession(session.id, {
    status: "human_handover",
    current_node: NODES.HANDOVER,
    bot_paused_until: until,
  });
  await refreshHandoverEndButton(from, session, { force: true });
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
  if (session.current_node.startsWith(CUSTOM_PREFIX)) {
    return handleCustomFlowButton(from, session, token);
  }
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
    const body = node.text.trim() || "בחר אפשרות:";
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
    { id: BTN.loopYes, title: "כן 👍" },
    { id: BTN.loopNo, title: "לא 👎" },
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
    await sendReplyButtonsWithNav(from, T.b1ImageFallback, [
      { id: BTN.b1ImageRetry, title: "🔄 נסה שוב" },
    ]);
    return;
  }
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
  await sendListWithNav(from, T.b1ManyMatches, "בחר ספר", rows);
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
    const locations = await getBookLocationPaths(bookId);
    const inStock = Number(book.stock_quantity) > 0;
    if (inStock) {
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
  await sendTextPrompt(from, T.askPhone);
  await transitionToNode(session, NODES.B2_PHONE, ctx);
}

async function handleB2Phone(from: string, session: WhatsappSession, text: string): Promise<void> {
  const digits = text.replace(/\D/g, "");
  if (digits.length < 7) {
    await sendTextPrompt(from, T.askPhone);
    return;
  }
  const ctx = ctxOf(session);
  ctx.customer_phone = text.trim();
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
  await sendReplyButtonsWithNav(from, T.askDeliveryMethod, [
    { id: BTN.deliveryHome, title: `🛵 עד הבית ₪${content.deliveryHomeFee}` },
    { id: BTN.deliveryPoint, title: `📦 נקודת איסוף ₪${content.deliveryPointFee}` },
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
      { id: BTN.deliveryPoint, title: `📦 נקודת איסוף ₪${content.deliveryPointFee}` },
    ]);
    return;
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
    await sendTextPrompt(
      from,
      ctx.fulfillment_type === "delivery" ? T.askNotesDelivery : T.askNotesPickup,
    );
    return setNode(session, NODES.B2_NOTES);
  }
  await sendReplyButtonsWithNav(from, T.askMore, [
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

async function checkOrderStatus(
  from: string,
  session: WhatsappSession,
  opts?: { push?: boolean },
): Promise<void> {
  const resend = opts?.push === false;
  const orders = await findActiveOrdersByPhone(from);

  if (orders.length === 0) {
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
  await sendListWithNav(from, T.b3MultipleOrders, "בחר הזמנה", rows);
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
  const content = currentBotContent();
  await sendText(from, T.closing(content.storeName));
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
    const body = flowNode.text.trim() || "בחר אפשרות:";
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
      return sendTextPrompt(from, T.askPhone);
    case NODES.B2_ADDRESS:
      return sendTextPrompt(from, T.askAddress);
    case NODES.B2_DELIVERY_METHOD:
      await sendReplyButtonsWithNav(from, T.askDeliveryMethod, [
        { id: BTN.deliveryHome, title: `🛵 עד הבית ₪${content.deliveryHomeFee}` },
        { id: BTN.deliveryPoint, title: `📦 נקודת איסוף ₪${content.deliveryPointFee}` },
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
    case NODES.B2_NOTES:
      await sendTextPrompt(
        from,
        ctx.fulfillment_type === "delivery" ? T.askNotesDelivery : T.askNotesPickup,
      );
      return;
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
        { id: BTN.loopYes, title: "כן 👍" },
        { id: BTN.loopNo, title: "לא 👎" },
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
