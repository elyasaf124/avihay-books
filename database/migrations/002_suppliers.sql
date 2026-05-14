CREATE TABLE IF NOT EXISTS suppliers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(255) NOT NULL,
  color_hex        VARCHAR(7)   NOT NULL UNIQUE,
  email            VARCHAR(255) NOT NULL,
  last_order_date  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_color_hex_format CHECK (color_hex ~* '^#[0-9a-f]{6}$')
);
