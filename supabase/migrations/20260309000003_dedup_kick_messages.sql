-- Remove duplicate system messages with identical (squad_id, text).
-- Covers kick messages and any other duplicated system messages.
-- Keeps the earliest of each duplicate set.
DELETE FROM messages
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY squad_id, text ORDER BY created_at ASC) AS rn
    FROM messages
    WHERE is_system = TRUE
  ) dupes
  WHERE rn > 1
);
