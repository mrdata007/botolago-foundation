# Production V2 migration preflight

Date: 2026-07-25
Repository base: `9b697151e3f1e904c67e8cce3a2162cffa7e2f6c`
Phase: 7E-A (read-only)

## Decision

**READY WITH HUMAN ACCOUNT PREREQUISITES**

Protected run `30151901483` proved the exact Production V2 target
(`tkewgajrljbwgwedqsxn`, `BotolaGO Production V2`, BotolaGO organization,
`eu-west-3`) and health (`ACTIVE_HEALTHY`) before performing a read-only
inventory. The database is a clean V2 target: it has no hosted migration table,
no repository-owned schemas, relations, routines, policies or grants, and no
unexpected Storage, Edge Function, Realtime-table or cron state.

All 35 repository migrations are pending in deterministic order. No group is
blocked by drift or backup readiness. Phase 7E-B may promote only the seven
reviewed groups, with a health/security stop after every group. Owner bootstrap
remains disabled until the Admin group has passed its stop and the real owner
has completed normal signup, email verification, MFA enrollment and fresh AAL2
proof.

Seven successful daily backups were returned, from
`2026-07-19T19:24:13.100Z` through `2026-07-25T01:15:31.475Z`. PITR is
disabled and accepted for this preflight; no billing or backup setting changed.
The known staging ref `srdrflfrfpwixsllveid` was explicitly denied. Legacy was
not queried.

## Repository baseline

| Check                                      | Result                                       |
| ------------------------------------------ | -------------------------------------------- |
| Migration files                            | 35, deterministic timestamp order            |
| Static migration validation                | PASS                                         |
| Clean local replay from zero               | PASS                                         |
| pgTAP/RLS                                  | PASS, 432 assertions across 22 files         |
| Database lint                              | PASS, zero schema errors                     |
| Generated types                            | PASS, synchronized                           |
| Tracked-file secret scan                   | PASS                                         |
| Hosted migration history                   | PASS — empty target, zero hosted rows        |
| Hosted schema/RPC/RLS/grants/storage drift | PASS — no unexpected repository-owned object |

The authoritative repository checksums are the SHA-256 values obtained with:

```sh
shasum -a 256 supabase/migrations/*.sql
```

Phase 7E-B must save that manifest as reviewed evidence. After each migration
group creates and advances `supabase_migrations.schema_migrations`, compare the
hosted version, name and stored-statement checksum before continuing. A
matching version number alone is insufficient.

## Production comparison

| Comparison                       | Result                                                         |
| -------------------------------- | -------------------------------------------------------------- |
| Already present migrations       | 0                                                              |
| Pending migrations               | 35                                                             |
| Missing or unexpected migrations | 0 unexpected; all repository migrations intentionally pending  |
| Checksum mismatches              | None; no hosted migration row exists                           |
| Schema drift                     | None outside the understood empty-target baseline              |
| Function/RPC drift               | None; zero repository-owned routines                           |
| RLS-policy drift                 | None; zero repository-owned tables/policies before promotion   |
| Grant drift                      | None; zero repository-owned grants                             |
| Storage bucket/policy drift      | None; zero buckets and zero repository Storage policies        |
| Exposed-schema drift             | None; only `public` and `graphql_public` are exposed           |
| Realtime drift                   | Empty `supabase_realtime` publication, zero published tables   |
| Edge Function / cron drift       | Zero functions; `pg_cron` absent; zero jobs                    |
| Generated-type compatibility     | Repository PASS; hosted schemas intentionally not promoted yet |

The 35 pending migrations are eligible only for the controlled seven-group
Phase 7E-B sequence. This document does not authorize a single all-at-once
production push.

## Candidate migration inventory

Duration estimates assume an empty or near-empty V2 database and must be
re-measured against a production clone or staging snapshot. `Short` means
normally seconds; `data-dependent` means a populated table can materially
extend locks or index work. Every repair is a reviewed forward migration;
remote resets and destructive down migrations are prohibited.

