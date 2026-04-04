-- Add native push notification support (iOS/Android) alongside existing web push

-- Add platform column with check constraint
ALTER TABLE push_subscriptions
  ADD COLUMN platform TEXT NOT NULL DEFAULT 'web'
  CONSTRAINT push_subscriptions_platform_check CHECK (platform IN ('web', 'ios', 'android'));

-- Add device_token column for native push (APNs/FCM tokens)
ALTER TABLE push_subscriptions
  ADD COLUMN device_token TEXT;

-- Make web-push-specific fields nullable (native tokens don't have these)
ALTER TABLE push_subscriptions
  ALTER COLUMN p256dh DROP NOT NULL,
  ALTER COLUMN auth DROP NOT NULL;

-- Unique constraint for native device dedup
CREATE UNIQUE INDEX push_subscriptions_user_device_token_key
  ON push_subscriptions (user_id, device_token)
  WHERE device_token IS NOT NULL;
