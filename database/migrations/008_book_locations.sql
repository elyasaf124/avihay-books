CREATE TABLE IF NOT EXISTS book_locations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id           UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  cell_id           UUID NOT NULL REFERENCES cells(id) ON DELETE CASCADE,
  position_in_cell  INT  NOT NULL CHECK (position_in_cell >= 1),
  quantity_in_cell  INT  NOT NULL CHECK (quantity_in_cell >= 0),
  UNIQUE (cell_id, position_in_cell)
);

CREATE INDEX IF NOT EXISTS book_locations_book_idx ON book_locations (book_id);
CREATE INDEX IF NOT EXISTS book_locations_cell_idx ON book_locations (cell_id);
