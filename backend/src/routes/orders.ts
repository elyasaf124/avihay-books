import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import {
  appendToPendingInventoryOrder,
  archiveOrdersMatchingLine,
  deleteOrdersMatchingLine,
  findAllOrdersExpanded,
  findOrderExpandedById,
  setOrdersMatchingLineQuantity,
  updateOrdersMatchingLineStatus,
  updateOrdersBySupplierStatus,
  upsertOrder,
} from "../repos/orders.repo.js";
import {
  markBookShortagesAsOrderPending,
  restoreBookShortagesIfNoOpenOrders,
} from "../repos/shortageList.repo.js";
import { ORDER_TYPES, type OrderType } from "@avihay-books/shared";
import { getWhatsappConfig, isWhatsappConfigured } from "../services/whatsapp/config.js";
import { sendTemplate } from "../services/whatsapp/client.js";

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
    const body = req.body ?? {};
    const isInventoryWithoutCustomer =
      body.order_type === "inventory" && !body.customer_name && !body.customer_phone;
    const order = isInventoryWithoutCustomer
      ? await appendToPendingInventoryOrder(body)
      : await upsertOrder(body);
    if (order.book_id && (order.status === "pending" || order.status === "sent")) {
      await markBookShortagesAsOrderPending(order.book_id);
    }
    res.status(201).json(order);
  }),
);

ordersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const order = await upsertOrder({ ...req.body, id: req.params.id });
    if (order.book_id && (order.status === "pending" || order.status === "sent")) {
      await markBookShortagesAsOrderPending(order.book_id);
    } else if (order.book_id) {
      await restoreBookShortagesIfNoOpenOrders(order.book_id);
    }
    res.json(order);
  }),
);

const orderLineMatchBodySchema = z
  .object({
    book_id: z.string().uuid().nullable(),
    manual_book_title: z.string().max(500).nullable().optional(),
    supplier_id: z.string().uuid().nullable(),
    order_type: z.enum(ORDER_TYPES),
    customer_name: z.string().max(255).nullable().optional(),
    customer_phone: z.string().max(20).nullable().optional(),
  })
  .superRefine((body, ctx) => {
    const bid = body.book_id ?? null;
    const manual = body.manual_book_title?.trim() ?? "";
    if (!bid && !manual) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["book_id"],
        message: "remove_line_requires_book_or_manual",
      });
    }
    if (bid && manual) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["manual_book_title"],
        message: "remove_line_book_xor_manual",
      });
    }
  });

const removeLineBodySchema = orderLineMatchBodySchema;

const setLineStatusBodySchema = orderLineMatchBodySchema.and(
  z.object({ status: z.enum(["pending", "sent"]) }),
);

const setLineQuantityBodySchema = orderLineMatchBodySchema.and(
  z.object({
    quantity: z.number().int().positive(),
    manual_book_author: z.string().max(255).nullable().optional(),
  }),
);

ordersRouter.post(
  "/remove-line",
  asyncHandler(async (req, res) => {
    const body = removeLineBodySchema.parse(req.body ?? {});
    const manualNorm =
      body.book_id != null ? null : body.manual_book_title?.trim() ? body.manual_book_title.trim() : null;
    const n = await deleteOrdersMatchingLine({
      book_id: body.book_id,
      supplier_id: body.supplier_id,
      order_type: body.order_type,
      customer_name: body.customer_name ?? null,
      customer_phone: body.customer_phone ?? null,
      manual_book_title: manualNorm,
    });
    if (n < 1) throw new HttpError(404, "orders_line_not_found");
    if (body.book_id) {
      await restoreBookShortagesIfNoOpenOrders(body.book_id);
    }
    res.json({ deleted: n });
  }),
);

