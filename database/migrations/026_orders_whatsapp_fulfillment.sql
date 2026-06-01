-- שדות זרימת ההזמנה של בוט הוואטסאפ: איסוף/משלוח, כתובת, שיטת משלוח+מחיר, הערות,
-- ו-order_group_id שמקבץ שורות של אותה הזמנה (לולאת ספרים מרובים).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fulfillment_type fulfillment_type,
  ADD COLUMN IF NOT EXISTS delivery_method  delivery_method,
  ADD COLUMN IF NOT EXISTS delivery_fee     NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS address          TEXT,
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS order_group_id   UUID;

CREATE INDEX IF NOT EXISTS orders_group_idx ON orders (order_group_id);
