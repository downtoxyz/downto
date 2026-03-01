-- Remove hard cap on squad membership after formation.
-- The max_squad_size picker still sets initial group-size intent,
-- but once a squad exists anyone can join.
DROP TRIGGER IF EXISTS enforce_squad_max_size ON public.squad_members;
