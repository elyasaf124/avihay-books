CREATE TABLE IF NOT EXISTS shelving_units (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100)    NOT NULL,
  store_position  store_position  NOT NULL,
  has_sides       BOOLEAN         NOT NULL DEFAULT FALSE,
  is_display_unit BOOLEAN         NOT NULL DEFAULT FALSE,
  display_order   INT             NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS shelving_units_position_uniq
  ON shelving_units (store_position);
