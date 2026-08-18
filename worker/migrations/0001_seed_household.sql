-- Seeds the Mazza household (#71).
--
-- Hand-written rather than drizzle-generated: it changes no schema, so the
-- 0000 snapshot stays accurate and `drizzle-kit generate` has nothing to say
-- about it. Wrangler and the test harness both apply every file in this
-- directory in order, so it runs either way.
--
-- The id is fixed rather than generated. A generated id would mean the
-- application has to discover its own household at runtime before it can
-- scope a single query; fixed, it is a constant in src/db/household.ts until
-- #89 replaces it with a JWT membership lookup.
--
-- INSERT OR IGNORE, not INSERT: D1 records which migrations it has applied,
-- but a seed that duplicates when replayed against a live database is a trap
-- worth not setting.
INSERT OR IGNORE INTO households (id, name, created_at)
VALUES (
  '40ffc4b3-cbf0-432b-add9-cd0f6d8ec720',
  'Mazza',
  '2026-08-17T00:00:00.000Z'
);

-- No users are seeded. A user row is provisioned just-in-time from a verified
-- Clerk JWT on first authenticated request (#76); a hand-seeded one would be
-- a row no sign-in could ever claim.

-- ---------------------------------------------------------------------------
-- Where every setting the Express app read now lives
-- ---------------------------------------------------------------------------
-- The old `app_settings` was one flat key/value table with no owner. It splits
-- by who the value belongs to, and the split is decided here rather than
-- retrofitted (#71): no later migration moves a key between the two tables.
--
--   balance_threshold_green    -> household_settings
--   balance_threshold_yellow   -> household_settings
--       Both spouses read one forecast off one set of thresholds. A per-user
--       threshold would mean the same day is "critical" for one of them and
--       not the other, which is not a preference, it is a disagreement about
--       a fact.
--
--   theme                      -> user_settings
--       Per person and per device. The only key in the old table that was
--       never about the money.
--
--   last_sync_at               -> household_settings
--       The SimpleFIN connection is per household and so is its 24/day budget
--       (#70), so the last sync is a household fact. Carried over as a key to
--       keep the port behaviour-identical; #70 may well read it from
--       `sync_log` instead, at which point the key is dropped rather than
--       moved to the other table.
--
-- No rows are seeded for any of them. The Express app stored no defaults
-- either — an absent key falls back in the client (`useThresholds`), and
-- seeding values here would make GET /settings return rows it never returned
-- before, which is a behaviour change wearing a migration's clothes.