| Migration                                            | Owner                | Lock and expected duration                                                        | Backfill                                                 | RLS/grant effect                                                  | Forward repair and post-check                                                                 |
| ---------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `20260719215811_greenfield_foundation`               | Foundation           | Schema/default-privilege locks; short                                             | None                                                     | Deny-by-default schemas and default privileges                    | Restore grants/default privileges forward; verify schemas, defaults, helper                   |
| `20260720075453_identity_domain`                     | Identity             | New tables, indexes, triggers; short on empty                                     | Reserved-name seed; profile trigger affects future users | Forced RLS, ownership policies, controlled RPCs                   | Disable affected API contracts then repair; verify trigger, ownership, cross-user denial      |
| `20260720081817_identity_null_validation`            | Identity             | Function replacement; short                                                       | None at migration time                                   | Replaces user RPC validation/grants                               | Restore prior function bodies forward; verify onboarding/follow/account RPC errors            |
| `20260720095330_football_catalog`                    | Football             | New catalog tables plus preference FKs; data-dependent if Identity populated      | None                                                     | Forced RLS/server-write catalog                                   | Repair FKs/functions forward; verify catalogs, temporal membership, browser write denial      |
| `20260720095345_football_match_ingestion`            | Football             | New match tables/indexes/triggers; short on empty                                 | None                                                     | Forced RLS/server-write match data                                | Disable ingestion, repair forward; verify fixture constraints, freshness, duplicate events    |
| `20260720095354_football_api_security`               | Football             | RPCs, policies, live projection table; data-dependent trigger sync                | Live projection may be populated from fixtures           | Public read/service-write grants and forced RLS                   | Revoke affected API execute first; verify public reads, all browser writes denied             |
| `20260720104000_football_index_hardening`            | Football             | Non-concurrent indexes; data-dependent                                            | None                                                     | No new authority                                                  | Drop/recreate only by reviewed forward repair; verify query plans and FK indexes              |
| `20260720110053_news_editorial_catalog`              | News                 | Media ALTERs and new tables/indexes; data-dependent if media exists               | None                                                     | Forced RLS editorial catalog                                      | Freeze editorial writes, repair constraints forward; verify lifecycle/XSS/storage references  |
| `20260720110102_news_search_ingestion`               | News                 | Search/private tables, GIN indexes, triggers; data-dependent                      | Search documents can be trigger-populated later          | Private ingestion and forced RLS                                  | Stop ingestion, rebuild search forward; verify language search and private isolation          |
| `20260720110107_news_api_security`                   | News                 | Large RPC/policy replacement; short, catalog-dependent                            | None                                                     | Public/editorial/saved-article execute grants                     | Revoke affected RPCs then repair; verify draft secrecy, ownership, transition permissions     |
| `20260720110113_news_storage_index_hardening`        | News                 | Bucket insert and indexes; data-dependent                                         | Idempotent bucket metadata seed                          | Storage policy/type/service grants                                | Disable uploads, repair policy/bucket metadata; verify public/private object paths            |
| `20260720114217_news_advisor_index_hardening`        | News                 | Non-concurrent indexes; data-dependent                                            | None                                                     | None                                                              | Forward index repair; verify advisor and plans                                                |
| `20260720121725_notification_catalog`                | Notifications        | Preference ALTERs plus tables/indexes; data-dependent                             | Preference columns receive defaults                      | User ownership and service-write policies                         | Disable delivery calls, repair forward; verify preferences, device ownership, event isolation |
| `20260720121727_notification_delivery_runtime`       | Notifications        | Private runtime tables/triggers; short on empty                                   | None                                                     | Private forced RLS/service-only runtime                           | Keep workers disabled, repair forward; verify transitions, quiet hours, private denial        |
| `20260720121729_notification_api_security`           | Notifications        | Large RPC/grant set; short, catalog-dependent                                     | None                                                     | User RPCs and service-only worker RPCs                            | Revoke runtime RPCs first; verify opt-outs, rate limits, no browser worker execution          |
| `20260720121731_notification_index_hardening`        | Notifications        | Non-concurrent indexes; data-dependent                                            | None                                                     | Read-only metrics RPC changes                                     | Forward index/RPC repair; verify claim/feed plans and metrics bounds                          |
| `20260720132048_notification_fanout_resume`          | Notifications        | Function replacement; short                                                       | None                                                     | Service-only fan-out behavior                                     | Keep provider disabled, restore prior RPC forward; verify cursor resume/idempotency           |
| `20260720141826_fantasy_catalog_rules`               | Fantasy              | New rule/catalog tables/indexes; short on empty                                   | None                                                     | Public reference reads, server writes, forced RLS                 | Keep Fantasy workers disabled; verify rule constraints and browser write denial               |
| `20260720141847_fantasy_teams_transfers_chips`       | Fantasy              | User-owned/private tables and indexes; short on empty                             | None                                                     | Forced RLS; mutations intended through RPCs                       | Disable Fantasy mutations, repair forward; verify ownership/idempotency/lineup history        |
| `20260720141850_fantasy_scoring_leagues_operations`  | Fantasy              | Scoring/league/private job tables; short on empty                                 | None                                                     | Public/private league reads; worker-only scoring                  | Keep workers disabled; verify point/rank write denial and league privacy                      |
| `20260720141854_fantasy_api_security`                | Fantasy              | Large transactional RPC set; short, catalog-dependent                             | None                                                     | Controlled public/owner/service RPC grants                        | Revoke write RPCs then repair; verify deadlines, versions, budget and RLS                     |
| `20260720144832_fantasy_position_seed`               | Fantasy              | Small seed insert; short                                                          | Four canonical positions                                 | No new grants                                                     | Correct seed forward; verify exact position catalog                                           |
| `20260720163222_fantasy_ruleset_v1`                  | Fantasy              | ALTERs, tables, indexes, ruleset seed; data-dependent                             | Versioned v1 rules and rule relations                    | Extends server-authoritative rules/RPCs                           | Disable mutations, repair rules forward; verify ruleset hash and deterministic scoring        |
| `20260720173500_fantasy_route_read_contracts`        | Fantasy              | RPC replacement; short                                                            | None                                                     | Bounded route reads plus owner archive RPC                        | Revoke/restore forward; verify pagination, archive ownership, DTOs                            |
| `20260720174500_fantasy_index_hardening`             | Fantasy              | Non-concurrent indexes; data-dependent                                            | None                                                     | None                                                              | Forward index repair; verify hot-path plans                                                   |
| `20260720183645_fantasy_ruleset_v1_index_hardening`  | Fantasy              | Non-concurrent indexes; data-dependent                                            | None                                                     | None                                                              | Forward index repair; verify FK/advisor coverage                                              |
| `20260720184632_fantasy_standings_keyset_hardening`  | Fantasy              | Ranking indexes; data-dependent                                                   | None                                                     | None                                                              | Forward index repair; verify keyset plans                                                     |
| `20260720191839_fantasy_standings_rpc_pagination`    | Fantasy              | RPC replacement; short                                                            | None                                                     | Public/member standings execute grant                             | Revoke/restore forward; verify privacy, ordering, cursor stability                            |
| `20260722205230_fantasy_team_fk_index_hardening`     | Fantasy              | One non-concurrent index; data-dependent                                          | None                                                     | None                                                              | Forward index repair; verify FK lookup plan                                                   |
| `20260724143000_phase65_football_team_catalog`       | Phase 6.5 / Football | Read RPC; short                                                                   | None                                                     | Bounded public team-catalog execute                               | Revoke/restore forward; verify DTO, language and limit                                        |
| `20260724143100_admin_authorization_foundation`      | Admin 7A             | Large private schema/RPC/seed migration; short on empty, data-dependent otherwise | Role/permission catalog seed                             | Forced private RLS, service/bootstrap/admin contracts             | Keep Admin inaccessible, revoke API grants forward; verify MFA, recent auth, audit, approval  |
| `20260724170941_admin_revocation_dead_letter_status` | Admin 7A hardening   | Enum value addition; short, irreversible in-place                                 | None                                                     | No grant change                                                   | Deprecate value forward; verify status decoding                                               |
| `20260724172623_admin_control_plane_runtime_v2`      | Admin 7B             | ALTER/backfill, indexes, worker tables, RPC replacement; data-dependent           | Existing revocation rows normalized                      | Service worker and protected Admin read/control grants            | Keep worker unscheduled, revoke new RPCs, repair forward; verify leases, audit, dead letter   |
| `20260724185438_admin_security_operations`           | Admin 7C             | Large RPC replacement; short, catalog-dependent                                   | None                                                     | Staff creation/role/suspend/emergency contracts with dual control | Revoke mutation RPCs forward; verify self-approval denial, last-admin guard, immediate denial |
| `20260724225105_admin_activation_operations`         | Admin 7D             | Two read-only RPCs; short                                                         | None                                                     | Execute only to service role                                      | Revoke/drop forward if needed; verify authenticated denial and safe readiness DTOs            |

