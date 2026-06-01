-- לוג הודעות וואטסאפ נכנסות/יוצאות: לביקורת, לזיהוי מענה אנושי (echo), ולתצוגה עתידית.
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number  VARCHAR(20) NOT NULL,
  direction     VARCHAR(8)  NOT NULL CHECK (direction IN ('in', 'out')),
  wa_message_id VARCHAR(128),
  msg_type      VARCHAR(32) NOT NULL DEFAULT 'text',
  body          TEXT,
  payload       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  is_echo       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_messages_phone_idx ON whatsapp_messages (phone_number, created_at DESC);
