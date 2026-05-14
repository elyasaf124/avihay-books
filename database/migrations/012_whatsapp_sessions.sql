CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number     VARCHAR(20) NOT NULL,
  intent           whatsapp_intent,
  book_title_raw   VARCHAR(255),
  book_id          UUID REFERENCES books(id) ON DELETE SET NULL,
  order_id         UUID REFERENCES orders(id) ON DELETE SET NULL,
  session_log      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_sessions_phone_idx ON whatsapp_sessions (phone_number);
