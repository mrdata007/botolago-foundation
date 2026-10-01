# Fixture 711: leaving out a verified-unused, unplaceable substitute (design, 1 Oct 2026)

**Status: design and local validation only. Nothing here has been applied, deployed or run in
production.** The migration below is a file in this branch; no database has it except a
disposable local one.

Question: can a **named** lineup player the list cannot place (no canonical player, no
position) be left out of performance ingestion when the provider itself shows he was an unused
substitute with no scoring events? Target: SportsMonks player 38227322 (Soufane Abderrahmane),
fixture 19874711.

## 1. What the provider evidence shows today: CANNOT_VERIFY_UNUSED

The earlier read-only diagnose (run 36857665428) printed only provider ids, club and a
started flag for the 39 lineup players, so it cannot show his minutes or statistics. Nothing
stored in the database holds 711's lineup or events (no performance or coverage row exists for
it). The earlier evidence says he is a substitute (`started: false`, shirt 21) and that the
provider listed no position for him; it does not say whether the provider recorded minutes,
statistics or events for him. So the answer is **CANNOT_VERIFY_UNUSED today**: not "he played",
just "the facts are not on file".

Closing the gap needs one read-only run of the diagnose after this patch is on `main`. The
patch makes the diagnose print, for every named lineup player, only: provider player id, club
id, role, official minutes, the scoring-relevant statistic types with a value above zero, the
goalkeeper types sent as null, the types sent as explicit zero, and the types of match events
that name him. No names, no raw payload.

## 2. Why 711 fails today

`api.ingest_current_player_fixture_performance` loops over every row and raises
`PLAYER_MAPPING_NOT_FOUND` for a provider player the list has no mapping for. The
identity-apply plan skips a player with no position (`skip_no_position`), so he never gets a
mapping. The whole fixture is one transaction, so one such row blocks all 39 players.

## 3. The rule (all must hold or the fixture stays blocked as today)

- The importer declares him only if: substitute (never a starter); official minutes absent or
  0; no scoring-relevant statistic with a value (goals, assists, saves, penalties saved or
  missed, own goals, yellow, red, second yellow, goals conceded, rating); no goalkeeper
  statistic sent as null; and no provider match event names him (goal, card, substitution).
- The database re-checks the row it received: not started, not appeared, every counted
  statistic exactly 0, no rating, same club as declared.
- The database leaves him out only if: the fixture is mapped; its gameweek is not under
  adaptive scoring; his club is mapped and plays in the fixture; **no mapping row of any kind
  (active or inactive) exists for his provider id**, which also rules out anyone a Fantasy
  team holds or a locked lineup contains; and at most 2 players in the fixture qualify.
- Every other row, including the 22 starters, goalkeeper checks, statistics completeness,
  goal reconciliation and the 11-starters check, follows the existing path unchanged.
- A declaration that is malformed or that his own row contradicts is refused as
  `INVALID_PROVIDER_PAYLOAD`. That is a caller defect, not a case to decide.
- The exception is only sent on a **one-fixture canary** run, never by a page or an
  orchestrator pass.

"Missing position" is not a condition. A player who played, scored, was booked or started is
refused whatever his position field says.

## 4. Where it lives (smallest place)

A new migration (`20261001130000_verified_unused_unmapped_participants.sql`) renames the
current function to `..._before_exclusions` and adds a thin wrapper of the same name. With no
declaration the wrapper calls the old function with exactly what it was given. The old
function, the coverage table, the scoring document and its digests are untouched. The
declaration is removed before the old function sees it, so a fixture that leaves nobody out
keeps its source version.

## 5. Audit record

Table `app_private.current_fixture_excluded_participants` (append-only, service-role insert
and select only, RLS forced), keyed by fixture, coverage source version and provider player
id. Each row says: provider player, club, role `substitute`, reason
`verified_unused_unmapped`, official minutes, the type ids that were zero, and the time the
provider observed. A view joins it to the coverage's current source version. "Left out as
verified unused" is therefore a stored fact, never a silent gap. The excluded count is also
carried in the coverage the fixture already stores (`excludedIncompleteRows` increases and
`validPlayerRows` decreases by the same number, so rows seen is unchanged), and the RPC
result lists the ids (`excludedVerifiedUnusedUnmapped`). An unknown player stays a refusal;
only a verified-unused one gets this record.

