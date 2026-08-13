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
  findLocationWithPendingShortageCount,
  setLocationQuantityInCell,
  setLocationShelfStock,
  syncLocationDisplayToShelfStock,
} from "../services/shelfStock.js";
import { invalidateStoreMapCache } from "../services/storeMapCache.js";

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
    await syncLocationDisplayToShelfStock(row.id);
    invalidateStoreMapCache();
    const expanded = await findLocationWithPendingShortageCount(row.id);
    res.status(201).json(expanded ?? row);
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
    if (requestedQty != null && requestedQty > before.shelf_stock) {
      res.status(400).json({
        error: "quantity_above_shelf_stock",
        details: { shelf_stock: before.shelf_stock, quantity_in_cell: before.quantity_in_cell },
      });
      return;
    }

    const sameCell =
      (req.body?.cell_id == null || req.body.cell_id === before.cell_id) &&
      (req.body?.position_in_cell == null || req.body.position_in_cell === before.position_in_cell) &&
      (req.body?.book_id == null || req.body.book_id === before.book_id);

    if (requestedQty != null && sameCell) {
      const row = await setLocationQuantityInCell(locationId, requestedQty);
      invalidateStoreMapCache();
      res.json(row);
      return;
    }

    const row = await upsertBookLocation({ ...req.body, id: locationId });
    await syncLocationDisplayToShelfStock(row.id);
    invalidateStoreMapCache();
    const expanded = await findLocationWithPendingShortageCount(row.id);
    res.json(expanded ?? row);
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
