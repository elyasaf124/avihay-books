import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { getStoreMap } from "../services/storeMap.js";

export const storeMapRouter = Router();

storeMapRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const map = await getStoreMap();
    res.json(map);
  }),
);
