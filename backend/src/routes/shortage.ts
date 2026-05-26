import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import {
  deleteActiveShortageByLocationId,
  deleteShortageById,
  findAllShortagesExpanded,
  updateShortageStatus,
  upsertShortage,
} from "../repos/shortageList.repo.js";
import {
  completeShortage,
  createShortageAfterShelfSale,
  moveShortageToOrder,
} from "../services/shortage.js";
import { ORDER_TYPES, SHORTAGE_STATUSES } from "@avihay-books/shared";

export const shortageRouter = Router();

shortageRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await findAllShortagesExpanded());
  }),
);

const createShortageBodySchema = z.object({
  book_id: z.string().uuid(),
  sold_quantity: z.number().int().positive().max(9999).optional(),
  location_id: z.string().uuid().optional(),
});

shortageRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createShortageBodySchema.parse(req.body ?? {});
    const row = await createShortageAfterShelfSale({
      bookId: body.book_id,
      soldQuantity: body.sold_quantity ?? 1,
      locationId: body.location_id,
    });
    res.status(201).json(row);
  }),
);
const locationIdParamSchema = z.object({ locationId: z.string().uuid() });

shortageRouter.delete(
  "/by-location/:locationId",
  asyncHandler(async (req, res) => {
    const { locationId } = locationIdParamSchema.parse(req.params);
    const ok = await deleteActiveShortageByLocationId(locationId);
    if (!ok) throw new HttpError(404, "shortage_not_found");
    res.status(204).send();
  }),
);

shortageRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const ok = await deleteShortageById(req.params.id!);
    if (!ok) throw new HttpError(404, "shortage_not_found");
    res.status(204).send();
  }),
);

shortageRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await upsertShortage({ ...req.body, id: req.params.id }));
  }),
);

const statusPatchSchema = z.object({ status: z.enum(SHORTAGE_STATUSES) });

shortageRouter.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const { status } = statusPatchSchema.parse(req.body);
    if (status === "completed") {
      res.json(await completeShortage(req.params.id!));
      return;
    }
    const row = await updateShortageStatus(req.params.id!, status);
    if (!row) throw new HttpError(404, "shortage_not_found");
    res.json(row);
  }),
);

const moveToOrderSchema = z.object({
  quantity: z.number().int().positive().optional(),
  order_type: z.enum(ORDER_TYPES).optional(),
});

shortageRouter.post(
  "/:id/move-to-order",
  asyncHandler(async (req, res) => {
    const body = moveToOrderSchema.parse(req.body ?? {});
    const result = await moveShortageToOrder({
      shortageId: req.params.id!,
      quantity: body.quantity,
      orderType: body.order_type,
    });
    res.status(201).json(result);
  }),
);
