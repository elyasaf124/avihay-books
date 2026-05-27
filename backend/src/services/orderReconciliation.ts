import { allocateArrivedStock, type ReconcileOrderInput } from "@avihay-books/shared";
import { pool } from "../db/pool.js";
import {
  completeOrder,
  deleteOrderById,
  findOpenOrdersForBook,
  updateOrderQuantityAndResetPending,
} from "../repos/orders.repo.js";

/**
 * מחלק כמות שהגיעה למחסן בין הזמנות פתוחות לספר — לפי עדיפות לקוח → וואטסאפ → מלאi.
 * נקרא אחרי עלייה ב-`books.stock_quantity` (דף הוספה/הסרה).
 */
export async function reconcileOrdersOnStockArrival(
  bookId: string,
  arrivedQty: number,
): Promise<void> {
  if (arrivedQty <= 0) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orders = await findOpenOrdersForBook(bookId, client);
    const inputs: ReconcileOrderInput[] = orders.map((o) => ({
      id: o.id,
      order_type: o.order_type,
      quantity: o.quantity,
      status: o.status,
      created_at: o.created_at,
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

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
