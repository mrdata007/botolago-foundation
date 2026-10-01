# Player ID mapping table and admin review screen: design

Design only. No migration, no database write, no application code in the PR that
carries this document. `AGENTS.md` and `CLAUDE.md` apply in full when it is built
(forward-only migrations with unique timestamps, staging first, one writer per
database, production only through the owner-run path, dry run first).

This builds on [`FANTASY_PROVIDER_PLAYER_MAPPING_DESIGN.md`](FANTASY_PROVIDER_PLAYER_MAPPING_DESIGN.md),
which says why the mapping must come before ingestion (Steps A to D). This document
says what the table and the review screen are.

## 1. What this has to solve

The reconciler (`src/backend/fantasy/provider-reconciler.ts`) pairs a Sofascore player
and a Flashscore player only on evidence it can defend: an incident both providers
attribute to the same pair, or a shirt number for a player nobody mentions in any
incident. Where the providers number a player differently it cannot pair them, and a
match goes to review or players are held back (3 of the 7 Phase 0 matches). A reviewed
mapping from each provider's player id to the app's player removes that, with no
guessing, and gives Phase 4 a safe identity.

A wrong mapping gives one player another player's points, so the design treats mapping
as a controlled change, not a convenience.

## 2. What already exists and is reused

| Piece                       | Where                                                                                                                                                                                                | Use here                                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mapping table               | `app_private.football_provider_mappings` (migration `20260720095345`)                                                                                                                                | stores the approved mapping, unchanged                                                                                                                 |
| Uniqueness                  | `(provider_name, entity_type, external_id)` and `(provider_name, entity_type, internal_entity_id)`                                                                                                   | one provider id maps to one app player, and one app player has at most one id per provider: a second record for the same person cannot be mapped twice |
| Manual correction fields    | `manually_corrected`, `correction_reason` (10 to 500 chars), `corrected_by`, `corrected_at`, with a check that they go together                                                                      | every approved row is a manual correction with a reason and a person                                                                                   |
| Target check                | trigger `validate_provider_mapping_target` (the `player` target must exist in `app.players`)                                                                                                         | a mapping can only point at a real app player                                                                                                          |
| Permission                  | `football.manage_mappings` (held by `football_operator` and `platform_admin`)                                                                                                                        | who may propose and decide                                                                                                                             |
| Admin plumbing              | `loadAdminStaffRouteAccess`, `AdminSurfaces`, `AdminDestructiveAction`, the approvals queue (`/admin/approvals`), the audit log (`/admin/audit`), repository and DTO pattern in `src/backend/admin/` | the screen is built on these, not beside them                                                                                                          |
| Authority rules             | `ADMIN_DUAL_CONTROL_MATRIX.md`: distinct humans, AAL2, recent authentication, immutable fingerprint, idempotency key, reason, append-only audit                                                      | the approval rules below follow it                                                                                                                     |
| Precedent for unmapped rows | `20260802010200_historical_performance_mapping_quarantine.sql` quarantines lineup players with no mapping                                                                                            | same idea: unmapped is listed, never guessed or created                                                                                                |

No change to the mapping table is needed. Two new providers are registered
(`sofascore`, `flashscore` in `app_private.football_providers`).

## 3. Data model (new)

All in `app_private`, no browser access (as for the other admin tables), RLS on, no
direct grants; the admin repository calls trusted functions.

### 3.1 `football_player_mapping_candidates` (what the reviewer sees)

One row per provider player id that the system has seen and cannot map yet.

