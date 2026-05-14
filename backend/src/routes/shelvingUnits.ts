import { Router } from "express";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import {
  findAllShelvingUnits,
  findShelvingUnitById,
} from "../repos/shelvingUnits.repo.js";
import { findShelvesBySide, findShelvesByUnit } from "../repos/shelves.repo.js";
import { findUnitSidesByUnit } from "../repos/unitSides.repo.js";
import { findCellsByShelf } from "../repos/cells.repo.js";

export const shelvingUnitsRouter = Router();

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
