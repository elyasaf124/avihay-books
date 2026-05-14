import { Router } from "express";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { findAllSuppliers, findSupplierById, upsertSupplier } from "../repos/suppliers.repo.js";

export const suppliersRouter = Router();

suppliersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await findAllSuppliers());
  }),
);

suppliersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const row = await findSupplierById(req.params.id!);
    if (!row) throw new HttpError(404, "supplier_not_found");
    res.json(row);
  }),
);

suppliersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const row = await upsertSupplier(req.body);
    res.status(201).json(row);
  }),
);

suppliersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const row = await upsertSupplier({ ...req.body, id: req.params.id });
    res.json(row);
  }),
);
