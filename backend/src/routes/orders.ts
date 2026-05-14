import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import {
  deleteOrdersMatchingLine,
  findAllOrdersExpanded,
  upsertOrder,
} from "../repos/orders.repo.js";
import { ORDER_TYPES, type OrderType } from "@avihay-books/shared";

export const ordersRouter = Router();

ordersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const t = typeof req.query.type === "string" ? req.query.type : "";
    const type = ORDER_TYPES.includes(t as OrderType) ? (t as OrderType) : undefined;
    res.json(await findAllOrdersExpanded(type ? { type } : {}));
  }),
);

ordersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    res.status(201).json(await upsertOrder(req.body));
  }),
);

ordersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await upsertOrder({ ...req.body, id: req.params.id }));
  }),
);

const removeLineBodySchema = z.object({
  book_id: z.string().uuid(),
  supplier_id: z.string().uuid(),
  order_type: z.enum(ORDER_TYPES),
  customer_name: z.string().max(255).nullable().optional(),
  customer_phone: z.string().max(20).nullable().optional(),
});

ordersRouter.post(
  "/remove-line",
  asyncHandler(async (req, res) => {
    const body = removeLineBodySchema.parse(req.body ?? {});
    const n = await deleteOrdersMatchingLine({
      book_id: body.book_id,
      supplier_id: body.supplier_id,
      order_type: body.order_type,
      customer_name: body.customer_name ?? null,
      customer_phone: body.customer_phone ?? null,
    });
    if (n < 1) throw new HttpError(404, "orders_line_not_found");
    res.json({ deleted: n });
  }),
);
