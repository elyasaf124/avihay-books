import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import {
  findAllShelvingUnits,
  findShelvingUnitById,
} from "../repos/shelvingUnits.repo.js";
import { findShelvesBySide, findShelvesByUnit } from "../repos/shelves.repo.js";
import { findUnitSidesByUnit } from "../repos/unitSides.repo.js";
import { ensureCellOnShelf, findCellsByShelf } from "../repos/cells.repo.js";
import { invalidateStoreMapCache } from "../services/storeMapCache.js";

export const shelvingUnitsRouter = Router();

const ensureCellBodySchema = z.object({
  cell_name: z.string().min(1).max(20),
  cell_number: z.number().int().min(1).optional(),
  capacity: z.number().int().min(1).optional(),
});

shelvingUnitsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await findAllShelvingUnits());
  }),
);

shelvingUnitsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const unit = await findShelvingUnitById(req.params.id!);
    if (!unit) throw new HttpError(404, "shelving_unit_not_found");
    res.json(unit);
  }),
);

shelvingUnitsRouter.get(
  "/:id/sides",
  asyncHandler(async (req, res) => {
    res.json(await findUnitSidesByUnit(req.params.id!));
  }),
);

shelvingUnitsRouter.get(
  "/:id/shelves",
  asyncHandler(async (req, res) => {
    res.json(await findShelvesByUnit(req.params.id!));
  }),
);

shelvingUnitsRouter.get(
  "/sides/:sideId/shelves",
  asyncHandler(async (req, res) => {
    res.json(await findShelvesBySide(req.params.sideId!));
  }),
);

shelvingUnitsRouter.get(
  "/shelves/:shelfId/cells",
  asyncHandler(async (req, res) => {
    res.json(await findCellsByShelf(req.params.shelfId!));
  }),
);

/** יצירת / הבטחת תא במדף — לתאים שלא נוצרו בייבוא כי היו ריקים. */
shelvingUnitsRouter.post(
  "/shelves/:shelfId/cells",
  asyncHandler(async (req, res) => {
    const body = ensureCellBodySchema.parse(req.body);
    const cell = await ensureCellOnShelf({
      shelf_id: req.params.shelfId!,
      cell_name: body.cell_name,
      cell_number: body.cell_number,
      capacity: body.capacity,
    });
    invalidateStoreMapCache();
    res.status(201).json(cell);
  }),
);
