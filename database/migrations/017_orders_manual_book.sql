-- הזמנות לקוח / וואטסאפ לספר שאינו בקטלוג: ללא book_id, עם כותרת/מחבר ידניים.
ALTER TABLE orders ALTER COLUMN book_id DROP NOT NULL;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS manual_book_title VARCHAR(500) NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS manual_book_author VARCHAR(255) NULL;

ALTER TABLE orders ADD CONSTRAINT orders_book_or_manual_chk CHECK (
  (book_id IS NOT NULL AND (
    manual_book_title IS NULL OR trim(manual_book_title) = ''
  ))
  OR
  (book_id IS NULL AND manual_book_title IS NOT NULL AND trim(manual_book_title) <> '')
);
