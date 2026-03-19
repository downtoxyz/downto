-- Add multi_select flag to squad_polls (defaults to true for existing polls)
ALTER TABLE public.squad_polls ADD COLUMN multi_select BOOLEAN NOT NULL DEFAULT true;
