-- CI smoke test: confirm the DB Migrations (Staging) workflow auto-applies
-- migrations on branch push. Companion to 20260424000002 which tested the
-- prod workflow.
--
-- No schema impact — pure no-op. If this lands on staging via the workflow
-- without manual intervention, the staging pipeline works end-to-end.
SELECT 1;
