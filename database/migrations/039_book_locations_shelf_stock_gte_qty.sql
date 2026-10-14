-- יעד שדרות לא יכול להיות נמוך מהכמות הפיזית בתא.
-- שורות שנוצרו ממיזוג עותקים בלי עדכון `shelf_stock` גרמו להעלמת שדרה בסימון חוסר.
UPDATE book_locations
   SET shelf_stock = quantity_in_cell
 WHERE shelf_stock < quantity_in_cell;

ALTER TABLE book_locations
  DROP CONSTRAINT IF EXISTS book_locations_shelf_stock_gte_qty;

ALTER TABLE book_locations
  ADD CONSTRAINT book_locations_shelf_stock_gte_qty
  CHECK (shelf_stock >= quantity_in_cell);
