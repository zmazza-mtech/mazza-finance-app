-- One override per occurrence, enforced rather than assumed (#100).
--
-- `backend/src/api/recurring.ts` upserts with `onConflictDoNothing()` under a
-- comment reading "one per (recurringId, originalDate)". Neither schema ever
-- carried a unique for it to conflict with, so a second edit of the same
-- occurrence joined the first instead of replacing it, and `applyOverrides`
-- read whichever it met — with a `deleted` override beside a `modified` one
-- meaning a skipped bill could reappear.
--
-- De-duplicate before indexing, keeping the newest row per pair: the last
-- edit is the one the user meant. `rowid` orders inserts, and is stable here
-- because created_at has second-level ties.
DELETE FROM recurring_overrides
WHERE rowid NOT IN (
  SELECT MAX(rowid)
  FROM recurring_overrides
  GROUP BY recurring_transaction_id, original_date
);

CREATE UNIQUE INDEX `uq_override_occurrence`
  ON `recurring_overrides` (`recurring_transaction_id`, `original_date`);
