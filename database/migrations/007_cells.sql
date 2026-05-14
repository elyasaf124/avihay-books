CREATE TABLE IF NOT EXISTS cells (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shelf_id     UUID NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
  cell_number  INT NOT NULL CHECK (cell_number >= 1),
  cell_name    VARCHAR(20) NOT NULL UNIQUE,
  capacity     INT NOT NULL CHECK (capacity >= 1),
  UNIQUE (shelf_id, cell_number)
);

CREATE INDEX IF NOT EXISTS cells_shelf_idx ON cells (shelf_id);