| Column                                                           | Meaning                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `id`                                                             | uuid                                                                                                   |
| `provider_name`                                                  | `sofascore` or `flashscore`                                                                            |
| `external_id`                                                    | the provider's player id                                                                               |
| `team_id`                                                        | the app team, when the team is mapped                                                                  |
| `season_id`                                                      | the season it was seen in                                                                              |
| `first_seen_fixture_id`, `last_seen_fixture_id`, `fixtures_seen` | where and how often                                                                                    |
| `shirt_numbers_seen`                                             | the numbers it wore, per fixture (can differ between providers)                                        |
| `position_seen`                                                  | `G`, `D`, `M`, `F` or unknown                                                                          |
| `display_name`                                                   | **shown to the reviewer only, never read by any code that decides a match**                            |
| `blocked_fixtures`                                               | fixtures currently in review or with players held back because of this id (what approving it unblocks) |
| `status`                                                         | `unmapped`, `proposed`, `mapped`, `ignored`                                                            |

`display_name` is third-party text, kept short and private (no browser role can read
the table). Retention: purge candidates mapped or ignored for more than 90 days.

### 3.2 `football_player_mapping_proposals` (a decision waiting for a second person)

One row per proposed pairing: an app player, the Sofascore id and the Flashscore id
that are that person.

| Column                                            | Meaning                                                                                                                                                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `batch_id`                                  | a proposal belongs to a batch (a batch of one is allowed)                                                                                                                                      |
| `app_player_id`                                   | the app player (`app.players`)                                                                                                                                                                 |
| `sofascore_external_id`, `flashscore_external_id` | either may be null for a player one provider does not list                                                                                                                                     |
| `basis`                                           | `incident` (both providers attributed the same goal, card or substitution to the pair), `shirt_position` (same side, shirt number and position, no incident), `manual` (the reviewer chose it) |
| `evidence`                                        | jsonb: fixture ids, incident kinds and minutes, shirt numbers per provider, positions. References and counts only, no provider payloads                                                        |
| `status`                                          | `pending`, `approved`, `rejected`, `expired`, `executed`, `cancelled`                                                                                                                          |
| `requested_by`, `requested_at`, `reason`          | the proposer (a human), and why                                                                                                                                                                |
| `decided_by`, `decided_at`, `decision_reason`     | a different human                                                                                                                                                                              |
| `fingerprint`                                     | hash of the payload; any change invalidates an approval                                                                                                                                        |
| `expires_at`                                      | pending proposals expire (default 72 hours)                                                                                                                                                    |

Constraints: a pending proposal cannot name an app player or a provider id that already
has an active mapping or another pending proposal (a replacement is a separate,
explicit operation, section 5.4). `requested_by <> decided_by` is enforced in the
database, not only in the screen.

### 3.3 What approval writes

On execution, one transaction writes up to two rows to `football_provider_mappings`
(one per provider id present): `entity_type = 'player'`, `internal_entity_id` the app
player, `manually_corrected = true`, `correction_reason` from the proposal,
`corrected_by` the approver, `corrected_at` now. The unique constraints make a
double-mapping impossible. The proposal moves to `executed`; the candidate rows move to
`mapped`. An append-only audit event records request, decision and execution with the
correlation id, as for every admin mutation.

Rollback is forward-only: deactivate (`active = false`) with a reason through the same
two-person flow, never delete.

## 4. How the reconciler uses it

`ReconcileInput` gains an optional identity map: provider id to app player id, for each
provider. Rules, strongest first:

1. **Mapping.** Two entries whose ids map to the same app player are the same player
   (basis `mapping`). A differing shirt number no longer matters.
2. **An incident disagrees with a mapping** (the providers attribute one goal to two
   different mapped players): the whole match goes to review, as for any scorer
   disagreement. A mapping never overrides what the two incident lists say.
3. **One id mapped, the other not:** the player is not paired and is listed as
   unmatched. No fall back to shirt number for a player whose id is mapped to someone
   else.
4. **Neither mapped:** today's strict rules apply (incident, or shirt for a player with
   no incidents), so matches before the table is full keep working.
5. **One app player in at most one record per fixture.** This is the check the
   lineup-fallback case needs (the same defender can otherwise come out twice). When two
   records resolve to one app player the fixture goes to review.

The reconciler reads the map it is given; it does no database access.

## 5. The review screen

