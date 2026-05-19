-- Logical "סטנד" before the island — flat surface for piled books.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'store_position'
      AND e.enumlabel = 'stacks'
  ) THEN
    ALTER TYPE store_position ADD VALUE 'stacks';
  END IF;
END
$$;
