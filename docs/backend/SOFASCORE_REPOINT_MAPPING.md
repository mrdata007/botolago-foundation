# SofaScore fixture re-point

Phase P4, part 1 of `SOFASCORE_FULL_MIGRATION_PLAN.md`. Migration
`20261010140000_sofascore_repoint_fixture_mapping.sql`.

SofaScore gives a replayed postponed match a new event id. The mapping table
is unique on (provider, entity type, external id) and on (provider, entity
type, internal entity id), and `api.resolve_football_mapping` only inserts or
confirms, so it raises `MAPPING_COLLISION` instead of moving a mapping.
`api.repoint_football_fixture_mapping` moves it.

## Contract

```
api.repoint_football_fixture_mapping(
  p_provider_name text,        -- only 'sofascore'
  p_internal_fixture_id uuid,
  p_old_external_id text,
  p_new_external_id text,
  p_reason text                -- 10 to 500 characters, trimmed
) returns jsonb
```

- Service role only (execute is revoked from public, anon and authenticated;
  the body also checks the request role).
- Fixtures only: it looks up the `fixture` mapping of that internal fixture.
- Requires the active mapping `(sofascore, fixture, old)` to that fixture.
  Missing or inactive: `MAPPING_NOT_FOUND`. A different current id:
  `MAPPING_OLD_ID_MISMATCH`.
- The new id already mapped to any fixture: `MAPPING_COLLISION`.
- Updates `external_id` in place (same row id), sets `last_seen_at` and
  `source_version = 'repoint-from-<old id>'`.
- Idempotent: already on the new id returns `{"status":"unchanged"}` and
  writes nothing.
- Each move is one row in `app_private.admin_audit_events` (action
  `football.repoint_fixture_mapping`, domain `football`, target = the
  fixture id, old and new external id in `safe_before` and `safe_after`).

Other errors: `REPOINT_PROVIDER_NOT_ALLOWED`, `REPOINT_INVALID_ARGUMENT`,
`REPOINT_REASON_REQUIRED`, `PT403 forbidden`.

## How the ID bridge should call it

In apply mode, for each re-point the dry run reports, after the migration is
applied and with the owner's go-ahead for that run:

1. Call `api.repoint_football_fixture_mapping('sofascore', <fixtureId>,
   <old event id>, <new event id>, <reason naming the postponement>)` with
   the service role, one fixture per call (each call is its own transaction).
2. Then run the normal `api.resolve_football_mapping` confirm for the new id.
3. Treat `unchanged` as success on a re-run; stop and report on any error.

The bridge currently refuses to run while re-points are pending. That PR is
updated separately to call this function; this change does not touch it.
Applying the migration is a deploy and needs the owner's approval.