Route: `/admin/football/player-mappings`, `ssr: false`, loader `loadAdminStaffRouteAccess`
like the other admin routes, visible only with `football.manage_mappings` (read-only
view with `football.read_operations`). Copy in French and Arabic (RTL), through the
existing dictionaries; no authority is inferred from route state or client storage.

### 5.1 Queue

```
Player mappings                                   [ Club ▾ ] [ Season ▾ ] [ Basis ▾ ] [ Status ▾ ]
-------------------------------------------------------------------------------------------------
 Unmapped 212   Proposed 14   Waiting for approval 3   Mapped 1,140   Ignored 9

 [ ] Strong matches (47)                                                 Approve selected as batch
 ----------------------------------------------------------------------------------------------
 [ ] Sofascore  Hamza El Janati  #6 M   Flashscore  El Janati H.  #21   → app: Hamza El Janati
       basis: incident (goal, 26', both providers)   fixtures seen 3     unblocks 2 fixtures
 ...
 Needs a person (165)
 ----------------------------------------------------------------------------------------------
   Sofascore  Mouad Goulouss  #99 M          no candidate yet          [ Review ]
```

- "Strong matches" are proposals with basis `incident` in two or more different
  fixtures and no contradiction (same position, no conflicting incident). They are
  pre-filled, never pre-approved.
