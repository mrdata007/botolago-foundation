-- BotolaGO Production V2 — email notifications, part 1 of 2.
--
-- Three notification types that cover a whole day or round rather than one
-- match. They get their own file because PostgreSQL cannot use an enum value
-- in the same transaction that adds it, and the next migration seeds
-- templates for them.
--
--   matchday_preview  the morning email listing the day's matches
--   matchday_results  the email with the day's final scores
--   round_preview     the email with a coming round's schedule
--
-- The other three email types reuse existing values: match_starting (the
-- favourite-club kick-off alert), deadline_24h (Fantasy deadline reminder)
-- and gameweek_finalized (Fantasy round recap).

alter type app.notification_type add value if not exists 'matchday_preview';
alter type app.notification_type add value if not exists 'matchday_results';
alter type app.notification_type add value if not exists 'round_preview';
