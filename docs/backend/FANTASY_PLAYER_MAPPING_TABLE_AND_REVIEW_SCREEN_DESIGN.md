# Player ID mapping table and admin review screen: design

Design only. No migration, no database write, no application code in the PR that
carries this document. `AGENTS.md` and `CLAUDE.md` apply in full when it is built
(forward-only migrations with unique timestamps, staging first, one writer per
database, production only through the owner-run path, dry run first).

This builds on [`FANTASY_PROVIDER_PLAYER_MAPPING_DESIGN.md`](FANTASY_PROVIDER_PLAYER_MAPPING_DESIGN.md),
which says why the mapping must come before ingestion (Steps A to D). This document
says what the table and the review screen are.

## 0. Owner decisions and design corrections (1 Oct 2026)

These are decided. The rest of the document is written to them.

| #   | Decision                                                                                                                                                                                                                                                                                                                    | Where it lands       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| D1  | **Two-person approval for every production player mapping.** Strong matches may be grouped in batches, but each executed mapping still has a proposer, a different approver, AAL2, recent authentication, an immutable fingerprint, a reason and an audit event. There is no single-review shortcut.                        | sections 3.2, 5.3, 6 |
| D2  | **Date of birth is a strong name-independent signal only if real Sofascore or Flashscore responses prove the field exists and is sufficiently populated.** Height may be shown as corroboration, never as an identity key. Nothing is designed against an assumed endpoint or field. The evidence is in section 12.         | sections 5.2, 12     |
| D3  | **Retention.** Provider display names are purged 90 days after the candidate becomes `mapped` or `ignored`. Everything else is kept: provider ids, app player id, fixture references, evidence signals, fingerprints, proposal and approval decisions, reasons, audit events. Only third-party display-name text is purged. | section 3.4          |
| D4  | **At least two distinct authorized humans are required in production.** Self-approval protection is not weakened if only one `football_operator` exists. The system shows "second qualified reviewer required" and provides no bypass.                                                                                      | sections 5.5, 6      |
| D5  | **Arabic.** No separately curated Arabic player-name spellings in v1. The admin interface itself has French and Arabic copy and RTL support. Player names are shown exactly as stored in the app catalog and the provider evidence.                                                                                         | section 5.6          |
| A   | **Position is a ranking signal, not a hard filter.** It never hides an otherwise plausible same-team candidate, never rejects a pairing by itself, and a contradiction is visibly flagged.                                                                                                                                  | sections 5.2, 3.2    |
| B   | **"Not a Botola player" is a durable production classification and needs dual control** (propose, a different person approves, execute), like a mapping: reversible, reason required, fingerprinted, audited, impossible to self-approve. "Skip for now" stays a personal, non-mutating screen action.                      | sections 3.5, 5.3, 6 |

## 1. What this has to solve

The reconciler (`src/backend/fantasy/provider-reconciler.ts`) pairs a Sofascore player
and a Flashscore player only on evidence it can defend: an incident both providers
attribute to the same pair, or a shirt number for a player nobody mentions in any
incident. Where the providers number a player differently it cannot pair them, and a
match goes to review or players are held back (3 of the 7 Phase 0 matches). A reviewed
mapping from each provider's player id to the app's player removes that, with no
guessing, and gives Phase 4 a safe identity.

A wrong mapping gives one player another player's points, and a wrong "not a Botola
player" removes a real player's points, so the design treats both as controlled changes,
not conveniences.

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

**Invariants this design keeps** (owner requirement):

- the existing table `app_private.football_provider_mappings` and its two unique
  constraints are the only place a mapping lives; nothing is added to it and nothing
  duplicates it;
- the candidate and proposal tables are workflow and evidence tables only; deleting every
  row of them never changes what is mapped;
- names are for human reading only and are never machine identity: no code that decides a
  match, a proposal, a fingerprint or a mapping reads a name;
- a mapping that contradicts the two providers' incident lists sends the fixture to
  review (section 4);
- one app player appears at most once per fixture (section 4);
- there is no deletion: a mapping is deactivated or replaced forward-only, with a reason,
  through the same two-person flow.

No change to the mapping table is needed. Two new providers are registered
(`sofascore`, `flashscore` in `app_private.football_providers`).

## 3. Data model (new)

All in `app_private`, no browser access (as for the other admin tables), RLS on, no
direct grants; the admin repository calls trusted functions.

### 3.1 `football_player_mapping_candidates` (what the reviewer sees)

One row per provider player id that the system has seen and cannot map yet.

