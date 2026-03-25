-- Event reminder notifications — push reminders before saved events happen
-- Runs on pg_cron every 30 minutes, sends 24h and 2h reminders

-- 1. Add reminder tracking columns to saved_events
ALTER TABLE public.saved_events
  ADD COLUMN IF NOT EXISTS reminded_24h_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminded_2h_at TIMESTAMPTZ;

-- 2. Add event_reminder to notification types
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request', 'friend_accepted', 'check_response',
    'squad_message', 'squad_invite', 'friend_check', 'date_confirm',
    'check_tag', 'check_comment', 'poll_created', 'squad_join_request',
    'squad_mention', 'comment_mention', 'friend_event', 'event_reminder'
  ));

-- 3. Function to parse start hour from time_display (e.g. "8pm" → 20, "11PM-5AM" → 23)
CREATE OR REPLACE FUNCTION public.parse_event_start_hour(time_text TEXT)
RETURNS INTEGER AS $$
DECLARE
  raw TEXT;
  num INTEGER;
  ampm TEXT;
BEGIN
  IF time_text IS NULL OR time_text = '' OR time_text = 'TBD' THEN
    RETURN NULL;
  END IF;

  -- Take the part before any dash (for ranges like "11PM-5AM")
  raw := split_part(time_text, '-', 1);
  raw := split_part(raw, '–', 1); -- en-dash
  raw := TRIM(raw);

  -- Extract the number and am/pm
  num := (regexp_match(raw, '(\d{1,2})'))[1]::INTEGER;
  ampm := LOWER((regexp_match(raw, '(am|pm)', 'i'))[1]);

  IF num IS NULL THEN
    RETURN NULL;
  END IF;

  -- If no am/pm on start, check the end part for context
  IF ampm IS NULL THEN
    ampm := LOWER((regexp_match(time_text, '(am|pm)', 'i'))[1]);
    -- If end is pm and start number > end number, start is am (daytime: "11-5pm")
    IF ampm = 'pm' THEN
      DECLARE
        end_num INTEGER;
      BEGIN
        end_num := (regexp_match(split_part(split_part(time_text, '-', 2), '–', 1), '(\d{1,2})'))[1]::INTEGER;
        IF end_num IS NOT NULL AND num > end_num THEN
          ampm := 'am';
        END IF;
      END;
    END IF;
  END IF;

  IF ampm IS NULL THEN
    RETURN NULL;
  END IF;

  IF ampm = 'pm' AND num < 12 THEN
    num := num + 12;
  ELSIF ampm = 'am' AND num = 12 THEN
    num := 0;
  END IF;

  RETURN num;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. Main reminder function
CREATE OR REPLACE FUNCTION public.process_event_reminders()
RETURNS void AS $$
DECLARE
  r RECORD;
  event_ts TIMESTAMPTZ;
  hours_until DOUBLE PRECISION;
BEGIN
  -- Find saved events with a date, not yet fully reminded
  FOR r IN
    SELECT
      se.id AS saved_id,
      se.user_id,
      se.event_id,
      se.reminded_24h_at,
      se.reminded_2h_at,
      e.title,
      e.date,
      e.time_display,
      e.venue,
      public.parse_event_start_hour(e.time_display) AS start_hour
    FROM public.saved_events se
    JOIN public.events e ON se.event_id = e.id
    WHERE e.date IS NOT NULL
      AND e.date >= CURRENT_DATE
      AND (se.reminded_24h_at IS NULL OR se.reminded_2h_at IS NULL)
  LOOP
    -- Build event timestamp (date + start hour, default to noon if no time)
    IF r.start_hour IS NOT NULL THEN
      event_ts := (r.date || ' ' || LPAD(r.start_hour::TEXT, 2, '0') || ':00:00')::TIMESTAMPTZ;
    ELSE
      event_ts := (r.date || ' 12:00:00')::TIMESTAMPTZ;
    END IF;

    hours_until := EXTRACT(EPOCH FROM (event_ts - NOW())) / 3600.0;

    -- 24h reminder: between 24h and 23h before event
    IF r.reminded_24h_at IS NULL AND hours_until <= 24 AND hours_until > 0 THEN
      INSERT INTO public.notifications (user_id, type, title, body, related_event_id)
      VALUES (
        r.user_id,
        'event_reminder',
        r.title,
        CASE
          WHEN r.venue IS NOT NULL AND r.venue != '' AND r.time_display IS NOT NULL AND r.time_display != '' AND r.time_display != 'TBD'
            THEN 'Tomorrow · ' || r.time_display || ' · ' || r.venue
          WHEN r.time_display IS NOT NULL AND r.time_display != '' AND r.time_display != 'TBD'
            THEN 'Tomorrow · ' || r.time_display
          ELSE 'Tomorrow'
        END,
        r.event_id
      );

      UPDATE public.saved_events SET reminded_24h_at = NOW() WHERE id = r.saved_id;
    END IF;

    -- 2h reminder: between 2h and 1h before event
    IF r.reminded_2h_at IS NULL AND hours_until <= 2 AND hours_until > 0 THEN
      INSERT INTO public.notifications (user_id, type, title, body, related_event_id)
      VALUES (
        r.user_id,
        'event_reminder',
        r.title,
        CASE
          WHEN r.venue IS NOT NULL AND r.venue != ''
            THEN 'Starting soon · ' || r.venue
          ELSE 'Starting soon'
        END,
        r.event_id
      );

      UPDATE public.saved_events SET reminded_2h_at = NOW() WHERE id = r.saved_id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Schedule: every 30 minutes
SELECT cron.schedule(
  'event-reminders',
  '*/30 * * * *',
  $$SELECT public.process_event_reminders()$$
);
