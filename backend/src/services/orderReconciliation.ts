import { allocateArrivedStock, type ReconcileOrderInput } from "@avihay-books/shared";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import {
  completeOrder,
  deleteOrderById,
  findOpenOrdersForBook,
  updateOrderQuantityAndResetPending,
} from "../repos/orders.repo.js";
import { restoreBookShortagesIfNoOpenOrders } from "../repos/shortageList.repo.js";
import { logger } from "../utils/logger.js";

type Queryable = Pick<PoolClient, "query">;

/**
 * מחלק כמות שהגיעה למחסן בין הזמנות פתוחות לספר — לפי עדיפות לקוח → וואטסאפ → מלאי.
 * אם מועבר `client` קיים — רץ בתוך הטרנזקציה שלו (בלי BEGIN/COMMIT עצמאי).
 */
export async function reconcileOrdersOnStockArrival(
  bookId: string,
  arrivedQty: number,
  client?: PoolClient,
): Promise<void> {
  const qty = Number(arrivedQty);
  if (!Number.isFinite(qty) || qty <= 0) return;

  if (client) {
    await applyArrivalActions(bookId, qty, client);
    return;
  }

  const own = await pool.connect();
  try {
    await own.query("BEGIN");
    await applyArrivalActions(bookId, qty, own);
    await own.query("COMMIT");
  } catch (e) {
    await own.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    own.release();
  }

  try {
    await restoreBookShortagesIfNoOpenOrders(bookId);
  } catch (e) {
    logger.warn({ err: e, bookId }, "restoreBookShortagesIfNoOpenOrders failed after reconcile");
  }
}

async function applyArrivalActions(
  bookId: string,
  arrivedQty: number,
  client: Queryable,
): Promise<void> {
  const orders = await findOpenOrdersForBook(bookId, client);
  const inputs: ReconcileOrderInput[] = orders.map((o) => ({
    id: o.id,
    order_type: o.order_type,
    quantity: Number(o.quantity),
    status: o.status,
    created_at: new Date(o.created_at).toISOString(),
  }));
  const actions = allocateArrivedStock(inputs, arrivedQty);

  for (const action of actions) {
    if (action.action === "complete") {
      await completeOrder(action.id, client);
    } else if (action.action === "delete") {
      await deleteOrderById(action.id, client);
    } else {
      await updateOrderQuantityAndResetPending(action.id, action.newQuantity, client);
    }
  }
}
