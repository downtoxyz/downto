-- Squad chat image attachments
-- Adds optional image columns to messages and a private storage bucket
-- whose access is gated to squad members of the path's leading squad_id.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS image_path TEXT,
  ADD COLUMN IF NOT EXISTS image_width INTEGER,
  ADD COLUMN IF NOT EXISTS image_height INTEGER;

-- Allow empty text for image-only messages
ALTER TABLE public.messages ALTER COLUMN text DROP NOT NULL;

-- Private bucket (public = false). 5 MB cap, common web image MIME types only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'squad-chat-images',
  'squad-chat-images',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Paths are formatted "{squad_id}/{uuid}.{ext}"; the first folder is the squad id.
CREATE POLICY "Squad members can read chat images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'squad-chat-images'
    AND public.is_squad_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "Squad members can upload chat images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'squad-chat-images'
    AND public.is_squad_member((storage.foldername(name))[1]::uuid, auth.uid())
  );
