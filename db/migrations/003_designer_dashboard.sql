-- 003_designer_dashboard.sql — the designer dashboard needs project workflow status and
-- cheap per-room value snapshots (so listing projects never parses multi-MB state JSON).
--
-- status: 'assigned'   — awaiting the designer's action (default; a Sales App will set
--                        this on hand-off later — SAL-04's feed reads these buckets)
--         'in-process' — being worked on (set automatically the first time the designer
--                        opens an assigned project)
--         'submitted'  — completed and forwarded to Sales / the client
ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'assigned';
ALTER TABLE projects ADD COLUMN submitted_at TEXT;

-- Latest room total (₹), extracted from state.plan.price.breakdown.total on every state
-- save; summed per project for the dashboard's project value.
ALTER TABLE rooms ADD COLUMN value INTEGER;

-- Backfill from the state already stored (SQLite JSON1).
UPDATE rooms SET value = CAST(json_extract(state, '$.plan.price.breakdown.total') AS INTEGER)
WHERE json_extract(state, '$.plan.price.breakdown.total') IS NOT NULL;
