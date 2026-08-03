-- מצב «נקרא» של העובד בתיבת הצ'אט באפליקציה.
-- unread = הודעות נכנסות (direction='in') שנוצרו אחרי staff_last_read_at.
ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS staff_last_read_at TIMESTAMPTZ;
