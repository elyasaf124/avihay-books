/** רישום טוקני Expo Push של מכשירי העובדים — להתראות מרחוק על הודעות צ'אט. */
import { Router } from "express";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { upsertPushToken } from "../repos/pushTokens.repo.js";

export const devicesRouter = Router();

devicesRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const token = typeof req.body?.expo_token === "string" ? req.body.expo_token.trim() : "";
    const platform = typeof req.body?.platform === "string" ? req.body.platform : null;
    if (token.length === 0) {
      throw new HttpError(400, "expo_token is required");
    }
    await upsertPushToken(token, platform);
    res.status(204).end();
  }),
);
