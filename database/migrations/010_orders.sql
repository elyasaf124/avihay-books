CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id         UUID NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  supplier_id     UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  order_type      order_type NOT NULL,
  quantity        INT NOT NULL CHECK (quantity > 0),
  customer_name   VARCHAR(255),
  customer_phone  VARCHAR(20),
  status          order_status NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_supplier_idx ON orders (supplier_id);
CREATE INDEX IF NOT EXISTS orders_book_idx     ON orders (book_id);
CREATE INDEX IF NOT EXISTS orders_type_idx     ON orders (order_type);
CREATE INDEX IF NOT EXISTS orders_status_idx   ON orders (status);
