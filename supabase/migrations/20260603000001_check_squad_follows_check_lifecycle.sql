-- Bug: an open-ended interest check (no expiry, no event date) that is still
-- active had its squad chat archived 24h after the squad was created. The
-- squad expiry was a flat NOW()+24h (introduced in 20260224100000) divorced
-- from the parent check — so a live check with people freshly "down" lost its
-- coordination space ("mahjong with money" in prod).
--
-- Fix, part 1 — a check-based squad's lifecycle follows its check:
--   * Check has an event date -> squad expires (event_date + 1d) + 24h grace.
--   * Check has its own timer  -> squad expires check.expires_at + 24h grace.
--   * Open-ended check (no date, no timer) -> squad has NO expiry; it persists
--     until the check is archived (archive_interest_check mirrors the archive)
--     or the check otherwise dies. A NULL squad.expires_at already renders as
--     "open" in the UI and is skipped by the expiry sweep.
--
-- Fix, part 2 — the old "set a date to keep it going" warning fired off the
-- approaching expires_at, which open-ended squads no longer have. Replace it
-- with a one-time push nudge ("lock in a date?") ~24h into a dateless squad's
-- life. The squad no longer dies if ignored — the nudge is purely optional.
-- Delivery reuses the notifications -> push webhook (like event_reminder).
--
-- Centralise the expiry formula in one helper so set_squad_expiry,
-- reactivate_squad, revive_interest_check, and the date-recalc trigger can't
-- drift apart.


-- Track the one-time "lock a date?" nudge so the sweep sends it at most once.
ALTER TABLE public.squads
  ADD COLUMN IF NOT EXISTS date_nudge_sent_at TIMESTAMPTZ;


