import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  deleteBookLocation,
  findBookLocationById,
  findBookLocationsByBook,
  upsertBookLocation,
} from "../repos/bookLocations.repo.js";
import {
  clearShortageForRestockedCell,
  ensureShortageForEmptyCell,
} from "../services/shortage.js";
import { setLocationShelfStock } from "../services/shelfStock.js";
import { invalidateStoreMapCache } from "../services/storeMapCache.js";
import { logger } from "../utils/logger.js";

export const bookLocationsRouter = Router();

const shelfStockBodySchema = z.object({
  shelf_stock: z.number().int().min(0).max(9999),
});

bookLocationsRouter.get(
  "/book/:bookId",
  asyncHandler(async (req, res) => {
    res.json(await findBookLocationsByBook(req.params.bookId!));
  }),
);

bookLocationsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const row = await upsertBookLocation(req.body);
    invalidateStoreMapCache();
    res.status(201).json(row);
  }),
);

/** סנכרון מלאי מדף לתצוגת ארון (שדרות = qty + חוסרים). */
bookLocationsRouter.patch(
  "/:id/shelf-stock",
  asyncHandler(async (req, res) => {
    const locationId = req.params.id!;
    const { shelf_stock } = shelfStockBodySchema.parse(req.body);
    const row = await setLocationShelfStock(locationId, shelf_stock);
    invalidateStoreMapCache();
    res.json(row);
  }),
);

bookLocationsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const locationId = req.params.id!;
    const before = await findBookLocationById(locationId);
    if (!before) {
      res.status(404).json({ error: "location_not_found" });
      return;
    }

    const requestedQty =
      typeof req.body?.quantity_in_cell === "number" ? req.body.quantity_in_cell : null;
    if (
      requestedQty != null &&
      requestedQty > before.quantity_in_cell &&
      requestedQty > before.shelf_stock
    ) {
      res.status(400).json({
        error: "quantity_above_shelf_stock",
        details: { shelf_stock: before.shelf_stock, quantity_in_cell: before.quantity_in_cell },
      });
      return;
    }

    const row = await upsertBookLocation({ ...req.body, id: locationId });
    invalidateStoreMapCache();

    const oldQty = before.quantity_in_cell;
    const newQty = row.quantity_in_cell;
    if (oldQty != null && oldQty > 0 && newQty === 0) {
      await ensureShortageForEmptyCell({ bookId: row.book_id, locationId: row.id }).catch(
        (err: unknown) => {
          logger.error({ err, locationId: row.id }, "ensureShortageForEmptyCell failed");
        },
      );
    } else if (oldQty === 0 && newQty > 0) {
      await clearShortageForRestockedCell(row.id).catch((err: unknown) => {
        logger.error({ err, locationId: row.id }, "clearShortageForRestockedCell failed");
      });
    }

    res.json(row);
  }),
);

bookLocationsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await deleteBookLocation(req.params.id!);
    invalidateStoreMapCache();
    res.status(204).end();
  }),
);
