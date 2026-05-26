-- Rename logical "סטנד" unit to "סטים" (sets cabinet).
UPDATE shelving_units SET name = 'סטים' WHERE store_position = 'stacks';

UPDATE shelves s SET label = 'משטח סטים'
FROM shelving_units u
WHERE s.unit_id = u.id AND u.store_position = 'stacks';

UPDATE cells c SET cell_name = regexp_replace(c.cell_name, '^סטנד ', 'סט ')
FROM shelves s
JOIN shelving_units u ON s.unit_id = u.id
WHERE c.shelf_id = s.id AND u.store_position = 'stacks'
  AND c.cell_name LIKE 'סטנד %';
