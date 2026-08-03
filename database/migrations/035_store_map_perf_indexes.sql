-- אינדקסים לשאילתת מפת החנות (`GET /store-map/units/:unitId`).
--
-- `shelves` נשען עד כה רק על שני unique חלקיים (`unit_id, shelf_number` ו-
-- `side_id, shelf_number`), ולכן שליפה לפי `unit_id`/`side_id` לבד נפלה ל-Seq Scan.
-- `shortage_list` נשען על שני אינדקסים נפרדים (`location_id` ו-`status`), אבל
-- ה-subquery של החוסרים הפתוחים מסננת לפי שניהם יחד.
--
-- בנפח הנוכחי (30 מדפים) ה-planner יבחר Seq Scan בכל מקרה; זה מונע רגרסיה
-- כשהנפח יגדל. `CREATE INDEX` רגיל ולא `CONCURRENTLY` — `runMigrations.ts`
-- מריץ כל מיגרציה בתוך טרנזקציה.

CREATE INDEX IF NOT EXISTS shelves_unit_idx ON shelves (unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS shelves_side_idx ON shelves (side_id) WHERE side_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS unit_sides_unit_idx ON unit_sides (unit_id);

CREATE INDEX IF NOT EXISTS shortage_location_status_idx
  ON shortage_list (location_id, status)
  WHERE location_id IS NOT NULL;
