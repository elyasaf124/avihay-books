import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  deleteBookLocation,
  findBookLocationsByBook,
  upsertBookLocation,
} from "../repos/bookLocations.repo.js";
import { invalidateStoreMapCache } from "../services/storeMapCache.js";

export const bookLocationsRouter = Router();

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

bookLocationsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const row = await upsertBookLocation({ ...req.body, id: req.params.id });
    invalidateStoreMapCache();
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
