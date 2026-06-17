-- עדכון ניסוחי בוט: איפוס text_overrides + store_info (שעות, קבוצת עדכונים, שעות מענה אנושי)
UPDATE bot_config
SET config = jsonb_set(
  jsonb_set(
    COALESCE(config, '{}'::jsonb),
    '{text_overrides}',
    '{}'::jsonb
  ),
  '{store_info}',
  COALESCE(config->'store_info', '{}'::jsonb) || jsonb_build_object(
    'hours_text',
    E'ימים א''-ה'': 07:00 - 22:00\nמענה אנושי בחנות בין השעות 13:30-15:00\nימי ו'': 07:00 - 14:00',
    'updates_group_url',
    'https://chat.whatsapp.com/FMAgvMLixUT1Lia4DnA3Fh',
    'human_hours_start',
    13,
    'human_hours_end',
    18
  )
)
WHERE id = 1;
