import type { RequestHandler } from "express";
import { HttpError } from "./errorHandler.js";

export const apiKeyAuth: RequestHandler = (req, _res, next) => {
  const expectedKey = process.env.APP_API_KEY;
  if (!expectedKey) {
    next();
    return;
  }

  const providedKey = req.header("x-api-key");
  if (providedKey !== expectedKey) {
    next(new HttpError(401, "unauthorized"));
    return;
  }

  next();
};
