# Firebase migration: shared backend for BotolaGO web and mobile

## Decision and delivery status

The owner has confirmed Firebase as BotolaGO's long-term backend. The existing
React/TanStack web application will be the companion portal for the planned
Flutter Android/iOS application. Both must share accounts, profiles, squads,
transfers, scores, leagues and content.

This document is the migration design and implementation backlog, not evidence
that migration or deployment has happened. Firebase/Firestore is the proposed
implementation below. No Firebase project has been selected or provisioned.
No cloud billing has been enabled. Development should begin with Firebase
emulators; production deployment is a later milestone.

Source baseline: main commit
`4fba9109f751adc2e7b920f919bfedd4b522a5e0`.
The current production Supabase project is
`tkewgajrljbwgwedqsxn`, organization `bfhahpanhnoueripxshw`.
It was last verified INACTIVE. Its contents remain unverified.
The alternate Lovable project is not a production backup.

## Architecture

| Concern | Proposed target | Constraint |
| --- | --- | --- |
| Web portal | Existing React/TanStack application | Preserve French/Arabic routes and public article metadata. |
| Mobile | Flutter Android/iOS | Consume the same versioned backend contracts as web. |
| Authentication | Firebase Authentication | Preserve source user IDs where supported; map IDs explicitly if necessary. |
| Application database | Cloud Firestore | Redesign queries and relationships; do not mechanically copy PostgreSQL tables. |
| Trusted commands | Cloud Functions for Firebase | Validate identity, ownership, input, deadline, version and budget server-side. |
| Football/news ingestion | Trusted workers and scheduled functions | Retain provider rights, validation, deduplication and retry controls. |
| Notifications | Persisted inbox plus Firebase Cloud Messaging | Push is a delivery mechanism, not the source of account or scoring state. |
| Media | Cloud Storage for Firebase | Migrate object bytes and access controls separately from database records. |
| Administration | Existing web admin UI with Firebase-backed services | Enforce admin capabilities on the server, not just in route guards. |

One Firebase project per environment, with web, Android and iOS app registrations
inside the same environment project. Use separate development/staging/production
environments. Project IDs, regions, authorized domains, bundle IDs and package
names must be resolved before cloud setup; do not invent them.

Retain current web hosting initially. Hosting and backend migrations do not have
to be coupled.

## Existing code to preserve and replace

| Existing source | Migration treatment |
| --- | --- |
| `src/backend/contracts/repository.ts` | Keep provider-neutral identifiers, context and cursor contracts. |
| `src/backend/fantasy/contracts.ts` | Preserve schemas and public behavior; derive versioned mobile API contracts. |
| `src/backend/fantasy/{rules,pricing,scoring,substitutions,ranking,finalization,fixture-assignment}.ts` and tests | Reuse compatible pure logic after dependency review; use as parity fixtures. |
| `src/backend/fantasy/supabase-repository.ts` | Implement a Firebase-backed adapter against equivalent trusted commands and reads. |
| `src/backend/identity/supabase-repositories.ts` | Replace profile, follow, username, deletion and session operations. |
| Football/news repositories and ingestion gateways | Replace Supabase persistence while retaining provider adapters and validation. |
| Notification repositories, fanout, dispatcher and gateway | Port persistence and delivery with idempotent job handling. |
| Admin repositories, route access and revocation worker | Replace database authorization and token/session handling end to end. |
| Supabase integrations and SQL migrations/tests | Inventory SQL-only behavior; port invariants to transactions, rules and tests. Preserve migration history. |
| `supabase/functions/football-ingest/index.ts`, news ingestion functions and scheduled workflows | Map every trigger, credential dependency, checkpoint and retry policy before activation. |

TypeScript tests do not cover every SQL trigger, constraint, policy or RPC.
Inventory those before declaring behavior parity. Keep PR #126's article
metadata and formatting repairs in the release backlog; that PR is separate.

## Proposed Firestore model

These are design targets, not deployed collections. Final fields and composite
indexes must follow the actual repository queries and exported source data.

