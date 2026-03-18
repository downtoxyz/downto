-- Add shared_at column to gate public preview page access
ALTER TABLE interest_checks
  ADD COLUMN shared_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN interest_checks.shared_at IS 'Set when author shares the check via link; preview page only shows checks where this is non-null';