ordersRouter.post(
  "/archive-line",
  asyncHandler(async (req, res) => {
    const body = removeLineBodySchema.parse(req.body ?? {});
    const manualNorm =
      body.book_id != null ? null : body.manual_book_title?.trim() ? body.manual_book_title.trim() : null;
    const n = await archiveOrdersMatchingLine({
      book_id: body.book_id,
      supplier_id: body.supplier_id,
      order_type: body.order_type,
      customer_name: body.customer_name ?? null,
      customer_phone: body.customer_phone ?? null,
      manual_book_title: manualNorm,
    });
    if (n < 1) throw new HttpError(404, "orders_line_not_found");
    res.json({ archived: n });
  }),
);

ordersRouter.post(
  "/set-line-quantity",
  asyncHandler(async (req, res) => {
    const body = setLineQuantityBodySchema.parse(req.body ?? {});
    const manualNorm =
      body.book_id != null ? null : body.manual_book_title?.trim() ? body.manual_book_title.trim() : null;
    const result = await setOrdersMatchingLineQuantity(
      {
        book_id: body.book_id,
        supplier_id: body.supplier_id,
        order_type: body.order_type,
        customer_name: body.customer_name ?? null,
        customer_phone: body.customer_phone ?? null,
        manual_book_title: manualNorm,
      },
      body.quantity,
      {
        createIfMissing: body.order_type === "inventory",
        manual_book_author:
          body.book_id != null
            ? null
            : body.manual_book_author?.trim()
              ? body.manual_book_author.trim()
              : null,
      },
    );
    if (result.updated < 1 && !result.created) throw new HttpError(404, "orders_line_not_found");
    if (body.book_id && result.created) {
      await markBookShortagesAsOrderPending(body.book_id);
    }
    res.json(result);
  }),
);

ordersRouter.post(
  "/set-line-status",
  asyncHandler(async (req, res) => {
    const body = setLineStatusBodySchema.parse(req.body ?? {});
    const manualNorm =
      body.book_id != null ? null : body.manual_book_title?.trim() ? body.manual_book_title.trim() : null;
    const n = await updateOrdersMatchingLineStatus(
      {
        book_id: body.book_id,
        supplier_id: body.supplier_id,
        order_type: body.order_type,
        customer_name: body.customer_name ?? null,
        customer_phone: body.customer_phone ?? null,
        manual_book_title: manualNorm,
      },
      body.status,
    );
    if (n < 1) throw new HttpError(404, "orders_line_not_found");
    res.json({ updated: n });
  }),
);

const setSupplierStatusBodySchema = z.object({
  supplier_id: z.string().uuid().nullable(),
  status: z.enum(["pending", "sent"]),
});

ordersRouter.post(
  "/set-supplier-status",
  asyncHandler(async (req, res) => {
    const body = setSupplierStatusBodySchema.parse(req.body ?? {});
    const n = await updateOrdersBySupplierStatus(body.supplier_id, body.status);
    if (n < 1) throw new HttpError(404, "orders_supplier_not_found");
    res.json({ updated: n });
  }),
);

/**
 * שליחת עדכון יזום ללקוח בוואטסאפ (Template מאושר ב-Meta):
 *   - `order_ready` — הספר הגיע / מוכן לאיסוף.
 * אפשרויות תשלום נשלחות דרך ענף «אפשרויות תשלום» בבוט (לא דרך template).
 */
const notifyCustomerBodySchema = z.object({
  template: z.enum(["order_ready"]).default("order_ready"),
});

ordersRouter.post(
  "/:id/notify-customer",
  asyncHandler(async (req, res) => {
    const body = notifyCustomerBodySchema.parse(req.body ?? {});
    const order = await findOrderExpandedById(req.params.id!);
    if (!order) throw new HttpError(404, "order_not_found");
    if (!order.customer_phone) throw new HttpError(400, "order_missing_customer_phone");

    const cfg = getWhatsappConfig();
    if (!isWhatsappConfigured(cfg)) throw new HttpError(503, "whatsapp_not_configured");

    const bookTitle = order.book_title || order.manual_book_title || "הספר שהזמנת";
    const customerName = order.customer_name ?? "";

    await sendTemplate(order.customer_phone, cfg.templateOrderReady, cfg.templateLang, {
      bodyParams: [customerName, bookTitle],
    });

    res.json({ sent: true });
  }),
);
