-- Add movie_metadata JSONB column to events (same shape as interest_checks.movie_metadata)
ALTER TABLE events ADD COLUMN IF NOT EXISTS movie_metadata JSONB;

-- Update Rishabh's "The Bride" event with the correct Letterboxd URL
UPDATE events
  SET letterboxd_url = 'https://letterboxd.com/film/the-bride-2026/'
WHERE title ILIKE '%bride%'
  AND letterboxd_url IS NULL;
