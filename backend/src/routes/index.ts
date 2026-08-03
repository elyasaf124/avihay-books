import { Router } from "express";
import { suppliersRouter } from "./suppliers.js";
import { booksRouter } from "./books.js";
import { shelvingUnitsRouter } from "./shelvingUnits.js";
import { bookLocationsRouter } from "./bookLocations.js";
import { shortageRouter } from "./shortage.js";
import { ordersRouter } from "./orders.js";
import { notificationsRouter } from "./notifications.js";
import { chatRouter } from "./chat.js";
import { devicesRouter } from "./devices.js";
import { storeMapRouter } from "./storeMap.js";
import { dashboardRouter } from "./dashboard.js";
import { appConfigRouter } from "./appConfig.js";
import { botConfigRouter } from "./botConfig.js";
import { whatsappWebhookRouter } from "./webhooks/whatsapp.js";
import { whatsappOnboardRouter } from "./whatsappOnboard.js";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";

export const apiRouter = Router();

apiRouter.get("/health", async (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Webhook של וואטסאפ — לפני apiKeyAuth (מטא מאמת בחתימה, לא ב-x-api-key).
apiRouter.use("/webhooks/whatsapp", whatsappWebhookRouter);

// Embedded Signup (Coexistence) — דף HTML + exchange (POST מוגן ב-x-api-key אם APP_API_KEY מוגדר).
apiRouter.use("/whatsapp-onboard", whatsappOnboardRouter);

apiRouter.use(apiKeyAuth);
apiRouter.use("/app-config", appConfigRouter);
apiRouter.use("/bot-config", botConfigRouter);
apiRouter.use("/dashboard", dashboardRouter);
apiRouter.use("/store-map", storeMapRouter);
apiRouter.use("/suppliers", suppliersRouter);
apiRouter.use("/books", booksRouter);
apiRouter.use("/shelving-units", shelvingUnitsRouter);
apiRouter.use("/book-locations", bookLocationsRouter);
apiRouter.use("/shortage", shortageRouter);
apiRouter.use("/orders", ordersRouter);
apiRouter.use("/notifications", notificationsRouter);
apiRouter.use("/chat", chatRouter);
apiRouter.use("/devices", devicesRouter);