| Column                                                           | Meaning                                                                                                                                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                             | uuid                                                                                                                                                                                              |
| `provider_name`                                                  | `sofascore` or `flashscore`                                                                                                                                                                       |
| `external_id`                                                    | the provider's player id                                                                                                                                                                          |
| `team_id`                                                        | the app team, when the team is mapped                                                                                                                                                             |
| `season_id`                                                      | the season it was seen in                                                                                                                                                                         |
| `first_seen_fixture_id`, `last_seen_fixture_id`, `fixtures_seen` | where and how often                                                                                                                                                                               |
| `shirt_numbers_seen`                                             | the numbers it wore, per fixture (can differ between providers)                                                                                                                                   |
| `position_seen`                                                  | `G`, `D`, `M`, `F` or unknown, as the provider gave it                                                                                                                                            |
| `attributes_seen`                                                | jsonb of provider-supplied attributes, only those section 12 proves exist (provider birth date and height for Sofascore); `null` where the provider did not send one. Display and signal only     |
| `display_name`                                                   | **shown to the reviewer only, never read by any code that decides a match.** The only third-party text in the row; purged by section 3.4                                                          |
| `display_name_purged_at`                                         | null until the purge                                                                                                                                                                              |
| `blocked_fixtures`                                               | fixtures currently in review or with players held back because of this id (what approving it unblocks)                                                                                            |
| `status`                                                         | `unmapped`, `proposed`, `mapped`, `ignored`. `mapped` and `ignored` are only ever set by executing an approved proposal (sections 3.3 and 3.5); no screen action and no import sets them directly |
| `status_changed_at`                                              | when `status` last changed (the 90-day clock of section 3.4 starts here for `mapped` and `ignored`)                                                                                               |

### 3.2 `football_player_mapping_proposals` (a decision waiting for a second person)

One row per proposed decision. Every durable production decision about a candidate goes
through this table, whatever its kind.

| Column                                            | Meaning                                                                                                                                                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `batch_id`                                  | a proposal belongs to a batch (a batch of one is allowed)                                                                                                                                                              |
| `kind`                                            | `map` (pair provider ids with an app player), `replace`, `deactivate` (section 5.4), `ignore` ("not a Botola player", section 3.5), `reverse_ignore`                                                                   |
| `app_player_id`                                   | the app player (`app.players`); null for `ignore` and `reverse_ignore`                                                                                                                                                 |
| `sofascore_external_id`, `flashscore_external_id` | either may be null for a player one provider does not list. For `ignore` and `reverse_ignore`, exactly one id is set                                                                                                   |
| `basis`                                           | `incident` (both providers attributed the same goal, card or substitution to the pair), `shirt_position` (same side, shirt number and position, no incident), `manual` (the reviewer chose it)                         |
| `evidence`                                        | jsonb: fixture ids, incident kinds and minutes, shirt numbers per provider, positions, and the signal results of section 5.2 (agree, disagree, missing). References and counts only, no names and no provider payloads |
| `signals`                                         | jsonb: the per-candidate ranking signals shown to the reviewer (section 5.2), kept with the proposal                                                                                                                   |
| `status`                                          | see the state table below                                                                                                                                                                                              |
| `requested_by`, `requested_at`, `reason`          | the proposer (a human), and why                                                                                                                                                                                        |
| `position_note`                                   | required before a `position_disagreement` proposal can be approved (what the disagreement is and why the pairing still holds)                                                                                          |
| `decided_by`, `decided_at`, `decision_reason`     | a different human                                                                                                                                                                                                      |
| `position_disagreement_acknowledged`              | the approver's explicit acknowledgement, required when the proposal carries a position disagreement                                                                                                                    |
| `fingerprint`                                     | hash of the payload (kind, ids, app player, evidence references, signals, reason); any change invalidates an approval. It never includes a name                                                                        |
| `expires_at`                                      | pending proposals expire (default 72 hours)                                                                                                                                                                            |

Constraints: a pending proposal cannot name an app player or a provider id that already
has an active mapping or another pending proposal (a replacement is a separate, explicit
operation, section 5.4). `requested_by <> decided_by` is enforced in the database, not
only in the screen, for every kind.

#### Proposal states

