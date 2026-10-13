# GW3 repair and scoring-save release

Draft only. Production writes are OWNER-RUN, serially, under AGENTS.md and
CLAUDE.md. Never disable a validation guard, invent provider statistics, or
close alerts manually to manufacture a green result.

## Measured state (12 October 2026)

Production V2 is `tkewgajrljbwgwedqsxn`. The owner reports that the 60-second
service-role timeout is already installed and the four ready fixtures have
published provisional points. The permanent change below does not change that
timeout, scoring rules, player prices, provider identities or fixture statuses.

The production read found FOUR fixtures still unrecorded, not three:

| Fixture          | SofaScore event | Attempt outcome                            |
| ---------------- | --------------- | ------------------------------------------ |
| MAT–FUS          | 17256974        | held: sofascore_unmapped_exclusion_refused |
| Amal Tiznit–DHJ  | 17256971        | held: sofascore_unmapped_exclusion_refused |
| Wydad–CODM       | 17256972        | gave_up: minutes_mismatch                  |
| Zemamra–Hassania | 17256968        | gave_up: minutes_mismatch                  |

The terminal minutes failures retain neither the reply nor the player-specific
blocker: `match_data` is null, `last_blockers` carries only the code. Therefore
the culprit cannot be established from those stored attempts. No minutes rule
has been loosened in this PR. Fetch fresh provider replies before deciding
whether the issue is code, provider data, or an owner-reviewed correction.

## Player script: stop conditions still unresolved

`claude/gw3-held-matches-diagnose` contains
`scripts/backend/add-sofascore-only-players-gw3-batch2.sql`. It has not been run
by this agent and remains a rehearsal with null shirts and owner-email placeholder.

| Queue player          | Club's exact database name | Feed ID | Queued shirt |
| --------------------- | -------------------------- | ------- | ------------ |
| Moad Ben El Fkih      | Moghreb Tétouan            | 2829436 | 36           |
| Mohamed Amine Amraoui | Moghreb Tétouan            | 2829437 | 24           |
| Yassine Lhjale        | Difaâ El Jadida            | 2805021 | 31           |

The script matches a club's name or short name, not `MAT`/`DHJ`: use the exact
names from its read query when the owner fills the list.

**MAT #24 is already occupied by Ayo Cha**, membership
`fe5b45fa-87d5-4a75-8bf9-863f031e5905`. The free-shirt guard correctly stops
the batch if the owner enters 24. Investigate the existing player's identity,
current shirt, and fixture-time membership; any corrective change needs its
own measured evidence and reviewed bounded guard. Do not clear that shirt,
change it arbitrarily, or force the batch through. Shirts 36 at MAT and 31 at
DHJ had no active occupant in the measured current-season roster.

Yassine's match feed uses `2805021`, whereas another SofaScore profile named
Yassine Lhjale (`2803760`) lists DHJ. This PR does not equate, map, merge or
retire either identity. Owner acceptance and identity evidence are still needed.

After the corrected player script is reviewed, the owner pauses/drains writers,
rehearses, independently verifies rollback, commits, independently reads back
players/memberships/mappings/queue, and restores the measured writer baseline.
Then read `diagnose-gw3-held-matches.sql`; wait for the refresh and confirm both
fixtures are **recorded**, not merely that queue entries disappeared.

## Fresh minutes diagnosis

For a provider-only fetch **before merging**, the existing `provider-probe.yml`
can run on this reviewed draft branch with `provider: sofascore` and
`fixtures: tests/fixtures/providers/gw3-held-minutes.json`. It has no database
access and makes eight requests (detail, lineups, incidents and statistics for
each match), subject to its existing quota guard. Use `only: gw3-wydad-codm`
for four requests instead. Respect any environment approval; do not bypass it.
Download `provider-fixtures-trimmed` promptly (three-day retention) and provide
the reviewed lineups/incidents for diagnosis. The plan is NOT captured evidence
and does not establish a culprit. No provider secret is available in this
workspace, and no fresh fetch has been claimed.

The read-only workflow's failure now appears in the step summary and masked
Actions log, while preserving its non-zero exit. It does not upload raw logs
or provider payloads. After this PR is reviewed/merged by the owner, dispatch
`sofascore-fantasy-simple-read.yml` on the exact reviewed main SHA with round 3.
Do NOT rerun 38259457047: the workflow explicitly forbids reruns.

Use the fresh player-specific blockers for events 17256972 AND 17256968.
Compare `minutesPlayed` with substitutions/dismissals, including first-half
stoppage already handled by the builder. A genuine rule defect needs a separate
tested code fix. For an evidenced manual correction, follow
`SOFASCORE_FANTASY_SIMPLE.md` and its owner-pinned rehearsal/apply workflows;
never make an inconsistent payload pass by widening a tolerance.

## Permanent set-based save

Migration `20261012174642_fantasy_scoring_save_set_based.sql` replaces only
`api.service_persist_fantasy_scoring_results`. Submitted player/fixture results
are joined once for validation, point events are bulk-upserted, and fixture
facts / all active point events are grouped once for player totals.

The prior body's md5 is `4a38b43093a540caf127f4348311a772`. Both the migration
and owner script refuse a different baseline. Category certification, source
keys, integer/range checks, result scope, immutable input/replay digests,
supersession namespace, transaction rollback, team/captain/chip/substitution
checks, error codes and service-only access remain. Team logic is tested
byte-for-byte against the immutable prior migration. No temporary table is
introduced in the privileged RPC.

Owner release, only after review and green database-quality:

1. Check GitHub workflows, cron and dispatched Edge workers; pause and drain
   ALL relevant writers under AGENTS.md. Record/restore their actual settings.
   The existing pause/resume scripts encode an old exact baseline: a `stop:` is
   evidence that baseline changed, not permission to edit a guard.
2. Run `scripts/backend/verify-fantasy-scoring-save.sql` and save its result.
3. Run `scripts/backend/apply-20261012174642-fantasy-scoring-save.sql` unchanged.
   It embeds the exact migration SHA256, verifies function body/access, and
   proves scoring tables stayed unchanged; final `rollback;` undoes the install.
4. Independently run the verification query: history absent, original body hash,
   identical data-state digests while writers remain paused.
5. Change ONLY the final `rollback;` to `commit;`, run once, independently verify
   the new body/history/access and unchanged data-state digests. Restore writers.

Rebuild embedded scripts with `bun scripts/backend/build-apply-fantasy-scoring-save.ts`.
Check reproducibility with the same command plus `--check`.

## Finalization acceptance

Only after every counted fixture has certified coverage: OWNER dispatches
`fantasy-season-orchestrator.yml` with `confirmation: RUN_FANTASY_ORCHESTRATOR`.
Confirm GW3 finalized, final points/standings published, and no
`remaining_fixtures_pending` or `minutes_mismatch`. Immediately dispatch once
more under the same inputs: compare totals, active point-event keys and
progression records, not just workflow success.

Run the production watchdog and require fantasy_fixture_coverage,
fantasy_progression and fantasy_scoring to pass. This PR does not mute alerts,
finalize a gameweek by hand, or assert that production is already green.

Orchestrator failure evidence now includes `rpcName` and `postgresCode` for
failed worker calls and top-level RPC failures. Raw Postgres messages never
reach that metadata. Database parity tests compare the new function with the
exact legacy body in isolated rollback probes, plus retry/scope/official-point
and double-fixture aggregation checks. Existing adaptive/incremental suites
remain mandatory; CPU speed must be measured before claiming a production gain.