| Collection or document group | Role and access |
| --- | --- |
| `profiles/{uid}` | Private preferences and onboarding; self-access through validated operations. |
| `publicProfiles/{uid}` | Explicitly limited public display fields; exclude private preferences and contact details. |
| `usernames/{normalizedName}` | Transactional unique-name reservation; no general client writes. |
| `teams`, `players`, `competitions`, `seasons`, `fixtures` | Canonical catalog with stable IDs and provider mappings; published reads, trusted writes. |
| `articles` | Published sanitized metadata/content according to provider rights. |
| `fantasySeasons/{seasonId}` and gameweek documents | Immutable ruleset reference, activation state, deadlines and fixture assignment versions. |
| `fantasyTeams/{teamId}` | Owner ID, season, squad, budget, purchase prices and optimistic version; trusted writes only. |
| Team gameweek snapshots and transfer records | Auditable lineup, transfers and chip state; immutable/versioned where appropriate. |
| `leagueMembers`, league documents and standings projections | Membership checks for private leagues; never expose invite codes in public projections. |
| Versioned player/team points and ranking projections | Trusted calculation output; support corrections without double scoring. |
| `profiles/{uid}/notifications` and device registrations | Owner-scoped inbox/preferences; protect device tokens. |
| Command receipts, ingestion checkpoints, jobs and admin audit records | Server-only; carry retry/idempotency and audit state. |

Use bounded documents, cursor pagination and query-specific indexes. Avoid
unbounded arrays of league members, transfers or notification history.
Use deterministic membership/uniqueness documents where SQL previously supplied
unique constraints. Prefer integer tenths for fantasy prices, converting at the
API boundary; validate every conversion against existing pricing tests.

## Fantasy behavior must stay consistent

The source of truth is `docs/backend/FANTASY_RULES_V1.md`, ruleset
`botolago-fantasy-v1.0`. Migration must preserve its complete scoring table,
chips, price changes, substitutions, corrections and ranking tie-breakers.

Key acceptance cases include:

- 100.0 initial budget, 15 players, 2 GK / 5 DEF / 5 MID / 3 FWD,
  maximum three players per canonical football team.
- Eleven starters, valid formation, captain and distinct vice-captain.
- Deadline 90 minutes before the first assigned fixture, enforced by trusted
  server time; device clocks cannot authorize late writes.
- Atomic transfers, server sale prices, expected version, free-transfer
  allowance and four-point hits.
- One chip per gameweek; preserve non-cancellable confirmed activation,
  allocation windows and exactly-once Free Hit restoration.
- Deterministic scoring, substitutions and ranking, including retries,
  double gameweeks and corrected provider events.

Do not infer allowed behavior solely from method names: the existing adapter
contains `cancelChip`, while the approved ruleset says confirmed activation is
non-cancellable. Inspect its SQL behavior and port the enforced invariant.

Every mutation authenticates on the server. Never trust a client-supplied
`actorId`, budget, points total or admin flag. Transactions must reread the team,
version, relevant deadline and applicable catalog/pricing state. Command receipts
must be committed atomically with the mutation and scoped to actor and operation.
A reused key with different input is rejected. Retried scoring and ingestion
must not apply changes twice.

A command started before a deadline must not gain an unlimited retry window
after it: re-evaluate trusted time and transaction state on retries. Snapshot
lineups through the authoritative deadline process, not a client timer.

## Implementation stages and exit criteria

