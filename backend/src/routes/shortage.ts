import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import {
  deleteActiveShortageByLocationId,
  deleteShortagesInGroupById,
  findAllShortagesExpanded,
  updateShortageStatus,
  upsertShortage,
} from "../repos/shortageList.repo.js";
import {
  completeShortage,
  createShortageAfterShelfSale,
  moveShortageToOrder,
} from "../services/shortage.js";
import { invalidateStoreMapCache, invalidateStoreMapCacheForLocation } from "../services/storeMapCache.js";
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
    if (body.location_id) {
      invalidateStoreMapCacheForLocation(body.location_id);
    } else {
      invalidateStoreMapCache();
    }
    res.status(201).json(row);
  }),
);
const locationIdParamSchema = z.object({ locationId: z.string().uuid() });

shortageRouter.delete(
  "/by-location/:locationId",
  asyncHandler(async (req, res) => {
    const { locationId } = locationIdParamSchema.parse(req.params);
    const result = await deleteActiveShortageByLocationId(locationId);
    if (!result) throw new HttpError(404, "shortage_not_found");
    invalidateStoreMapCacheForLocation(locationId);
    res.json({
      still_pending: result.stillPending,
      quantity_in_cell: result.quantityInCell,
    });
  }),
);

const deleteShortageBodySchema = z.object({
  quantity: z.number().int().positive().max(9999).optional(),
});

shortageRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = deleteShortageBodySchema.parse(req.body ?? {});
    const quantity = body.quantity ?? 1;
    const { deletedCount } = await deleteShortagesInGroupById(req.params.id!, quantity);
    if (deletedCount === 0) throw new HttpError(404, "shortage_not_found");
    invalidateStoreMapCache();
    res.status(204).send();
  }),
);

shortageRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const row = await upsertShortage({ ...req.body, id: req.params.id });
    invalidateStoreMapCache();
    res.json(row);
  }),
);

const statusPatchSchema = z.object({
  status: z.enum(SHORTAGE_STATUSES),
  quantity: z.number().int().positive().max(9999).optional(),
});

shortageRouter.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const { status, quantity } = statusPatchSchema.parse(req.body);
    if (status === "completed") {
      const row = await completeShortage(req.params.id!, quantity ?? 1);
      /** קבוצה יכולה לכלול כמה `location_id` באותו תא — מרעננים את כל המפה. */
      invalidateStoreMapCache();
      res.json(row);
      return;
    }
    const row = await updateShortageStatus(req.params.id!, status);
    if (!row) throw new HttpError(404, "shortage_not_found");
    invalidateStoreMapCache();
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
    invalidateStoreMapCache();
    res.status(201).json(result);
  }),
);
