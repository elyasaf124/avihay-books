import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

/** בפרודקשן ללא `TTY`, פלט אסינכרוני של `pino` עלול להיסגר בבופר של `Docker`/`npm` ולא להופיע בלוג של Render עד מאוחר מאוד. */
export const logger = isDev
  ? pino({
      level: process.env.LOG_LEVEL ?? "info",
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      },
    })
  : pino({ level: process.env.LOG_LEVEL ?? "info" }, pino.destination({ sync: true }));
