import cron, { type ScheduledTask } from "node-cron";
import {
  chatMessageRetentionInterval,
  deleteWhatsappMessagesOlderThan,
} from "../repos/whatsappMessages.repo.js";
import { logger } from "../utils/logger.js";

export interface ChatRetentionJobResult {
  deleted_count: number;
  retention: string;
  ran_at: string;
}

/** מוחק הודעות וואטסאפ ישנות מחלון ה-retention (ברירת מחדל: חודש). */
export async function runChatMessageRetentionJob(): Promise<ChatRetentionJobResult> {
  const retention = chatMessageRetentionInterval();
  const deleted_count = await deleteWhatsappMessagesOlderThan(retention);
  return { deleted_count, retention, ran_at: new Date().toISOString() };
}

const DEFAULT_CRON = "0 3 * * *";

let scheduled: ScheduledTask | null = null;

/** תזמון מחיקה יומית של הודעות צ'אט ישנות. */
export function startChatRetentionCron(): void {
  if (process.env.DISABLE_CHAT_RETENTION_CRON === "1") {
    logger.info("chat retention cron disabled via DISABLE_CHAT_RETENTION_CRON=1");
    return;
  }
  if (scheduled) return;

  const expression = process.env.CHAT_MESSAGE_RETENTION_CRON ?? DEFAULT_CRON;
  if (!cron.validate(expression)) {
    logger.warn({ expression }, "invalid CHAT_MESSAGE_RETENTION_CRON expression, falling back to default");
  }
  const safeExpression = cron.validate(expression) ? expression : DEFAULT_CRON;

  scheduled = cron.schedule(safeExpression, () => {
    runChatMessageRetentionJob()
      .then((result) => {
        if (result.deleted_count > 0) {
          logger.info(result, "chat message retention job completed");
        }
      })
      .catch((err: unknown) => {
        logger.error({ err }, "chat message retention cron tick failed");
      });
  });

  logger.info(
    { expression: safeExpression, retention: chatMessageRetentionInterval() },
    "chat message retention cron scheduled",
  );

  if (process.env.RUN_CHAT_RETENTION_ON_BOOT === "1") {
    runChatMessageRetentionJob().catch((err: unknown) => {
      logger.error({ err }, "chat retention boot job failed");
    });
  }
}

export function stopChatRetentionCron(): void {
  scheduled?.stop();
  scheduled = null;
}
