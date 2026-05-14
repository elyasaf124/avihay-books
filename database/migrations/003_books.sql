CREATE TABLE IF NOT EXISTS books (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               VARCHAR(255) NOT NULL,
  author              VARCHAR(255) NOT NULL,
  supplier_id         UUID         NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  price               NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  stock_quantity      INT          NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  reorder_threshold   INT          NOT NULL DEFAULT 0 CHECK (reorder_threshold >= 0),
  is_new              BOOLEAN      NOT NULL DEFAULT FALSE,
  added_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  topic               VARCHAR(100) NOT NULL DEFAULT '',
  is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS books_supplier_idx ON books (supplier_id);
CREATE INDEX IF NOT EXISTS books_active_idx   ON books (is_active);
CREATE INDEX IF NOT EXISTS books_title_idx    ON books (title);
