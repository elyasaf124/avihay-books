import { Router } from "express";
import { suppliersRouter } from "./suppliers.js";
import { booksRouter } from "./books.js";
import { shelvingUnitsRouter } from "./shelvingUnits.js";
import { bookLocationsRouter } from "./bookLocations.js";
import { shortageRouter } from "./shortage.js";
import { ordersRouter } from "./orders.js";
import { notificationsRouter } from "./notifications.js";
import { storeMapRouter } from "./storeMap.js";
import { appConfigRouter } from "./appConfig.js";
import { whatsappWebhookRouter } from "./webhooks/whatsapp.js";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";

export const apiRouter = Router();

apiRouter.get("/health", async (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Webhook של וואטסאפ — לפני apiKeyAuth (מטא מאמת בחתימה, לא ב-x-api-key).
apiRouter.use("/webhooks/whatsapp", whatsappWebhookRouter);

apiRouter.use(apiKeyAuth);
apiRouter.use("/app-config", appConfigRouter);
apiRouter.use("/store-map", storeMapRouter);
apiRouter.use("/suppliers", suppliersRouter);
apiRouter.use("/books", booksRouter);
apiRouter.use("/shelving-units", shelvingUnitsRouter);
apiRouter.use("/book-locations", bookLocationsRouter);
apiRouter.use("/shortage", shortageRouter);
apiRouter.use("/orders", ordersRouter);
apiRouter.use("/notifications", notificationsRouter);
