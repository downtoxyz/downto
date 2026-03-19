-- Allow multiple option selections per user in squad polls
-- Change unique constraint from (poll_id, user_id) to (poll_id, user_id, option_index)

ALTER TABLE public.squad_poll_votes DROP CONSTRAINT squad_poll_votes_poll_id_user_id_key;
ALTER TABLE public.squad_poll_votes ADD CONSTRAINT squad_poll_votes_poll_user_option_key UNIQUE (poll_id, user_id, option_index);

-- Allow service role to delete votes (for toggle behavior)
CREATE POLICY "Service delete votes"
  ON public.squad_poll_votes FOR DELETE
  USING (true);
