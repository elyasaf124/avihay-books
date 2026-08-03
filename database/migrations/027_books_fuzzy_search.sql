-- חיפוש fuzzy (סובלני לשגיאות כתיב) לענף בירור המלאי בבוט: pg_trgm + אינדקסי GIN.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS books_title_trgm_idx  ON books USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS books_author_trgm_idx ON books USING gin (author gin_trgm_ops);
