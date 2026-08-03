import "./config/loadEnv.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { logger } from "./utils/logger.js";
import { startNotificationCrons } from "./services/notifications.js";
import { startChatRetentionCron } from "./services/chatRetention.js";

const app = express();

/** CSP מותאם ל-Embedded Signup — FB JS SDK + inline scripts בדף onboarding בלבד. */
const onboardHelmet = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://connect.facebook.net"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      frameSrc: ["https://www.facebook.com", "https://web.facebook.com", "https://facebook.com"],
      connectSrc: [
        "'self'",
        "https://graph.facebook.com",
        "https://www.facebook.com",
        "https://connect.facebook.net",
      ],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
});

const defaultHelmet = helmet();

app.use((req, res, next) => {
  if (req.headers["access-control-request-private-network"] === "true") {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  next();
});
app.use((req, res, next) => {
  if (req.path.startsWith("/api/v1/whatsapp-onboard")) {
    onboardHelmet(req, res, next);
  } else {
    defaultHelmet(req, res, next);
  }
});
app.use(
  cors({
    origin: process.env.CORS_ORIGIN === "*" ? true : (process.env.CORS_ORIGIN ?? "*").split(","),
  }),
);
app.use(
  express.json({
    limit: "1mb",
    // שומרים את ה-raw body לאימות חתימת ה-webhook של וואטסאפ (X-Hub-Signature-256).
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);

// קובץ אימות דומיין Meta — חייב בשורש הדומיין, לא תחת /api/v1.
app.get("/pdgafdeygab26oizzs23rjapiqcxgx.html", (_req, res) => {
  res.type("text/html").send("pdgafdeygab26oizzs23rjapiqcxgx");
});

app.use("/api/v1", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);

const port = Number.parseInt(process.env.PORT ?? "4000", 10);
app.listen(port, "0.0.0.0", () => {
  logger.info(`avihay-books API listening on http://localhost:${port}/api/v1`);
  startNotificationCrons();
  startChatRetentionCron();
});
