-- Allow orders without an assigned supplier (e.g. customer demand when supplier is unknown).
ALTER TABLE orders ALTER COLUMN supplier_id DROP NOT NULL;
