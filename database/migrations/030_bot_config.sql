-- קונפיגורציית בוט הוואטסאפ הניתנת לעריכה מתוך האפליקציה (בונה זרימות, פריטי תפריט,
-- פרטי חנות וטקסטים). שורה יחידה (singleton, id=1) המחזיקה JSONB אחד.
-- הבוט קורא מהטבלה (עם cache קצר) במקום מקבועים בקוד; ברירות מחדל נשמרות בקוד/`.env`.
CREATE TABLE IF NOT EXISTS bot_config (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO bot_config (id, config) VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