CREATE OR REPLACE FUNCTION public.check_squad_expiry(p_check_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN ic.event_date IS NOT NULL
      THEN ((ic.event_date + INTERVAL '1 day') + INTERVAL '24 hours')
    WHEN ic.expires_at IS NOT NULL
      THEN ic.expires_at + INTERVAL '24 hours'
    ELSE NULL  -- open-ended: squad lives as long as the check
  END
  FROM public.interest_checks ic
  WHERE ic.id = p_check_id;
$$;


-- BEFORE INSERT trigger on squads: derive expires_at from the squad's anchor.
CREATE OR REPLACE FUNCTION public.set_squad_expiry()
RETURNS TRIGGER AS $$
DECLARE
  v_event_date DATE;
BEGIN
  -- A caller-supplied expiry always wins.
  IF NEW.expires_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Check-based squad: mirror the check (NULL = persistent for open-ended).
  IF NEW.check_id IS NOT NULL THEN
    NEW.expires_at := public.check_squad_expiry(NEW.check_id);
    RETURN NEW;
  END IF;

  -- Event-based squad: 24h after the event day ends.
  IF NEW.event_id IS NOT NULL THEN
    SELECT date INTO v_event_date FROM public.events WHERE id = NEW.event_id;
    IF v_event_date IS NOT NULL THEN
      NEW.expires_at := (v_event_date + INTERVAL '1 day') + INTERVAL '24 hours';
      RETURN NEW;
    END IF;
  END IF;

  -- Standalone squad (or undated event): ephemeral 24h default.
  NEW.expires_at := NOW() + INTERVAL '24 hours';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- Expiry sweep:
--   * never warn/archive a squad whose check is still live and open-ended
--     (those have NULL expires_at, but this also covers any stale timer);
--   * send a one-time "lock a date?" nudge to dateless persistent squads.
CREATE OR REPLACE FUNCTION public.process_squad_expiry()
RETURNS void AS $$
BEGIN
  -- 1. 1h warnings for squads about to expire (skip squads with a date already
  --    set, and squads tied to a still-live open-ended check).
  INSERT INTO public.messages (squad_id, sender_id, text, is_system)
  SELECT s.id, NULL, 'This chat expires in 1 hour — set a date to keep it going', TRUE
  FROM public.squads s
  WHERE s.warned_at IS NULL
    AND s.archived_at IS NULL
    AND s.locked_date IS NULL
    AND s.expires_at > NOW()
    AND s.expires_at <= NOW() + INTERVAL '1 hour'
    AND NOT EXISTS (
      SELECT 1 FROM public.interest_checks ic
      WHERE ic.id = s.check_id
        AND ic.archived_at IS NULL
        AND ic.expires_at IS NULL
        AND ic.event_date IS NULL
    );

  UPDATE public.squads s
  SET warned_at = NOW()
  WHERE s.warned_at IS NULL
    AND s.archived_at IS NULL
    AND s.locked_date IS NULL
    AND s.expires_at > NOW()
    AND s.expires_at <= NOW() + INTERVAL '1 hour'
    AND NOT EXISTS (
      SELECT 1 FROM public.interest_checks ic
      WHERE ic.id = s.check_id
        AND ic.archived_at IS NULL
        AND ic.expires_at IS NULL
        AND ic.event_date IS NULL
    );

  -- 2. One-time "lock a date?" nudge: persistent (open-ended-check) squads
  --    that have been going 24h with no date set. Inserting a notification row
  --    fans out to push via the notifications webhook. Nudge every active
  --    member once.
  INSERT INTO public.notifications (user_id, type, title, body, related_squad_id)
  SELECT sm.user_id,
         'squad_date_nudge',
         'lock in a date?',
         COALESCE(s.name, 'your squad') || ' has been going a while — set a date to make it official',
         s.id
  FROM public.squads s
  JOIN public.squad_members sm ON sm.squad_id = s.id AND sm.role = 'member'
  JOIN public.interest_checks ic ON ic.id = s.check_id
  WHERE s.archived_at IS NULL
    AND s.locked_date IS NULL
    AND s.date_nudge_sent_at IS NULL
    AND s.created_at < NOW() - INTERVAL '24 hours'
    AND ic.archived_at IS NULL
    AND ic.expires_at IS NULL
    AND ic.event_date IS NULL;

  UPDATE public.squads s
  SET date_nudge_sent_at = NOW()
  WHERE s.archived_at IS NULL
    AND s.locked_date IS NULL
    AND s.date_nudge_sent_at IS NULL
    AND s.created_at < NOW() - INTERVAL '24 hours'
    AND EXISTS (
      SELECT 1 FROM public.interest_checks ic
      WHERE ic.id = s.check_id
        AND ic.archived_at IS NULL
        AND ic.expires_at IS NULL
        AND ic.event_date IS NULL
    );

  -- 3. Archive expired squads (soft delete), unless the squad belongs to a
  --    still-live open-ended check.
  UPDATE public.squads s
  SET archived_at = NOW()
  WHERE s.archived_at IS NULL
    AND s.expires_at IS NOT NULL
    AND s.expires_at < NOW()
    AND NOT EXISTS (
      SELECT 1 FROM public.interest_checks ic
      WHERE ic.id = s.check_id
        AND ic.archived_at IS NULL
        AND ic.expires_at IS NULL
        AND ic.event_date IS NULL
    );

  -- 4. Hard delete squads archived more than 7 days ago.
  DELETE FROM public.squads
  WHERE archived_at IS NOT NULL
    AND archived_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- reactivate_squad: recompute expiry from the check (NULL for open-ended).
CREATE OR REPLACE FUNCTION public.reactivate_squad(p_squad_id UUID)
RETURNS public.squads AS $$
DECLARE
  v_squad public.squads;
  v_new_expiry TIMESTAMPTZ;
BEGIN
  SELECT CASE
    WHEN s.check_id IS NULL THEN NOW() + INTERVAL '24 hours'
    ELSE public.check_squad_expiry(s.check_id)
  END
  INTO v_new_expiry
  FROM public.squads s
  WHERE s.id = p_squad_id;

  UPDATE public.squads
  SET archived_at = NULL,
      warned_at = NULL,
      expires_at = v_new_expiry
  WHERE id = p_squad_id
    AND archived_at IS NOT NULL
  RETURNING * INTO v_squad;

  IF v_squad IS NULL THEN
    RAISE EXCEPTION 'Squad not found or not archived';
  END IF;

  RETURN v_squad;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- recalc on check date change: use the shared formula (also picks up the
-- check's own timer when the date is cleared, instead of a flat 24h).
CREATE OR REPLACE FUNCTION public.recalc_squad_expiry_on_check_date_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.event_date IS NOT DISTINCT FROM OLD.event_date THEN
    RETURN NEW;
  END IF;

  UPDATE public.squads
  SET expires_at = public.check_squad_expiry(NEW.id)
  WHERE check_id = NEW.id
    AND archived_at IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- revive_interest_check: same as 20260602000001 but the re-activated squad's
-- expiry now follows the (just-revived) check instead of a 24h fallback.
CREATE OR REPLACE FUNCTION public.revive_interest_check(p_check_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_author_id UUID;
  v_author_name TEXT;
  v_text TEXT;
  v_old_archived_at TIMESTAMPTZ;
  v_recipient UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT author_id, text, archived_at
    INTO v_author_id, v_text, v_old_archived_at
  FROM public.interest_checks
  WHERE id = p_check_id;

  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Check not found';
  END IF;

  IF v_author_id <> v_caller AND NOT public.is_check_coauthor(p_check_id, v_caller) THEN
    RAISE EXCEPTION 'Not authorized to revive this check';
  END IF;

  UPDATE public.interest_checks
    SET archived_at = NULL,
        event_date = CASE
          WHEN event_date IS NOT NULL
            AND event_date < (now() AT TIME ZONE COALESCE(event_tz, 'UTC'))::date
          THEN NULL
          ELSE event_date
        END,
        expires_at = CASE
          WHEN expires_at IS NOT NULL AND expires_at < now()
          THEN NULL
          ELSE expires_at
        END
    WHERE id = p_check_id AND archived_at IS NOT NULL;

  IF NOT FOUND THEN RETURN; END IF;

  -- Re-activate squads that were archived alongside the check (matching
  -- archived_at within a small window covers any intra-tx clock drift).
  -- Expiry now follows the revived check (NULL for open-ended).
  UPDATE public.squads
    SET archived_at = NULL,
        warned_at = NULL,
        expires_at = public.check_squad_expiry(p_check_id)
    WHERE check_id = p_check_id
      AND archived_at IS NOT NULL
      AND v_old_archived_at IS NOT NULL
      AND archived_at BETWEEN v_old_archived_at - INTERVAL '5 seconds'
                          AND v_old_archived_at + INTERVAL '5 seconds';

  -- Always replace prior check_archived notifications with the latest state.
  DELETE FROM public.notifications
    WHERE related_check_id = p_check_id
      AND type = 'check_archived';

  -- Quick undo (within 5 min) → no revive notification, just the cleanup
  -- above. Older revives → notify down responders the plan is back on.
  IF v_old_archived_at > now() - interval '5 minutes' THEN
    RETURN;
  END IF;

  SELECT display_name INTO v_author_name FROM public.profiles WHERE id = v_author_id;
  v_author_name := COALESCE(v_author_name, 'Someone');

  FOR v_recipient IN
    SELECT user_id FROM public.check_responses
    WHERE check_id = p_check_id
      AND response = 'down'
      AND user_id <> v_author_id
  LOOP
    INSERT INTO public.notifications (
      user_id, type, title, body, related_user_id, related_check_id
    )
    VALUES (
      v_recipient,
      'check_revived',
      v_author_name || ' revived the check',
      LEFT(COALESCE(v_text, 'a check'), 120),
      v_author_id,
      p_check_id
    );
  END LOOP;
END;
$$;


-- Allow the new notification type.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request', 'friend_accepted', 'check_response',
    'squad_message', 'squad_invite', 'friend_check', 'date_confirm',
    'check_tag', 'check_comment', 'poll_created', 'squad_join_request',
    'squad_mention', 'comment_mention', 'friend_event', 'event_reminder',
    'event_down', 'check_date_updated', 'event_date_updated',
    'check_text_updated',
    'check_archived', 'check_revived',
    'squad_date_nudge'
  ));


-- Backfill A: bring back squads the sweep archived while their check is still
-- active and open-ended. At most one (the most recent) per check, and only
-- when no active squad already holds the unique-per-check slot.
WITH revivable AS (
  SELECT DISTINCT ON (s.check_id) s.id
  FROM public.squads s
  JOIN public.interest_checks ic ON ic.id = s.check_id
  WHERE s.archived_at IS NOT NULL
    AND ic.archived_at IS NULL
    AND ic.expires_at IS NULL
    AND ic.event_date IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.squads s2
      WHERE s2.check_id = s.check_id
        AND s2.archived_at IS NULL
    )
  ORDER BY s.check_id, s.created_at DESC
)
UPDATE public.squads
  SET archived_at = NULL,
      warned_at = NULL,
      grace_started_at = NULL,
      expires_at = NULL
  WHERE id IN (SELECT id FROM revivable);


-- Backfill B: suppress retroactive nudges. Existing squads shouldn't all get
-- pinged on the first sweep after deploy — only squads created from here on
-- (and any reactivated above, which we also mark) earn the 24h nudge fresh.
UPDATE public.squads
  SET date_nudge_sent_at = NOW()
  WHERE date_nudge_sent_at IS NULL;
