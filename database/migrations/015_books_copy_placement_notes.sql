-- Per-copy shelf notes as JSON array. Apply with: npm run db:migrate (do not run with node.)
ALTER TABLE books
  ADD COLUMN IF NOT EXISTS copy_placement_notes JSONB NOT NULL DEFAULT '[]'::jsonb;
