-- ביקוש לקוח/וואטסאפ שכבר נכלל במשלוח שנקלט לא חוזר לכמות «להזמנה מספק».
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS supplier_received_at TIMESTAMPTZ;
