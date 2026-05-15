import "./config/loadEnv.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { logger } from "./utils/logger.js";
import { startNotificationCrons } from "./services/notifications.js";

const app = express();

/** ראשון ברשימה — כל בקשה שמגיעה ל־Node תופיע בלוג (כולל לפני `helmet` / `cors`). */
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.originalUrl }, "incoming http");
  next();
});

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN === "*" ? true : (process.env.CORS_ORIGIN ?? "*").split(","),
  }),
);
app.use(express.json({ limit: "1mb" }));

app.use("/api/v1", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);

const port = Number.parseInt(process.env.PORT ?? "4000", 10);
app.listen(port, "0.0.0.0", () => {
  logger.info(`avihay-books API listening on http://localhost:${port}/api/v1`);
  startNotificationCrons();
});
