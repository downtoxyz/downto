-- Fix cap_down_responses: reserve a squad slot for the check author.
-- Previously the cap allowed max_squad_size 'down' responses, but the author
-- occupies one squad slot without having a check_response row. This caused
-- one extra person to get response='down' when they should be 'waitlist'.

CREATE OR REPLACE FUNCTION public.cap_down_responses()
RETURNS TRIGGER AS $$
DECLARE
  v_max_size INT;
  v_current_downs INT;
  v_is_coauthor BOOLEAN;
BEGIN
  -- Only act when the incoming response is 'down'
  IF NEW.response != 'down' THEN RETURN NEW; END IF;

  -- On UPDATE, if already 'down' → 'down' (no-op), let it through
  IF TG_OP = 'UPDATE' AND OLD.response = 'down' THEN RETURN NEW; END IF;

  SELECT ic.max_squad_size INTO v_max_size
  FROM public.interest_checks ic WHERE ic.id = NEW.check_id;

  -- NULL = unlimited, skip cap
  IF v_max_size IS NULL THEN RETURN NEW; END IF;

  -- Co-authors (accepted) bypass the cap — they were explicitly invited
  SELECT EXISTS (
    SELECT 1 FROM public.check_co_authors
    WHERE check_id = NEW.check_id AND user_id = NEW.user_id AND status = 'accepted'
  ) INTO v_is_coauthor;
  IF v_is_coauthor THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_current_downs
  FROM public.check_responses
  WHERE check_id = NEW.check_id AND response = 'down';

  -- Reserve one slot for the check author (who has no check_response row)
  IF v_current_downs >= v_max_size - 1 THEN
    NEW.response := 'waitlist';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
