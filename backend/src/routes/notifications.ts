import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  deleteNotification,
  findAllNotificationsExpanded,
  findUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  upsertNotification,
} from "../repos/notifications.repo.js";
import { runAllNotificationChecks } from "../services/notifications.js";

export const notificationsRouter = Router();

notificationsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await findAllNotificationsExpanded());
  }),
);

notificationsRouter.get(
  "/unread-count",
  asyncHandler(async (_req, res) => {
    res.json({ count: await findUnreadNotificationCount() });
  }),
);

notificationsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    res.status(201).json(await upsertNotification(req.body));
  }),
);

notificationsRouter.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    await markNotificationRead(req.params.id!);
    res.status(204).end();
  }),
);

notificationsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const ok = await deleteNotification(req.params.id!);
    if (!ok) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.status(204).end();
  }),
);

notificationsRouter.post(
  "/mark-all-read",
  asyncHandler(async (_req, res) => {
    const updated = await markAllNotificationsRead();
    res.json({ updated });
  }),
);

/**
 * הפעלת ידנית של שלוש בדיקות ה־`cron` — שימושית לפיתוח/בדיקות,
 * וגם כ־endpoint שאפשר לקרוא לו מ־`refresh` במסך התראות.
 */
notificationsRouter.post(
  "/run-checks",
  asyncHandler(async (_req, res) => {
    const summary = await runAllNotificationChecks();
    res.json(summary);
  }),
);
