-- Logical "ארון תצוגה" atop the island — flat surface for `is_new` stacks.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'store_position'
      AND e.enumlabel = 'display'
  ) THEN
    ALTER TYPE store_position ADD VALUE 'display';
  END IF;
END
$$;
