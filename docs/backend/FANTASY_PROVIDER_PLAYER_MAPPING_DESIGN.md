# Fantasy provider player mapping: bring it forward from Phase 4

Design only. No migration, no database write, no code in this document's PR.
`AGENTS.md` and `CLAUDE.md` apply in full when it is built (forward-only migration
with a unique timestamp, staging first, one writer per database, production only
through the owner-run path).

The table, its proposal flow, the approval rules and the admin review screen are
designed in [`FANTASY_PLAYER_MAPPING_TABLE_AND_REVIEW_SCREEN_DESIGN.md`](FANTASY_PLAYER_MAPPING_TABLE_AND_REVIEW_SCREEN_DESIGN.md).

## The problem

The reconciler (`src/backend/fantasy/provider-reconciler.ts`) has to know that a
Sofascore player and a Flashscore player are the same person. With no shared id and
names that differ ("M. Elhtemy" and "Lahtimi M."), the only handle in the data is the
shirt number. In the Phase 0 matches the two providers disagree on a shirt number for
at least one player in 3 of the 7 matches they both cover:

| Match             | Player    | Sofascore | Flashscore                              |
| ----------------- | --------- | --------- | --------------------------------------- |
| DHJ 2-6 CODM      | El Janati | 6         | 21                                      |
| WAC 1-3 Temara    | Ganvoula  | 35        | 15                                      |
| Tiznit 1-3 Tanger | Bouhbouh  | 13        | 6 (and Flashscore's 13 is someone else) |

Pairing on shirt alone therefore either fails (the goal's scorer cannot be paired, so
the whole match goes to review) or, worse, pairs two different people. The reconciler
already refuses to trust a shirt number where points depend on it, and the cost is
matches sent to review. A mapping table removes that cost without any guessing.

## What already exists

`app_private.football_provider_mappings` (migration `20260720095345`):

- `(provider_name, entity_type, external_id)` is unique, and so is
  `(provider_name, entity_type, internal_entity_id)`: one provider id maps to one app
  entity, and one app entity has at most one id per provider.
- `entity_type` already has `player`. `manually_corrected`, `correction_reason`,
  `corrected_by`, `corrected_at` already exist, with a check that a manual correction
  carries a reason of 10 to 500 characters and a person.
- `provider_name` references `app_private.football_providers(name)`. Today it holds
  `sportsmonks` and `fixture`.

So the table needs no change. It needs two new rows in `football_providers`
(`sofascore`, `flashscore`) and, for the reconciler, its rows.

## The proposal: map first, then reconcile

Move "who is who" out of the reconciler and into data a person has approved. The
reconciler then pairs two lineup entries only when both provider ids map to the same
app player, and uses the shirt number only to propose mappings, never to decide one.

### Step A: register the providers (the only migration)

One forward migration inserting `sofascore` and `flashscore` into
`app_private.football_providers`. Staging first, unique timestamp, checked with
`bun run backend:migrations:check`. No table or function changes.

### Step B: a read-only proposal script (no database write)

A script under `scripts/backend/`, like `provider-probe.ts`, that:

1. For one team, reads the squad from each provider. **The squad endpoints were not
   called in Phase 0, so their names and fields must be read from real responses first;
   do not guess them.** Budget: about 16 teams x 2 providers = 32 requests per
   season, well inside the 500 a month, repeated only for transfers.
2. Proposes pairs by side of the fixture, team, shirt number and position.
3. Adds a second proposal source that costs nothing: every reconciled match already
   produces pairs confirmed by an incident (`identity: "incident"` in the result: both
   providers attribute the same goal, card or substitution to the pair). These are
   proposals with evidence, not guesses.
4. Writes a review sheet (a file outside the repository, as for the fixtures) with the
   names of both entries next to each other **for a human to read**. Names are shown to
   the reviewer and are never used by code to decide anything.

### Step C: the owner approves, a guarded script imports

The owner marks each row approved, corrected or rejected. A guarded import (the same
pattern as the production promoter: dry run first, a `DO` block ending in a deliberate
`raise` to prove the rollback, then the real run) writes approved rows to
`football_provider_mappings` with `manually_corrected = true`, a reason such as
"approved from reconciler proposal, fixture <id>", and the approver. One writer at a
time. Production only through the owner-run path.

### Step D: the reconciler takes the mapping as input

Status: built, not merged or activated; see `FANTASY_MAPPING_AWARE_RECONCILER.md`.

`ReconcileInput` gains an optional `identity` map: provider id to app player id, for
both providers. With it:

- A pair is two entries that map to the same app player. A shirt number that differs
  between providers no longer matters.
- An entry with no mapping is not paired and goes to the review list, as now.
  Never auto-create a player.
- The shirt-based pairing stays as the fallback for matches before the table is full,
  with today's strict rules, and its pairs are what Step B proposes from.
- The goal-pairs-the-scorer option (`linkIdentityByGoal`) is then unnecessary and stays
  off.

## Invariants the ingestion must keep

These matter more than anything above, because they are what stop wrong points:

1. **One app player appears in at most one reconciled record per fixture.** When one
   lineup is replaced by the other (`lineup_fallback`), the same person can come out
   twice: Tiznit-Tanger gives what a reviewer reading the names sees as the same defender once from the Sofascore entry (paired to
   a different Flashscore entry by shirt number) and once from the Flashscore lineup
   alone. Both records carry provider ids; if both map to one app player, the fixture
   goes to review instead of scoring either. The existing unique constraints stop a
   second mapping row, not a second stats record, so this is a check in the ingestion.
2. A mapping row with `manually_corrected = true` is never overwritten by a proposal.
3. A provider id with no mapping is never scored. It is listed.

## What it costs and what it fixes

- One migration (two rows), one read-only script, one guarded import, one new optional
  input to the reconciler. No change to the mapping table, to scoring or to any ruleset.
- It turns the 3 differing shirt numbers above into a one-time review, after which they
  stop costing a match. Without it, DHJ-CODM and WAC-Temara stay in review under the
  strict rules.
- The first import is the main effort: a squad of about 25 per club. Pairs already
  confirmed by incident, plus shirt-and-position matches, are pre-filled, so the
  reviewer mostly confirms.

## Order of work

It fits between Phase 2 and Phase 4: Step A and B first (read-only apart from the one
registration migration), then C once the owner has reviewed one club's sheet, then D.
Phase 4 (the ingestion worker) should not start before D, since it would otherwise have
to reconcile on shirt numbers alone.
