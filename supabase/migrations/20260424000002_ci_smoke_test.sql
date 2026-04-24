-- CI smoke test: confirm the DB Migrations GitHub Actions workflow
-- auto-applies migrations on merge to main.
--
-- No schema impact — a pure no-op. If this lands in prod via the workflow
-- without manual intervention, the pipeline works end-to-end. The earlier
-- consolidation migration (20260424000001) had to be applied via
-- workflow_dispatch because it merged before the workflow file existed.
SELECT 1;
