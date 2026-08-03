import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { getDashboardStats } from "../services/dashboardStats.js";

export const dashboardRouter = Router();

dashboardRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    res.json(await getDashboardStats());
  }),
);
