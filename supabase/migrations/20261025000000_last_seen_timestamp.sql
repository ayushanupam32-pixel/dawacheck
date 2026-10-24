-- last_seen: the time of the load run, not just its date.
--
-- The loader deletes rows a run did not load (last_seen older than the run). With a date, two
-- runs on the same day could not tell their rows apart: on 2026-10-24 the second run (with new
-- row ids for banned_fdcs) left the first run's 682 rows in place, duplicating the list with
-- old, unrestricted entries. Existing dates become midnight UTC, so the next run removes them.
alter table nsq_alerts alter column last_seen type timestamptz using last_seen::timestamptz;
alter table banned_fdcs alter column last_seen type timestamptz using last_seen::timestamptz;