| Stage | Work | Exit evidence |
| --- | --- | --- |
| 0. Design | This decision, source inventory and migration gates | Reviewable migration document on an isolated branch. |
| 1. Local foundation | Emulator configuration, pinned dependencies/lockfile, Firebase adapter boundaries, default-deny rules, Auth verification | Local tests prove unauthorized and cross-user operations fail; production stays on its existing backend. |
| 2. Identity and catalog | Accounts, profiles, username reservation, follows, published football/news reads and indexes | Web account lifecycle and paginated catalog tests pass with explicit test fixtures. |
| 3. Fantasy commands | Team creation, lineup, transfers, chips and leagues with transactions and receipts | Existing rule fixtures plus competing-web/mobile-command, retry and deadline tests pass. |
| 4. Workers and admin | Ingestion, scoring, corrections, rankings, inbox/push, admin capabilities and revocation | Replay tests show no duplicates; unauthorized administration fails; workers expose failures and checkpoints. |
| 5. Data rehearsal | Read-only source export, conversion, identity and media import into staging, reconciliation | Counts, IDs, relationships, ownership, balances, histories and sampled scores reconcile; source export is retained. |
| 6. Shared-client acceptance | Wire web adapters and Flutter client to staging | Register on one client, use the same account/team on the other; save/reload, transfer, scoring and league journeys pass. |
| 7. Production cutover | Final source snapshot/delta, controlled write freeze, deployment, smoke checks and monitoring | No data discrepancies or critical journey failures; tested rollback procedure and release record exist. |

Completed now: stage 0 only. Later stages are implementation work, not certified
functionality. Local foundation can proceed without recovering Supabase; source
data migration cannot.

## Data preservation and authentication

1. Obtain authorized access or a usable backup of Production V2. Confirm its
   own schema/migration state and all relevant schemas, not only `public`.
2. Export business records, auth users, object inventory/bytes and provider
   mapping IDs through an authorized route. Store sensitive exports privately.
3. Record export timestamp, counts and checksums. Rehearse deterministic
   conversion and referential-integrity validation before any source deletion.
4. Preserve IDs when possible. Keep an explicit immutable mapping if IDs change,
   including ownership and league membership links.
5. Firebase Auth supports importing compatible password hashes. Validate the
   actual source algorithm and an isolated test login before promising password
   continuity. Existing Supabase sessions will not become Firebase sessions;
   users need a new sign-in. Reconfigure social providers and recovery links.
6. Export/import storage objects separately and update references only after
   validating their access rules and availability.
7. Reconcile counts and sampled full journeys. An empty alternate database is
   not evidence that production is empty.

No reset, reseed or deletion of Production V2 is part of this plan. If it cannot
be recovered, starting with a new catalog is a separate data-loss decision that
must be explicitly discussed with the owner.

## Security, cutover and operations

- Default-deny Firestore and Storage rules; add narrowly tested reads/writes.
- Admin SDK access bypasses Firestore rules: server authorization is mandatory
  for every protected endpoint and worker.
- Validate Firebase tokens and revocation as required; protect web session cookies
  and CSRF boundaries if SSR sessions are used.
- Bind admin privileges to trusted role state and test revocation. App Check
  supplements authentication and ownership checks; it does not replace them.
- Only one backend accepts business writes at a time. Avoid ad hoc dual writes.
- Keep the source snapshot, application release and mapping manifest for rollback.
  If new Firebase writes have occurred, rollback requires reconciled replay/export
  or an explicitly accepted recovery point; changing a URL alone is not rollback.
- Verify missing legal/settings/notification destinations from the existing audit.
  Complete real operator details before publishing policies.
- Validate French/Arabic and mobile layouts; test actual production after release.
- Add backup/restore exercises, error monitoring, job freshness and cost monitoring.

## Budget and access boundaries

The owner cannot pay now. Begin with local emulators and test data. This is not a
promise that a live Firebase deployment will be free.

Cloud Functions deployment requires Blaze billing. Storage and other services
have their own current billing requirements; recheck the intended configuration
before activation. Budget alerts are not a hard spending cap. Limit query sizes,
listener scope, worker frequency, retries and function scaling. Football/news
provider subscriptions are separate costs.

No Firebase connector was found in this session's plugin directory search.
Cloud provisioning will need an authorized Firebase/Google Cloud connection or
CLI sign-in and a selected project. Do not ask for secrets in chat or enable
billing merely to finish setup.

## Official references

- Flutter/web/iOS/Android setup: https://firebase.google.com/docs/flutter/setup
- Firestore document model: https://firebase.google.com/docs/firestore/data-model
- Functions and emulator/deployment prerequisites: https://firebase.google.com/docs/functions/get-started
- User/password-hash imports: https://firebase.google.com/docs/auth/admin/import-users
