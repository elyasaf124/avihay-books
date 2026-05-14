CREATE TABLE IF NOT EXISTS unit_sides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id      UUID NOT NULL REFERENCES shelving_units(id) ON DELETE CASCADE,
  side_label   VARCHAR(50) NOT NULL,
  side_order   INT NOT NULL CHECK (side_order IN (1, 2)),
  UNIQUE (unit_id, side_order),
  UNIQUE (unit_id, side_label)
);
