-- Low-stock notifications are disabled; remove existing rows.
DELETE FROM notifications WHERE type = 'low_stock';
