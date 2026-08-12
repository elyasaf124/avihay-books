-- Target permanent shelf stock per book_location (independent of live quantity_in_cell).
ALTER TABLE book_locations
  ADD COLUMN IF NOT EXISTS shelf_stock INT NOT NULL DEFAULT 0
  CHECK (shelf_stock >= 0);

-- Seed from current cabinet state: physical copies + open shortages (ghost spines).
UPDATE book_locations bl
SET shelf_stock = bl.quantity_in_cell
  + COALESCE((
      SELECT COUNT(*)::int
      FROM shortage_list sl
      WHERE sl.location_id = bl.id
        AND sl.status <> 'completed'
    ), 0);
