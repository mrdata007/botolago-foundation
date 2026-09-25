-- BotolaGO Production V2
-- Index two foreign keys that a real delete scans in full, one scan per
-- deleted row (audit 2026-09-25 A13 / DB-05, P3).
--
-- The audit listed five foreign keys with no index leading on the
-- referencing column. It asked for measurement before any index, and it said
-- not to drop "unused" indexes. This migration adds two indexes and drops
-- nothing.
--
-- Background: PostgreSQL does not index the referencing side of a foreign
-- key. When a referenced row is deleted, the FK's action runs once per
-- deleted row: a lookup for RESTRICT, or an UPDATE for SET NULL. Without an
-- index leading on the column, each run is a sequential scan of the
-- referencing table.
--
-- Measured 2026-09-25 on a local database (PostgreSQL 17.6, same as
-- production), with synthetic rows at production's sizes. Each parent delete
-- ran for real in a transaction that rolled back, and EXPLAIN ANALYZE
-- reported the time of each FK trigger. Three runs each:
--
--   app.stories.import_converted_by -> auth.users ON DELETE SET NULL
--     Deleting an auth user (account deletion, QA and staging cleanup, 250 a
--     batch in scripts/backend/fantasy-capacity-orchestrator.py) scans all of
--     app.stories: 14,302 rows, 3.3 MB on production. Its sibling created_by
--     has had a partial index since 20260720110053 (stories_created_by_idx).
--     250 user deletes: 267-328 ms in this trigger without the index,
--     1.6-2.0 ms with it (created_by: 2.0-2.8 ms). Production has no story
--     with import_converted_by set yet, so the partial index below starts
--     empty (8 kB). News ingestion never writes an entry into it.
--
--   app_private.notification_email_unsubscribe_tokens.delivery_id
--     -> app.notification_deliveries ON DELETE SET NULL
--     Each email delivery gets one token, kept 365 days, and nothing prunes
--     the table. Every deleted delivery, of any channel, scans the whole
--     table. Deliveries are deleted by api.unregister_my_notification_device
--     (called from the web app; it cascades through the device's push
--     deliveries) and by account deletion (profiles -> notifications ->
--     deliveries). Unregistering one device with 1,000 deliveries, against
--     100,000 tokens (about a year of mail): 5.7-6.5 s in this trigger
--     without the index, 7.5-9.7 ms with it. Writing 10,000 tokens cost
--     137-163 ms without it and 146-202 ms with it, which is within noise.
--     Production has 0 tokens (email is off), so the index is empty when
--     created.
--
-- Deliberately not indexed (measured on production 2026-09-25, read-only):
--   * app.player_fixture_performances.player_id and .team_id (9,258 rows,
--     2.7 MB). Every query of this table in SQL and scripts leads with
--     fixture_id or football_season_id, and the existing composite indexes
--     serve them. The only reader by player_id or team_id alone would be the
--     ON DELETE RESTRICT check when a player or team is deleted. Production
--     has deleted neither, ever: n_tup_del = 0 on app.players (929 rows) and
--     app.teams (21 rows). That check costs 0.9-1.7 ms as a sequential scan.
--     Production already plans the player_id check as an index-only scan of
--     player_fixture_performances_source_key. Two more indexes would slow
--     every performance ingest, which already maintains five.
--   * app_private.fantasy_free_hit_lineup_snapshots.source_lineup_id (0 rows
--     on production). Nothing queries it. The ON DELETE RESTRICT check runs
--     only when a Fantasy lineup is deleted, and only allow-listed
--     maintenance and QA scripts do that. At a hypothetical 10,000 Free Hit
--     activations the check costs 1.3-1.6 ms per deleted lineup.
--
-- A plain CREATE INDEX (a migration runs in a transaction, so CONCURRENTLY is
-- not available) blocks writes to its table while it builds. Reads continue.
-- Measured at production's sizes: 4-11 ms for app.stories. The tokens table
-- is empty on production (49 ms locally at 100,000 rows).
--
-- Both indexes are partial on "is not null". The FK action's
-- "$1 = column" implies it, so the generic plan the FK trigger caches can use
-- them (tested in foreign_key_delete_path_indexes.test.sql). Rows whose
-- reference is already null are never looked up.

create index stories_import_converted_by_idx
  on app.stories (import_converted_by)
  where import_converted_by is not null;

comment on index app.stories_import_converted_by_idx is
  'Serves the ON DELETE SET NULL action of stories_import_converted_by_fkey when an auth user is deleted '
  '(one lookup per deleted user instead of a scan of app.stories). Mirrors stories_created_by_idx. '
  '20260926003300, audit A13 / DB-05.';

create index notification_email_unsubscribe_tokens_delivery_idx
  on app_private.notification_email_unsubscribe_tokens (delivery_id)
  where delivery_id is not null;

comment on index app_private.notification_email_unsubscribe_tokens_delivery_idx is
  'Serves the ON DELETE SET NULL action of notification_email_unsubscribe_tokens_delivery_id_fkey, which '
  'runs once per deleted notification delivery (device unregistration, account deletion). '
  '20260926003300, audit A13 / DB-05.';
