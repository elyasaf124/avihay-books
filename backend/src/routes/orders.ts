import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import {
  appendToPendingInventoryOrder,
  archiveOrdersMatchingLine,
  deleteOrdersMatchingLine,
  findAllOrdersExpanded,
  findOrderExpandedById,
  updateOrdersMatchingLineStatus,
  updateOrdersBySupplierStatus,
  upsertOrder,
} from "../repos/orders.repo.js";
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
    res.status(201).json(
      isInventoryWithoutCustomer
        ? await appendToPendingInventoryOrder(body)
        : await upsertOrder(body),
    );
  }),
);

ordersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await upsertOrder({ ...req.body, id: req.params.id }));
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
 *   - `order_ready`  — הספר הגיע / מוכן לאיסוף.
 *   - `payment_link` — קישור תשלום מאובטח (דורש `paymentUrl`).
 * עובד גם מחוץ לחלון 24 השעות כי משתמשים ב-Templates.
 */
const notifyCustomerBodySchema = z.object({
  template: z.enum(["order_ready", "payment_link"]).default("order_ready"),
  paymentUrl: z.string().url().optional(),
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

    if (body.template === "payment_link") {
      if (!body.paymentUrl) throw new HttpError(400, "payment_url_required");
      await sendTemplate(order.customer_phone, cfg.templatePaymentLink, cfg.templateLang, {
        bodyParams: [customerName, bookTitle],
        urlButtonParam: body.paymentUrl,
      });
    } else {
      await sendTemplate(order.customer_phone, cfg.templateOrderReady, cfg.templateLang, {
        bodyParams: [customerName, bookTitle],
      });
    }

    res.json({ sent: true });
  }),
);
