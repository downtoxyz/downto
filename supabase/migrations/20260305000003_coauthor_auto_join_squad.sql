-- Co-authors should auto-join the squad when they accept the tag,
-- bypassing the capacity check (they were explicitly invited).
CREATE OR REPLACE FUNCTION public.auto_down_on_coauthor_accept()
RETURNS TRIGGER AS $$
DECLARE
  accepter_name TEXT;
  check_text TEXT;
  v_squad_id UUID;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    -- Auto-respond "down"
    INSERT INTO public.check_responses (check_id, user_id, response)
    VALUES (NEW.check_id, NEW.user_id, 'down')
    ON CONFLICT (check_id, user_id) DO UPDATE SET response = 'down';

    -- Auto-join squad if one exists for this check
    SELECT id INTO v_squad_id
      FROM public.squads WHERE check_id = NEW.check_id LIMIT 1;

    IF v_squad_id IS NOT NULL THEN
      INSERT INTO public.squad_members (squad_id, user_id, role)
      VALUES (v_squad_id, NEW.user_id, 'member')
      ON CONFLICT (squad_id, user_id)
        DO UPDATE SET role = 'member';
    END IF;

    -- Notify the person who tagged them
    SELECT display_name INTO accepter_name
      FROM public.profiles WHERE id = NEW.user_id;

    SELECT text INTO check_text
      FROM public.interest_checks WHERE id = NEW.check_id;

    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_check_id)
    VALUES (
      NEW.invited_by,
      'check_tag',
      accepter_name || ' accepted your tag',
      LEFT(check_text, 80),
      NEW.user_id,
      NEW.check_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
