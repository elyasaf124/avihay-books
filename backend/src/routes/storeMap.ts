import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import {
  getFilteredCopyCounts,
  getStoreMap,
  getStoreMapSummary,
  getStoreMapUnit,
} from "../services/storeMap.js";

export const storeMapRouter = Router();

storeMapRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await getStoreMap());
  }),
);

storeMapRouter.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    res.json(await getStoreMapSummary());
  }),
);

const uuidParam = z.string().uuid();

storeMapRouter.get(
  "/units/:unitId",
  asyncHandler(async (req, res) => {
    const unitId = uuidParam.parse(req.params.unitId);
    const unit = await getStoreMapUnit(unitId);
    if (!unit) throw new HttpError(404, "unit_not_found");
    res.json(unit);
  }),
);

function parseCsvParam(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.trim().length === 0) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

storeMapRouter.get(
  "/copy-counts",
  asyncHandler(async (req, res) => {
    const supplierIds = parseCsvParam(req.query.supplier_ids);
    const topics = parseCsvParam(req.query.topics);
    const priceMinRaw = typeof req.query.price_min === "string" ? req.query.price_min : "";
    const priceMaxRaw = typeof req.query.price_max === "string" ? req.query.price_max : "";
    const priceMin = priceMinRaw.length > 0 ? Number(priceMinRaw) : null;
    const priceMax = priceMaxRaw.length > 0 ? Number(priceMaxRaw) : null;

    res.json(
      await getFilteredCopyCounts({
        supplierIds,
        topics,
        priceMin: priceMin != null && !Number.isNaN(priceMin) ? priceMin : null,
        priceMax: priceMax != null && !Number.isNaN(priceMax) ? priceMax : null,
      }),
    );
  }),
);
