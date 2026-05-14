CREATE TABLE IF NOT EXISTS shortage_list (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id       UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        shortage_status NOT NULL DEFAULT 'shortage',
  resolved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS shortage_book_idx   ON shortage_list (book_id);
CREATE INDEX IF NOT EXISTS shortage_status_idx ON shortage_list (status);