| State                   | Meaning                                                                                                                                                                                                     | Can be approved?                 | Leaves by                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pending`               | waiting for a second person                                                                                                                                                                                 | yes                              | `approved`, `rejected`, `expired`, `cancelled`, or one of the four held states below                                                              |
| `approved`              | a different person approved the exact fingerprint; not yet executed                                                                                                                                         | n/a                              | `executed`, or `stale_evidence`, `identity_conflict`, `already_mapped` if the world changed before execution                                      |
| `executed`              | written exactly once, in one transaction, with its audit events                                                                                                                                             | n/a                              | final                                                                                                                                             |
| `rejected`              | a different person rejected it, with a reason                                                                                                                                                               | n/a                              | final                                                                                                                                             |
| `expired`               | not decided in time                                                                                                                                                                                         | no                               | final; a new proposal may be made                                                                                                                 |
| `cancelled`             | withdrawn by the proposer, with a reason                                                                                                                                                                    | n/a                              | final                                                                                                                                             |
| `stale_evidence`        | the provider evidence the proposal rests on changed after it was made (a newer read of the squad or a lineup shows a different team, shirt, position or id for the pair, or a fixture it cites was re-read) | no                               | the proposer refreshes the evidence, which makes a new fingerprint and returns it to `pending`; an earlier approval never carries over            |
| `identity_conflict`     | the pairing collides with another identity: another pending or active record claims the same provider id or the same app player for someone else, or the two providers' incident lists contradict it        | no                               | rejected or cancelled, or replaced through the explicit replace operation; never resolved by editing the conflicting record in place              |
| `position_disagreement` | the providers' positions disagree with each other or with the app player's position. **A flag that holds the proposal for a human, never a rejection**                                                      | only after both acknowledgements | the proposer adds a `position_note` (back to `pending`, marked as needing acknowledgement); the approver must tick the acknowledgement to approve |
| `already_mapped`        | at approval or execution the provider id or the app player already has an active mapping (created meanwhile by someone else). The unique constraints make this a database refusal                           | no                               | final for this proposal; the candidate shows the existing mapping; changing it is a separate `replace` proposal                                   |

Every transition, including into and out of the held states, writes an append-only audit
event with the same correlation id. A held state is also what the reviewer screen shows as
a banner (section 5.5), so a proposal is never silently stuck.

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

### 3.4 Retention

- **Purged 90 days after the candidate becomes `mapped` or `ignored`:** the
  `display_name` text (and nothing else). A scheduled trusted function sets it to null and
  stamps `display_name_purged_at`. After the purge the screen shows the provider id and
  the app player's name from the app catalog.
- **Never purged by this feature:** provider ids, the app player id, fixture references,
  the evidence and the signals, the fingerprints, every proposal and approval decision, the
  correction reason, and every audit event.
- A purge changes nothing a decision depends on, because no name is part of a fingerprint,
  an evidence reference or a match.
- A candidate that is reversed from `ignored` back to `unmapped` has its status clock
  reset; the next squad or lineup read refills a purged name.

### 3.5 "Not a Botola player" (`ignore`)

A durable classification of one provider id as not part of the Botola player pool. It can
suppress a legitimate player's mapping and so affect ingestion and scoring, so it is a
two-person decision exactly like a mapping:

candidate, then **propose ignore**, then a **second person approves**, then **execute**.

- Reason required (10 to 500 characters), fingerprinted, audited, and self-approval is
  refused by the database.
- **Reversible:** a `reverse_ignore` proposal goes through the same two-person flow and
  returns the candidate to `unmapped`. Nothing is deleted; the history stays.
- **Protection against a wrong classification:** an `ignore` proposal for an id that
  appears in any Botola match lineup or in any reconciled incident (a goal, card, assist or
  substitution) goes straight to `identity_conflict` and cannot be approved. An id that
  scored cannot be "not a Botola player".
- The reconciler treats an executed `ignore` as: the id is left out of the unmatched and
  held-back lists. If a later read of a Botola match shows that id in a lineup or
  incident, the fixture goes to review and the candidate returns to the queue as an
  `identity_conflict`; an ignore never silently removes a participant.
- **"Skip for now"** is not this. It is a personal, non-mutating screen action (it only
  affects what that reviewer sees next, in the browser or a per-user preference). It
  changes no status, no queue count for anyone else, and no ingestion.

## 4. How the reconciler uses it

`ReconcileInput` gains an optional identity map: provider id to app player id, for each
provider, plus the set of executed `ignore` ids. Rules, strongest first:

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
6. **An ignored id** is left out of the unmatched list; if it appears in a lineup or an
   incident the fixture goes to review (section 3.5).

The reconciler reads the map it is given; it does no database access. It never reads a
name to decide anything.

## 5. The review screen

Route: `/admin/football/player-mappings`, `ssr: false`, loader `loadAdminStaffRouteAccess`
like the other admin routes, visible only with `football.manage_mappings` (read-only
view with `football.read_operations`). Copy in French and Arabic (RTL), through the
existing dictionaries; no authority is inferred from route state or client storage.

### 5.1 Queue

```
Player mappings                                   [ Club ▾ ] [ Season ▾ ] [ Basis ▾ ] [ Status ▾ ]
-------------------------------------------------------------------------------------------------
 Unmapped 212   Proposed 14   Waiting for approval 3   Held 2   Mapped 1,140   Ignored 9
 Qualified reviewers available: 1   -> "Second qualified reviewer required" (see 5.5)

 [ ] Strong matches (47)                                                 Propose selected as batch
 ----------------------------------------------------------------------------------------------
 [ ] Sofascore  Hamza El Janati  #6 M   Flashscore  El Janati H.  #21   → app: Hamza El Janati
       basis: incident (goal, 26', both providers)   fixtures seen 3     unblocks 2 fixtures
 ...
 Needs a person (165)
 ----------------------------------------------------------------------------------------------
   Sofascore  Mouad Goulouss  #99 M          no candidate yet          [ Review ]
```

- "Strong matches" are proposals with basis `incident` in two or more different
  fixtures and no incident or id contradiction. They are pre-filled, never pre-approved,
  and the batch is only a way to **propose** many pairs at once: every row still needs the
  second person's approval, recorded per row.
- **A position disagreement does not remove a pairing from this list.** It marks the row
  with a visible flag, takes the row out of one-click batch selection, and puts it in the
  `position_disagreement` state until the proposer's note and the approver's
  acknowledgement exist (section 3.2).
- Sorted by what is blocked: players who hold back the most fixtures first.
- Status is always text plus an icon, never colour alone (the kit's badge tones).

### 5.2 Detail and comparison

```
 Sofascore                         Flashscore                       Candidates in the app (same club, ranked)
 Hamza El Janati                   El Janati H.                     (o) Hamza El Janati    M     score high
 id 1…  #6  M  starter             id 7…  #21  starter                 incident ✓ 2 fixtures · ids ✓ · position ✓ · shirt ✗ · DOB ✓ (if present)
 seen: DHJ-CODM, +2                seen: DHJ-CODM, +2               ( ) Hamza El Janati II F     score low
                                                                         incident – · position ✗ (flagged) · shirt ✗
 Evidence                                                           Other clubs (lower confidence)  [ show ]
   DHJ-CODM  goal 26' (Sofascore) / 26' (Flashscore)  -> same scorer by goal order
   ...
 Impact: approving unblocks DHJ-CODM (review) and 2 held-back players
 Reason (required, 10 to 500 chars) [____________________________]
 [ Propose mapping ]  [ Reject ]  [ Propose "not a Botola player" ]  [ Skip for now ]
```

**Candidate generation (position is a signal, not a filter).**

1. Start with **every player of the same mapped club in the same season**. Nobody is hidden
   because of a position, a shirt number or a missing attribute.
2. **Rank** with independent evidence, strongest first:
   1. incident agreement (both providers attributed the same incident to the pair);
   2. provider ids and existing mappings (an id already mapped to someone else is shown as
      a conflict, never as a candidate);
   3. date of birth, **only where section 12 shows the provider supplies it** and the app
      has one (a match is strong corroboration; a mismatch is a visible contradiction;
      a missing value is "no information" and never counts against anyone);
   4. position agreement;
   5. shirt-number agreement;
   6. fixture history (the player was in this club's squad or lineups).
3. Show **lower-confidence alternatives too**, below the main list and in a collapsed
   "Other clubs" group (players with a membership at another club in the league, for
   transfers), clearly labelled lower confidence.
4. **Never auto-reject because positions differ.** A position contradiction (provider
   against provider, or provider against the app player) is flagged next to the candidate
   and carried into the proposal as a `position_disagreement`; it lowers rank at most as
   one signal among the others.
5. Height, where a provider gives it, is shown as corroboration. It is **never** an
   identity key, a rank override or a reason to hide a candidate.

Other rules:

- Names are shown so a person can read them, and labelled "for reading only". They are
  never used to rank, to match or to fingerprint.
- Nothing is pre-selected for a player with no incident evidence.
- Every signal is stored with the proposal so the approver sees what the proposer saw.

### 5.3 Approval

`/admin/approvals` gains a type, "Player mapping batch", covering every `kind`
(mapping, replace, deactivate, ignore, reverse ignore). The second operator sees the batch
as a table (proposed decisions, basis, evidence, signals, impact), can open any row, and
approves or rejects the batch as a whole or row by row. A changed fingerprint, an expired
proposal, a held state, or the proposer opening their own batch removes the approve control
and says why. Execution is a separate, exactly-once step by a qualified operator, as the
matrix requires for sensitive changes.

There is one approval path for every production mapping and every "not a Botola player"
decision. There is no shortcut for strong matches or any other group.

### 5.4 Replace or deactivate an existing mapping

Same two-person flow, with a mandatory reason and a warning showing which fixtures and
scored points the old mapping touched. Never silently overwritten (a manual correction is
never replaced by a proposal).

### 5.5 States the screen must handle

Empty queue, loading, server error with a retry, permission denied, a candidate already
mapped meanwhile (`already_mapped`, conflict, refresh), a proposal that expired, a stale
fingerprint, stale provider evidence (`stale_evidence`, with a refresh action), an identity
conflict (`identity_conflict`, naming the other record), a position disagreement
(`position_disagreement`, flagged, with the note and acknowledgement fields), and a
read-only mode for staff without the write permission.

**Second qualified reviewer required (decision D4).** The queue header and every approval
row show how many qualified reviewers are available besides the proposer: distinct humans
with `football.manage_mappings`, currently active, with a second factor enrolled so they
can reach AAL2. When none is available the proposal stays `pending`, the approve control is
absent, and the screen says **"second qualified reviewer required"** (and its Arabic
equivalent). There is no bypass: no override flag, no admin shortcut, no self-approval, and
this feature adds no break-glass path. If the proposal expires meanwhile it is simply
proposed again.

Desktop first, tables that stay usable at tablet width, keyboard navigable, no
colour-only meaning.

### 5.6 Language and direction (decision D5)

- All interface copy (labels, states, errors, the "second qualified reviewer required"
  message, buttons) exists in French and Arabic and passes the existing copy gate.
- The layout supports RTL: logical properties, mirrored icons where direction carries
  meaning, tables that read correctly right to left.
- Player and club names are shown **exactly as stored** in the app catalog and the provider
  evidence, usually in Latin script. No separately curated Arabic spelling is required for
  v1 (it can be added later as a catalog field). Mixed-direction text is isolated so a Latin
  name inside an Arabic sentence, and the reverse, does not scramble punctuation or numbers.

## 6. Authority

| Operation                                        | Requester                                                                  | Approver                   | Notes                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------- |
| Read the queue and evidence                      | `football.read_operations` or `football.manage_mappings`                   | none                       | read only                                                                                       |
| Skip for now                                     | any reader                                                                 | none                       | personal and non-mutating; changes no status and no one else's queue                            |
| Propose a mapping or a batch                     | `football.manage_mappings`, AAL2, recent authentication                    | none                       | needs a reason; creates a pending proposal                                                      |
| Approve or reject                                | a different `football.manage_mappings` holder, AAL2, recent authentication | n/a                        | self-approval refused by the database                                                           |
| Execute                                          | a qualified `football.manage_mappings` operator                            | prior independent approval | exactly once, idempotency key                                                                   |
| Replace or deactivate                            | as above                                                                   | as above                   | warning and reason mandatory                                                                    |
| **Propose "not a Botola player"** (`ignore`)     | `football.manage_mappings`, AAL2, recent authentication                    | none                       | reason required; refused (`identity_conflict`) if the id appears in a Botola lineup or incident |
| **Approve "not a Botola player"**                | a different `football.manage_mappings` holder, AAL2, recent authentication | n/a                        | self-approval refused by the database                                                           |
| **Execute "not a Botola player"**                | a qualified `football.manage_mappings` operator                            | prior independent approval | exactly once, idempotency key                                                                   |
| Reverse "not a Botola player" (`reverse_ignore`) | as above                                                                   | as above                   | same two-person flow; nothing is deleted                                                        |

This adds rows to the dual-control matrix; it does not change any existing row. All steps
write append-only audit events with the same correlation id.

**Decision D1 (recorded):** two-person approval for every production mapping. Strong matches
may be proposed together in a batch to cut review work; each executed mapping still has a
proposer, a different approver, AAL2, recent authentication, an immutable fingerprint, a
reason and an audit event. The previous option of a single reviewer for strong matches is
**not** adopted.

**Decision D4 (recorded):** production needs at least two distinct authorized humans. If
only one `football_operator` exists, proposals wait and the screen says "second qualified
reviewer required". Self-approval protection is never relaxed to cover that gap.

## 7. Repository contract (sketch)

In `src/backend/admin/`, next to the existing repositories, with DTOs and stable errors:

- `listMappingCandidates(filter, cursor)`, `getMappingCandidate(id)`
- `listMappingCandidatesForAppPlayer(candidateId)` (the candidate list with signals; ranks,
  never filters on position)
- `proposeMappings(batch, idempotencyKey, reason)`
- `proposeIgnore(candidateId, idempotencyKey, reason)`, `proposeReverseIgnore(candidateId, idempotencyKey, reason)`
- `refreshProposalEvidence(proposalId, idempotencyKey)` (from `stale_evidence`)
- `addPositionNote(proposalId, note)`
- `decideMappingProposal(id, decision, reason, fingerprint, positionDisagreementAcknowledged?)`
- `executeMappingBatch(batchId, idempotencyKey)`
- `deactivateMapping(mappingId, reason, idempotencyKey)`
- `getQualifiedReviewerAvailability(proposalId)` (the count behind "second qualified
  reviewer required")

Stable error codes: `mapping_already_exists`, `app_player_already_mapped`,
`proposal_expired`, `fingerprint_mismatch`, `self_approval_denied`, `not_authorized`,
`stale_candidate`, `stale_evidence`, `identity_conflict`, `position_disagreement_unacknowledged`,
`second_reviewer_required`, `ignore_refused_id_in_lineup`. The visual console calls these and
nothing else.

## 8. How the first data gets in

1. Register the two providers (one migration, two rows).
2. A read-only script lists squads per club from each provider, using the endpoints and
   fields section 12 verified from real responses (Sofascore `teams/get-squad`, Flashscore
   `v1/teams/squad`). About 16 clubs x 2 providers = 32 requests per season, well inside
   the 500 a month, repeated only for transfers.
3. The proposal builder fills the candidates table from (a) squads and (b) every reconciled
   match: pairs the reconciler confirmed by incident become `incident` proposals with their
   evidence, so each match played makes the next review shorter.
4. A person reviews one club, then the rest. The first import is the main effort (about 25
   players a club), and is mostly confirming pre-filled pairs.

## 9. Tests to write when it is built

- pgTAP: the unique constraints, `requested_by <> decided_by` for **every kind including
  `ignore` and `reverse_ignore`**, an execution writes both rows or neither, a pending
  proposal cannot name an already mapped player, expiry, the fingerprint check, forward-only
  deactivation, each held state and its allowed transitions (`stale_evidence` refresh makes a
  new fingerprint and never carries an approval over; `identity_conflict` cannot be approved;
  `position_disagreement` needs the note and the acknowledgement; `already_mapped` is final
  and writes nothing), an `ignore` of an id that is in a lineup or incident is refused, the
  display-name purge clears only the name and leaves every id, signal, fingerprint, decision
  and audit event, and no function reads a name to decide anything.
- Reconciler: mapping beats shirt number; an incident that contradicts a mapping sends the
  match to review; one app player in two records sends the match to review; a map entry
  missing for one provider leaves the player unpaired; an ignored id that appears in a
  lineup or incident sends the match to review.
- Candidate ranking: position never hides a same-club candidate; a position contradiction is
  flagged and lowers rank only; a candidate with a missing attribute is never penalised; the
  list always includes lower-confidence alternatives.
- Admin repository and route tests with the mock repository pattern used by
  `/admin/approvals`, including the French and Arabic copy gate, RTL layout, and the
  "second qualified reviewer required" state with a single operator (no bypass control
  exists in the DOM or the repository).
- A browser test of the queue, the comparison and the approval for the strong-match batch
  on the development server with sample data only.

## 10. Order of work

1. This design reviewed and approved (decisions D1 to D5, A and B recorded in section 0).
2. A sanitized, read-only provider population probe (section 12, "Still to establish"):
   field presence across all 16 clubs, date-of-birth plausibility, and the app's own
   date-of-birth coverage. No names or dates in any log.
3. Register the providers (one migration), staging first.
4. The squad read and the candidate builder, read-only.
5. The proposal and candidate tables, the trusted functions (including the held states, the
   ignore flow and the purge), pgTAP.
6. The repository, then the screen (the Lovable Admin Console handoff applies: it calls the
   repository and infers no authority), with French, Arabic and RTL.
7. The reconciler's identity input, including ignored ids.
8. Only then Phase 4, the ingestion worker.

## 11. Decisions

All five decisions the earlier draft asked for are made (section 0). Nothing else in the
design is open except these facts to establish before building, none of which needs an owner
decision:

- the population probe of section 10 step 2 (whether Sofascore's date of birth is present
  often enough, in every club, to be used as a ranking signal);
- the app catalog's own date-of-birth coverage (without a date on the app side, a provider
  date can only be shown, not compared);
- who the two reviewers are in practice. The design does not depend on the answer: with one
  qualified reviewer the screen says "second qualified reviewer required".

## 12. Provider identity fields: evidence from real responses

Read-only calls through the manual "Provider probe" workflow (public repository, so it
prints only field names, types and counts, never values), on 1 Oct 2026. No database
access. The endpoints were probed, not assumed: each path was called and its real response
read. Quota use: Sofascore 4 requests (one was a 404), Flashscore 5 (two were 404s).

| Provider   | Request                                                                   | Result                                                                                                             |
| ---------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Sofascore  | `matches/get-lineups?matchId=17132481`                                    | 200, 39 players on the two sides                                                                                   |
| Sofascore  | `teams/get-squad?teamId=55035`                                            | 200, 31 players in `players` (and separate `foreignPlayers` 8, `nationalPlayers` 2, `playerPreviousTeam` 30 lists) |
| Sofascore  | `teams/get-players?teamId=55035`                                          | 404: no such endpoint                                                                                              |
| Sofascore  | `players/detail?playerId=<id from the lineup>`                            | 200, one player                                                                                                    |
| Flashscore | `v1/events/lineups?event_id=W81WOcb5&locale=en_INT`                       | 200, 41 members across 3 groups, each with 2 formation blocks                                                      |
| Flashscore | `v1/teams/squad?team_id=ptdhYAkN&sport_id=1&locale=en_INT`                | 200, 31 items in 5 groups                                                                                          |
| Flashscore | `v1/players/data?player_id=<id from the lineup>&sport_id=1&locale=en_INT` | 200, one player                                                                                                    |
| Flashscore | `v1/players/info`, `v1/teams/players`                                     | 404: no such endpoints                                                                                             |

### 12.1 Field matrix

"n of m" is how many entries carry the field in that response (a field absent from an
entry is simply missing, not null, for the Sofascore fields below). The sample is one match
(two clubs), one squad and one player per provider.

| Identity field        | Sofascore lineup                                                                                          | Sofascore squad (`teams/get-squad`)                                                      | Sofascore player detail                 | Flashscore lineup                                                                                                                    | Flashscore squad (`v1/teams/squad`)                                                                            | Flashscore player data                             |
| --------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Stable player id      | `player.id` number, 39 of 39                                                                              | `player.id` number, 31 of 31                                                             | `player.id`, present                    | `PLAYER_ID` string, 41 of 41                                                                                                         | `PLAYER_ID` string, 31 of 31                                                                                   | `DATA.ID`, present                                 |
| Second id             | `player.sofascoreId` string, 39 of 39                                                                     | `player.sofascoreId` string, 31 of 31                                                    | present                                 | `ROW_ID` number (a row in this lineup, not a player id)                                                                              | none                                                                                                           | none                                               |
| Team id               | `teamId` on each entry, 39 of 39 (can be the player's registered club, not the match side: Phase 0 audit) | `player.team.id`, 31 of 31                                                               | `player.team.id`                        | none on the member (the club is the side of the formation)                                                                           | none on the item (the club is the requested `team_id`)                                                         | `TEAM_ID` string, present                          |
| Shirt number          | `shirtNumber` number, 39 of 39; `jerseyNumber` string, 39 of 39 on the entry                              | `player.shirtNumber`, 27 of 31; `jerseyNumber` 27 of 31                                  | `shirtNumber`, present                  | `PLAYER_NUMBER` number, 39 of 41                                                                                                     | `PLAYER_JERSEY_NUMBER` number or null, key on 30 of 31                                                         | none                                               |
| Position              | `position` on the entry (G/D/M/F) 38 of 39; `player.position` 37 of 39                                    | `player.position` 31 of 31 (G/D/M/F: 4 G, 11 D, 12 M, 4 F); `positionsDetailed` 25 of 31 | `position`, `positionsDetailed` present | `PLAYER_POSITION` number on 22 of 41 (formation slot, starters only); `PLAYER_POSITION_ID` number 41 of 41 (meaning not established) | none per player; the only position information is the group the item is listed under (`GROUP_LABEL`, 5 groups) | `TYPE_ID`, `TYPE_NAME` (meaning not established)   |
| Date of birth         | `player.dateOfBirthTimestamp` number: 20 of 20 (home), 17 of 19 (away)                                    | `dateOfBirthTimestamp` number 30 of 31; `dateOfBirth` string 30 of 31                    | both present                            | none                                                                                                                                 | none                                                                                                           | `BIRTHDAY_TIME` string, present (1 player sampled) |
| Height                | `player.height` number: 19 of 20 (home), 11 of 19 (away)                                                  | `player.height` 25 of 31                                                                 | present                                 | none                                                                                                                                 | none                                                                                                           | none                                               |
| Full or display name  | `player.name` 39 of 39, `shortName` 39 of 39; `firstName` 29 of 39, `lastName` 17 of 39                   | `name`, `shortName` 31 of 31; `firstName` 24, `lastName` 18                              | present                                 | `PLAYER_FULL_NAME` 41 of 41, `SHORT_NAME` 41 of 41 (annotations such as role markers can be part of the full name)                   | `PLAYER_NAME` 31 of 31                                                                                         | `NAME`, `SHORT_NAME`                               |
| Nationality           | `player.country.alpha2` 37 of 39                                                                          | 31 of 31                                                                                 | present                                 | `PLAYER_COUNTRY` number 41 of 41                                                                                                     | `PLAYER_FLAG_ID` number 31 of 31                                                                               | `COUNTRY_ID`                                       |
| Substitute or starter | `substitute` boolean 39 of 39                                                                             | n/a                                                                                      | n/a                                     | `PLAYER_TYPE` number 41 of 41, group `PLAYER_GROUP_TYPE`                                                                             | `PLAYER_TYPE_ID` string 31 of 31                                                                               | `TYPE_ID`                                          |

The MAS Fès squad has 31 players on both providers, which is consistent with both
endpoints returning the whole squad.

### 12.2 What the evidence shows for date of birth (decision D2)

- **Sofascore: exists and is well populated.** 37 of 39 lineup players (95%: 100% for one
  club, 89% for the other) and 30 of 31 in the squad (97%). Where it is missing the key is
  absent; no null was seen.
- **Flashscore: not in the lineup and not in the squad.** The only place seen is the
  per-player call `v1/players/data` (`BIRTHDAY_TIME`), one request per player. About 16
  clubs x 30 players is roughly 480 requests, against a 500-a-month plan that is already
  being used for matches, so a squad-wide date-of-birth read from Flashscore is not
  practical. Its population across players was not established (one player sampled).
- **Not established:** the values themselves. The probe prints types and counts only, so
  whether the dates are plausible (and not placeholders) and in what format the
  Flashscore string is, was not checked. The app catalog's own date-of-birth coverage was
  not checked either (it is a database read, outside this probe).
- **Conclusion:** DOB can be designed in as a strong name-independent **ranking signal for
  Sofascore against the app catalog**, shown to the reviewer and compared when both sides
  have a date. It cannot yet be used for Sofascore against Flashscore, and not as an
  automatic input until the population probe of section 10 step 2 shows presence in every
  club, plausibility and the app-side coverage.
- Height: Sofascore only, present on 58% (11 of 19) to 95% (19 of 20) of lineup players
  depending on the club and on 81% (25 of 31) of the squad. Display and corroboration only,
  as decided.

### 12.3 Classification

**Safe to use automatically** (as machine inputs for candidate generation, ranking and
evidence; **never** as an approval, which always needs two people):

- Sofascore `player.id` and Flashscore `PLAYER_ID`: present on 100% of entries in every
  response sampled, and the same id is accepted by the player endpoint of the same
  provider. They are the only name-independent identity keys. Stability across seasons was
  not tested.
- Which club a squad belongs to, because the squad endpoints are called per team id (the
  club is the request).
- Sofascore lineup `substitute` and Flashscore `PLAYER_TYPE` as the starter or bench fact,
  as the reconciler already uses them.

**Safe only as reviewer signals** (shown, ranked on, compared, never decisive alone):

- Sofascore date of birth (95 to 100% populated, values unchecked): corroboration, strong
  when it equals the app's date, a flagged contradiction when it differs.
- Shirt numbers (both providers, incomplete: 39 of 41 and 27 or 30 of 31) which Phase 0
  already showed can differ between providers.
- Positions (Sofascore G/D/M/F, always on the squad, 37 or 38 of 39 in lineups): a signal
  only, per correction A.
- Sofascore `teamId` on a lineup entry (may be a registered club rather than the match
  side).
- Sofascore height (incomplete, one provider).
- Nationality, as a weak corroborator.
- Names, strictly for human reading.

**Unavailable or unreliable:**

- Date of birth from Flashscore squad or lineup (absent); from `v1/players/data` only per
  player and too costly to read for a whole league; population unknown.
- Height from Flashscore (absent).
- Flashscore position per player: only the group label of the squad list, a formation slot
  on starters (22 of 41), and `PLAYER_POSITION_ID` and `TYPE_NAME` whose meaning is not
  established. Whether the group label is reliable for sparse records was not tested, so it is not
  treated as a position.
- Team id on Flashscore members (absent; use the side or the requested team).
- `teams/get-players` (Sofascore), `v1/players/info` and `v1/teams/players` (Flashscore):
  404, they do not exist.
- Whether either provider keeps a player's id when he changes club or season: not tested.

### 12.4 Limits of this evidence

One match (two clubs), one squad (MAS Fès) and one player per provider; shape only, no
values; only the identity fields, not a comparison against the app catalog. It is enough to
say which fields exist and how complete they were in this sample, not that every club is
equally complete (the two clubs in the lineup already differed on date of birth and height).
