DO $$ BEGIN
  CREATE TYPE order_type AS ENUM ('inventory', 'customer', 'whatsapp');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending', 'sent', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE shortage_status AS ENUM ('shortage', 'order_pending', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM ('low_stock', 'remove_from_display', 'supplier_reorder_reminder');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE whatsapp_intent AS ENUM ('stock_check', 'price_check', 'place_order');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE store_position AS ENUM ('front', 'left', 'right', 'island');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
