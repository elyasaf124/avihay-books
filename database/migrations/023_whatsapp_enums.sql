-- ענפי בוט הוואטסאפ: enums למצב שיחה, סוג מימוש (איסוף/משלוח), שיטת משלוח, וטיפוס התראה.
DO $$ BEGIN
  CREATE TYPE whatsapp_session_status AS ENUM ('active', 'human_handover', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fulfillment_type AS ENUM ('pickup', 'delivery');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE delivery_method AS ENUM ('home', 'pickup_point');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'whatsapp_human_handover';
