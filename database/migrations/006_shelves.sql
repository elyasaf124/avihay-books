CREATE TABLE IF NOT EXISTS shelves (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id       UUID REFERENCES shelving_units(id) ON DELETE CASCADE,
  side_id       UUID REFERENCES unit_sides(id) ON DELETE CASCADE,
  shelf_number  INT NOT NULL CHECK (shelf_number >= 1),
  label         VARCHAR(50),
  CONSTRAINT shelves_unit_xor_side CHECK (
    (unit_id IS NOT NULL AND side_id IS NULL) OR
    (unit_id IS NULL     AND side_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS shelves_unit_number_uniq
  ON shelves (unit_id, shelf_number) WHERE unit_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shelves_side_number_uniq
  ON shelves (side_id, shelf_number) WHERE side_id IS NOT NULL;
