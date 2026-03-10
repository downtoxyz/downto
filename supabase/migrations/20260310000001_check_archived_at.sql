-- Add archived_at column to interest_checks for soft-delete (archive)
ALTER TABLE interest_checks ADD COLUMN archived_at TIMESTAMPTZ DEFAULT NULL;
