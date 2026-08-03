-- הרחבת whatsapp_sessions ל-state machine של מנוע השיחה.
ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS status           whatsapp_session_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS current_node     VARCHAR(64)  NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS context          JSONB        NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS profile_name     VARCHAR(255),
  ADD COLUMN IF NOT EXISTS bot_paused_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_inbound_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS whatsapp_sessions_status_idx ON whatsapp_sessions (status);
