# Controlled bulk player-mapping batch — runbook

Owner approval: 2026-10-02 (189 Sofascore candidates, no others). **Nothing in this
document is a production write.** The three production actions are performed by the
owner, one at a time, from the owner's own signed-in admin session.

## What it is

One reviewed, frozen set of 189 Sofascore identities (108 Tier A, 81 Tier B) mapped to
app players through the **existing reviewed backend**: batch propose, then approve one
proposal at a time, then execute one proposal at a time. There is **no new migration and
no new database function.** Every row keeps its own proposal, fingerprint, approval,
expiry, idempotency key and audit event.

| Phase | Owner action (typed phrase)                       | Backend function (one row at a time)             | Maps anything? |
| ----- | ------------------------------------------------- | ------------------------------------------------ | -------------- |
| 1     | PROPOSE REVIEWED BATCH (`PROPOSE_REVIEWED_BATCH`) | `admin_football_mapping_propose`, ≤25 items/call | No             |
| 2     | APPROVE REVIEWED BATCH (`APPROVE_REVIEWED_BATCH`) | `admin_football_mapping_decide`                  | No             |
| 3     | EXECUTE APPROVED BATCH (`EXECUTE_APPROVED_BATCH`) | `admin_football_mapping_execute`                 | **Yes**        |

No action triggers the next. The screen is `/admin/football/player-mappings`, button
“Lot contrôlé (189)”, drawn only for a person who may manage mappings while proposals are on.

## The frozen contract (not widened by anything here)

A Sofascore candidate is in the batch only when: unmapped; provider id free and unique; one
squad observation; squad COMPLETE; no registered-team disagreement; valid provider birth
date, not January 1; exactly one active member of the observed club agrees on the exact
birth date (the app date is valid and not January 1, which is what makes the signal
`match`); position matches; club matches; no flags; the target app player is free for
Sofascore; no open proposal; and an **active SportsMonks mapping already resolves the same
app player**. Tier A: shirt matches. Tier B: shirt gives no signal, and a shirt conflict is
excluded. Collisions (two candidates for one target, one provider id twice, one candidate
twice) remove **every** involved row to CONFLICT; no winner is chosen. A candidate that no
longer satisfies the contract is **skipped, never replaced**.

Names are never an input: not to eligibility, score, tier, tie-break, manifest hash or
fingerprint. Flashscore (465 candidates) is excluded entirely: it has no birth date and no
independent bridge.

## The manifest (immutable, hashed, committed)

- `docs/production/manifests/player-mapping-bulk-2026-10-02.manifest.json`
- `docs/production/manifests/player-mapping-bulk-2026-10-02.manifest.sha256`
- shipped to the screen as `src/components/admin/player-mappings/bulk-manifest.ts`
  (the screen re-verifies the SHA-256, order, duplicates, no name and no date before it
  offers any action; a manifest that fails disables everything).

Per row: candidate UUID, provider, external id, target app-player UUID, evidence
revision, app-team context, DOB / position / club / shirt **signal states**, the
SportsMonks corroboration boolean, current mapping and proposal state, the exact proposal
fingerprint inputs and the fingerprint the database computes for them, and the tier. No
names, no birth dates, no raw provider payloads.

Regenerate (read-only against the database, then offline):

1. Run `scripts/backend/football-mapping-bulk-manifest.sql` (read-only; one select) against production.
2. `bun scripts/backend/build-bulk-mapping-manifest.ts <manifest_rows.json> <date>`.
3. Review the diff; the hash changes with any row.

## What the tests proved (and one finding)

- `src/backend/football/identity/bulk-mapping/*.test.ts`: 1,004-candidate production-shaped
  world; exact 189 (108/81); duplicate target / provider id / candidate; stale evidence
  before propose, after propose and after approval; target or provider id mapped mid-run;
  proposal expiry and an approval older than 24 h; one bad row never stops the rest; a
  browser closing after 47 of 189 resumes from the database with nothing repeated; a double
  press does not duplicate; names (renamed or swapped) change nothing, including the
  manifest hash and every fingerprint; incomplete squad, January-1 and Flashscore excluded.
- `supabase/tests/database/football_player_mapping_bulk_lifecycle.test.sql`: the same world
  against the **real database functions**, single-operator mode on.
- **Finding:** the backend stores each propose call's response under its idempotency key and
  caps that stored response at 8 KB. A call of about 35 or more proposals is refused whole
  (nothing is created) long before the 100-item limit. The batch therefore proposes in
  bounded calls of **25** (about 6 KB): Tier A 4×25+8, Tier B 3×25+6, nine calls.
  The backend limit is not touched.

## Before each production phase (read-only, by the operator of this runbook)

- `allow_self_approval = true`; candidates 1,004; observations 1,006.
- The two earlier reviewed mappings (Tagnaouti, Babacar) unchanged and active.
- No other database writer; no Fantasy finalization in progress; cron digest unchanged.
- Re-run the manifest SQL: still 189 (108/81), 0 collisions, same hash. If it differs, stop.

## Expected state after each phase

| After         | Proposals        | Mappings | Reviewed-provider mappings | Mapped candidates |
| ------------- | ---------------- | -------- | -------------------------- | ----------------- |
| baseline      | 2 executed       | 1,543    | 2                          | 2                 |
| PROPOSE       | 2 + 189 pending  | 1,543    | 2                          | 2                 |
| APPROVE       | 2 + 189 approved | 1,543    | 2                          | 2                 |
| EXECUTE (all) | 191 executed     | 1,732    | 191                        | 191               |

Actual numbers follow the rows that executed. Candidates 1,004 and observations 1,006
never change. Nothing may touch `app.players`, memberships, Fantasy tables, scoring
snapshots, gameweeks, automation settings or cron.

## Row states and what to do

`NOT_PROPOSED`, `PROPOSED`, `APPROVED`, `EXECUTED` are the normal path. A row can instead
read `STALE_EVIDENCE`, `IDENTITY_CONFLICT`, `TARGET_ALREADY_MAPPED`,
`PROVIDER_ID_ALREADY_MAPPED`, `APPROVAL_EXPIRED`, `HELD` or `ERROR`. A non-normal row is
**left as it is**: no automatic retry, never retargeted. The owner may cancel its proposal
with the existing cancel control and decide separately what, if anything, to do next.

State is derived from the database on every load, so closing the browser or losing the
network after 47 of 189 loses nothing and repeats nothing. Idempotency keys are
deterministic (manifest hash + phase + proposal / chunk), so a double press replays the
same operation.

## Limits to remember

- A proposal expires 72 hours after it is made; an approval must be executed within 24 hours.
- A refusal about the session (sign-in, second factor) stops the phase at once.
- The SportsMonks corroboration is frozen in the manifest; the reviewed API does not expose
  it, and no endpoint is added for it. It is re-read by the read-only checks above.
- Undoing a mapping is the existing, separately-approved deactivate flow; this batch has no undo.
