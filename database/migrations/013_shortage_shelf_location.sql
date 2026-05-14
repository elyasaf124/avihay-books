-- מיקום במדף שממנו נוצר החוסר — לטשטוש ויזואלי עד שהמצב משלים; בלי למחוק שורות מיקום.
ALTER TABLE shortage_list
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES book_locations (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS shortage_location_idx ON shortage_list (location_id)
  WHERE location_id IS NOT NULL;
