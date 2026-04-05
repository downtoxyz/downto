-- RPC to reactivate an archived squad: clears archive state and recalculates expiry
-- from the linked check's event_date (or 24h fallback).

CREATE OR REPLACE FUNCTION public.reactivate_squad(p_squad_id UUID)
RETURNS public.squads AS $$
DECLARE
  v_squad public.squads;
  v_event_date DATE;
  v_new_expiry TIMESTAMPTZ;
BEGIN
  -- Look up the check's event_date for expiry calculation
  SELECT ic.event_date INTO v_event_date
  FROM public.squads s
  JOIN public.interest_checks ic ON ic.id = s.check_id
  WHERE s.id = p_squad_id;

  IF v_event_date IS NOT NULL THEN
    v_new_expiry := (v_event_date + INTERVAL '1 day') + INTERVAL '24 hours';
  ELSE
    v_new_expiry := NOW() + INTERVAL '24 hours';
  END IF;

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
