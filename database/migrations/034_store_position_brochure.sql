-- Logical "סטנד חוברות" below the stacks unit — 5 shelves, one cell per shelf.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'store_position'
      AND e.enumlabel = 'brochure'
  ) THEN
    ALTER TYPE store_position ADD VALUE 'brochure';
  END IF;
END
$$;
