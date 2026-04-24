-- Unified "when" poll type. Supersedes dates + availability going forward; the
-- older types stay readable so in-flight polls keep rendering.
--
-- options JSONB holds the slot list for when-polls:
--   [{ date: "YYYY-MM-DD", startMin: int|null, endMin: int|null, label: string|null }, ...]
-- startMin/endMin are minutes from midnight (0..1440), both null = whole day.
--
-- collection_style is a render/copy hint:
--   'preference'   → "pick the times that work"   (default list view)
--   'availability' → "paint everything you're free for" (default grid view when slots align)
-- NULL for non-when polls.

ALTER TABLE public.squad_polls
  DROP CONSTRAINT IF EXISTS squad_polls_poll_type_check;
ALTER TABLE public.squad_polls
  ADD CONSTRAINT squad_polls_poll_type_check
  CHECK (poll_type IN ('text', 'dates', 'availability', 'when'));

ALTER TABLE public.squad_polls
  ADD COLUMN IF NOT EXISTS collection_style TEXT
  CHECK (collection_style IS NULL OR collection_style IN ('preference', 'availability'));
