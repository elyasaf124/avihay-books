import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";

export interface AppConfigResponse {
  minAppVersion: string;
  latestAppVersion: string;
  updateUrl: string | null;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  featureFlags: Record<string, boolean>;
}

function parseFeatureFlags(raw: string | undefined): Record<string, boolean> {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
    );
  } catch {
    return {};
  }
}

function envFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export const appConfigRouter = Router();

appConfigRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const minAppVersion = process.env.APP_MIN_VERSION ?? "0.1.0";

    const body: AppConfigResponse = {
      minAppVersion,
      latestAppVersion: process.env.APP_LATEST_VERSION ?? minAppVersion,
      updateUrl: process.env.APP_UPDATE_URL ?? null,
      maintenanceMode: envFlag("APP_MAINTENANCE_MODE"),
      maintenanceMessage: process.env.APP_MAINTENANCE_MESSAGE ?? null,
      featureFlags: parseFeatureFlags(process.env.APP_FEATURE_FLAGS),
    };

    res.json(body);
  }),
);