## Required promotion batching

The clean target contains no application data, but the chain is still **not
approved as one undifferentiated push**. Phase 7E-B must promote in dependency
groups, stopping after each group:

1. Foundation.
2. Identity.
3. Football.
4. News and Storage policy.
5. Notifications, with all delivery providers and schedules disabled.
6. Fantasy, with all workers and schedules disabled.
7. Admin 7A through 7D, with owner bootstrap still disabled.

Each group requires migration-history verification, database health, advisor
review, grants/RLS smoke tests, and an application fail-closed check before the
next group. Groups 1–6 are safe to promote with their mandatory stops and
workers/providers disabled. Group 7 requires a separate Admin stop before any
human bootstrap. No group is blocked by drift or backup readiness.

## Production diff procedure

Protected run `30151901483` completed this read-only procedure against main
commit `9b697151e3f1e904c67e8cce3a2162cffa7e2f6c`:

1. Assert the environment ref equals the independently approved Production V2
   ref and differs from Staging V2 and Legacy.
2. Fetch project identity, organization, health, compute, database version and
   backup/PITR state.
3. Read hosted migration history; prove that the CLI migration table is absent
   and therefore all 35 repository migrations are pending.
4. Inventory schemas, extensions, tables, routines, triggers, RLS flags,
   policies, grants, Storage buckets/policies, publications and cron jobs with
   bounded queries.
5. Diff that inventory against a clean local replay.
6. Classify each migration as present, pending, unexpected, or mismatched.
7. Stop on any unexplained object or history difference; none was found.

Phase 7E-A establishes eligibility for the controlled seven-group Phase 7E-B
window. It does not itself authorize or apply a migration.