## 6. Why GW1 points cannot change because of it

The scoring document is built from Fantasy players joined to performance rows. A player with
no Fantasy player has no scoring row either way, and the exclusion requires that no mapping
exists, so no Fantasy player can exist for him. If a Fantasy player did exist, a missing
performance row is scored as did-not-play with zero statistics, the same as the all-zero row
he would otherwise have. His own row is all zeros by the rule, so it adds no points. The
local test builds the scoring document after the exclusion and checks it has 23 player
rows (the Fantasy players of the two clubs) and none for him, and no new key, so the digest of
every other fixture is unchanged. 705 and 708 are not touched: their source versions are
computed without any declaration.

## 7. Tests (local, disposable Postgres 16, pgTAP)

`supabase/tests/database/current_performance_verified_unused_unmapped.test.sql`: 68 tests, all
passing locally. Cases: PASS A; REFUSE B (starter, alone and with minutes), C (minutes, alone
and with appeared), D goal, E assist, F yellow, G red, G2 second yellow, H own goal, I missed
penalty, saved penalty and save, goals conceded, null saves, null saved penalties, rating,
clean sheet, wrong club, malformed declarations, duplicates; J held by a Fantasy team; K in a
locked lineup; L existing mapping with wrong membership; M unnamed row (existing logic);
adaptive scoring; privileges (anon and authenticated refused); idempotent repeat; unchanged
digest for a declared-but-not-excluded fixture; scoring-document shape. The existing suite
shows no regression versus the baseline (same results before and after).

**Negative controls:** 25 mutations of the migration, each rebuilt from scratch and run
against the test file. Each makes at least one test fail (for example allowing goals fails
the goal tests, allowing inactive mappings fails the J/K tests, delivering the declaration to
the old function fails the digest test, dropping the audit write fails the audit tests, and
dropping the whole migration fails 24 tests). Three mutations first produced no failure
because other checks covered them; isolating tests were added (starter alone, minutes alone,
a valid adaptive payload) and now each fails them.

TypeScript: `scripts/backend/current-season-performances.test.ts`, 65 tests passing (22 new);
7 mutations of the importer all fail tests. CI's `database-quality` job is the authority for
the pgTAP run: Docker is not available here, so the local database was a hand-built Postgres
with Supabase stand-ins, not the CI stack.

## 8. Risks

- **Wrong "unused" call:** a player who did play but whom the provider shows with no minutes
  and no events would be left out. He has no Fantasy player and no owner, so no points are
  lost, but his real minutes would not be recorded. Mitigations: match events are also
  checked; at most 2 per fixture; the audit table names each one; the exception only runs on
  a canary the owner approves after reading the diagnose.
- **Provider quirks:** a substitute with goals conceded but no minutes is treated as having
  played (not excluded).
- **Adaptive scoring:** not reviewed for this rule, so under it the exception does not apply.
- **Order of deployment:** the migration must be applied before the importer sends a
  declaration. The importer sends nothing outside a canary, so merging the script first does
  no harm.
- **Not covered:** the generated types file lists the renamed function; the types check needs
  Docker and could not be run here.

## 9. Does 707's player 37541460 qualify?

**NEITHER verified today.** The 707 lineup and events stored earlier show an unmapped bench
player of his club's side who played and was booked. I did not re-derive in this session
whether that player is 37541460, so he is not assumed to be unused; the same read-only
diagnose for 707 would settle it. The rule is not loosened for him.

## 10. Next approval needed

1. Review of this patch (migration, test, importer changes, this note).
2. If approved: merge to `main`, then run the read-only diagnose for fixture 711 only, which
   now prints 38227322's facts. If it says verified unused, then a fresh scoped Observe, one
   rolled-back rehearsal of the 11 other identity repairs, the migration, and a single canary
   ingest of 711, each under its own approval.
3. If the diagnose shows he had minutes or an event, the rule refuses and his position is
   needed after all.

Nothing was run in production for this work.
