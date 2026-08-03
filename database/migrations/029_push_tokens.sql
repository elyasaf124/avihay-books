-- טוקני Expo Push של מכשירי העובדים — לשליחת התראות מרחוק (הודעת וואטסאפ חדשה)
-- גם כשהאפליקציה סגורה. אין חשבונות עובדים נפרדים, לכן כל המכשירים הרשומים מקבלים.
CREATE TABLE IF NOT EXISTS push_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expo_token   TEXT NOT NULL UNIQUE,
  platform     VARCHAR(16),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