- Sorted by what is blocked: players who hold back the most fixtures first.
- Status is always text plus an icon, never colour alone (the kit's badge tones).

### 5.2 Detail and comparison

```
 Sofascore                         Flashscore                       Candidates in the app (same team)
 Hamza El Janati                   El Janati H.                     (o) Hamza El Janati    DOB 1999-03-02  M
 id 1…  #6  M  starter             id 7…  #21  starter                 signals: incident ✓ 2 fixtures, position ✓, shirt ✗
 seen: DHJ-CODM, +2                seen: DHJ-CODM, +2               ( ) Hamza El Janati II DOB 2003-…       F
 Evidence
   DHJ-CODM  goal 26' (Sofascore) / 26' (Flashscore)  -> same scorer by goal order
   ...
 Impact: approving unblocks DHJ-CODM (review) and 2 held-back players
 Reason (required, 10 to 500 chars) [____________________________]
 [ Propose mapping ]  [ Reject ]  [ Mark as not a Botola player ]  [ Skip ]
```

- Names are shown so a person can read them, and labelled "for reading only".
- The candidate list comes from the app's own squad for that team and season, filtered
  by position, with the signals computed per candidate. Date of birth is shown when the
  app has it, because it is a name-independent check; **whether the providers' squad
  endpoints expose date of birth has not been verified, and must be read from real
  responses before this column is promised.**
- Nothing is pre-selected for a player with no incident evidence.

### 5.3 Approval

`/admin/approvals` gains a type, "Player mapping batch". The second operator sees the
batch as a table (proposed pairs, basis, evidence, impact), can open any row, and
approves or rejects the batch as a whole or row by row. A changed fingerprint, an expired
proposal, or the proposer opening their own batch removes the approve control and says
why. Execution is a separate, exactly-once step by a qualified operator, as the matrix
requires for sensitive changes.

### 5.4 Replace or deactivate an existing mapping

Same two-person flow, with a mandatory reason and a warning showing which fixtures and
scored points the old mapping touched. Never silently overwritten (a manual correction is
never replaced by a proposal).

### 5.5 States the screen must handle

Empty queue, loading, server error with a retry, permission denied, a candidate already
mapped meanwhile (conflict, refresh), a proposal that expired, a stale fingerprint, and a
read-only mode for staff without the write permission. Desktop first, tables that stay
usable at tablet width, keyboard navigable, no colour-only meaning.

## 6. Authority

| Operation                    | Requester                                                                  | Approver                   | Notes                                      |
| ---------------------------- | -------------------------------------------------------------------------- | -------------------------- | ------------------------------------------ |
| Read the queue and evidence  | `football.read_operations` or `football.manage_mappings`                   | none                       | read only                                  |
| Propose a mapping or a batch | `football.manage_mappings`, AAL2, recent authentication                    | none                       | needs a reason; creates a pending proposal |
| Approve or reject            | a different `football.manage_mappings` holder, AAL2, recent authentication | n/a                        | self-approval refused by the database      |
| Execute                      | a qualified `football.manage_mappings` operator                            | prior independent approval | exactly once, idempotency key              |
| Replace or deactivate        | as above                                                                   | as above                   | warning and reason mandatory               |
| Mark as not a Botola player  | `football.manage_mappings`                                                 | none                       | reversible, audited                        |

This adds rows to the dual-control matrix; it does not change any existing row. All steps
write append-only audit events with the same correlation id.

**Owner decision (recommended default first):** two-person approval for every mapping, with
the "strong matches" batch making it one approval for dozens of rows, or a single reviewer
for strong matches only. The cost of a wrong mapping is wrong points for a real player, so
the recommendation is two people for everything.

## 7. Repository contract (sketch)

In `src/backend/admin/`, next to the existing repositories, with DTOs and stable errors:

- `listMappingCandidates(filter, cursor)`, `getMappingCandidate(id)`
- `listMappingCandidatesForAppPlayer(candidateId)` (the candidate list with signals)
- `proposeMappings(batch, idempotencyKey, reason)`
- `decideMappingProposal(id, decision, reason, fingerprint)`
- `executeMappingBatch(batchId, idempotencyKey)`
- `deactivateMapping(mappingId, reason, idempotencyKey)`

Stable error codes: `mapping_already_exists`, `app_player_already_mapped`,
`proposal_expired`, `fingerprint_mismatch`, `self_approval_denied`, `not_authorized`,
`stale_candidate`. The visual console calls these and nothing else.

## 8. How the first data gets in

1. Register the two providers (one migration, two rows).
2. A read-only script lists squads per club from each provider. **The squad endpoints were
   not called in Phase 0; their names and fields must be read from real responses before
   anything is built on them.** About 16 clubs x 2 providers = 32 requests per season,
   well inside the 500 a month, repeated only for transfers.
3. The proposal builder fills the candidates table from (a) squads and (b) every reconciled
   match: pairs the reconciler confirmed by incident become `incident` proposals with their
   evidence, so each match played makes the next review shorter.
4. A person reviews one club, then the rest. The first import is the main effort (about 25
   players a club), and is mostly confirming pre-filled pairs.

## 9. Tests to write when it is built

- pgTAP: the unique constraints, `requested_by <> decided_by`, an execution writes both
  rows or neither, a pending proposal cannot name an already mapped player, expiry, the
  fingerprint check, forward-only deactivation.
- Reconciler: mapping beats shirt number; an incident that contradicts a mapping sends the
  match to review; one app player in two records sends the match to review; a map entry
  missing for one provider leaves the player unpaired.
- Admin repository and route tests with the mock repository pattern used by
  `/admin/approvals`, including the French and Arabic copy gate.
- A browser test of the queue, the comparison and the approval for the strong-match batch
  on the development server with sample data only.

## 10. Order of work

1. This design reviewed.
2. Register the providers (one migration), staging first.
3. The squad probe and the candidate builder, read-only.
4. The proposal and candidate tables, the trusted functions, pgTAP.
5. The repository, then the screen (the Lovable Admin Console handoff applies: it calls
   the repository and infers no authority).
6. The reconciler's identity input.
7. Only then Phase 4, the ingestion worker.

## 11. Open decisions for the owner

1. Two-person approval for every mapping (recommended), or a single reviewer for strong
   matches.
2. Whether the providers' squad endpoints give a name-independent attribute (date of birth,
   height) usable as a signal. To be checked on real responses, not assumed.
3. Retention of provider display names in the candidates table (default 90 days after the
   candidate is mapped or ignored).
4. Who are the `football_operator` reviewers, and whether a second operator exists for the
   approval step.
5. Whether Arabic spellings of player names are needed on this screen (the app's catalog
   names are shown as they are).
