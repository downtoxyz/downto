-- Track which UA registered each web push subscription so we can clean up
-- iOS-Safari PWA subs when the same user installs the native iOS app.
--
-- Without this, a user who saved the PWA to their home screen and then
-- downloads the App Store app gets every notification twice on the same
-- iPhone: once via Apple Web Push to the PWA, once via APNs to the native
-- app. The endpoints both live under web.push.apple.com / Apple Push
-- Service so we can't tell them apart by URL alone — but we *can* tell
-- iOS Safari from Mac Safari from the user agent.
--
-- Existing rows stay NULL; the cleanup logic falls back to "leave alone"
-- for rows it can't classify.

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS user_agent TEXT;
