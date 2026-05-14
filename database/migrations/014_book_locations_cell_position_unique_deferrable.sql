-- Allow swapping two `(cell_id, position_in_cell)` pairs in one UPDATE by
-- deferring the uniqueness check until transaction commit.
ALTER TABLE book_locations
  DROP CONSTRAINT IF EXISTS book_locations_cell_id_position_in_cell_key;

ALTER TABLE book_locations
  ADD CONSTRAINT book_locations_cell_id_position_in_cell_key
  UNIQUE (cell_id, position_in_cell)
  DEFERRABLE INITIALLY IMMEDIATE;
