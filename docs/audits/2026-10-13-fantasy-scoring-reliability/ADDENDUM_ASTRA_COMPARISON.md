# Addendum: comparison with the Astra audit (2026-10-13)

A second, independent audit (Astra) covered the same commit `7e8e8ea`. Unlike this audit, it had
**read-only production access**. This note records where the two audits agree, what Astra corrects,
and what it adds.

## Production facts that supersede this audit's PR-based statements

These are Astra's production reads, taken at about 19:35–20:25 GST on 13 Oct.

- **GW3:** finalized at calculation version 20.
- **GW4:** live.
- **The four GW3 fixtures this audit described as unrecorded** (taken from PR #452's runbook) were
  in fact recorded. All eight counted fixtures had observations:
  - four locked full;
  - four locked simple.
- **v2.0 policy:** active from GW3, unpaused.
- **v2.1 reviewed estimates:** the ruleset exists but is **not assigned** to the season.
- **The deployed save function:** still the quadratic one. Its md5 is `4a38b430…`, the baseline
  pinned by #452. #452 itself is not applied.
- **How GW4 came to open after its deadline:** Astra could not establish this.

## New finding: legacy pending predicate (Astra F1, verified)

**Where:** `20260927145230_fantasy_live_participation_scope.sql:40-51`.

**The defect:** the third branch of `pending_players` uses the legacy anonymous-starter coverage
marker and the missing `player_fixture_performances` rows. It applies this even to adaptive
documents, which overrides nonparticipation that the adaptive evidence has already certified.

**The effect:** in production GW3 snapshot 19 it made three verified non-participants of fixture
`ac95346b` pending. That blocked substitutions, vice-captain promotion, finalization and the opening
of GW4.

This is the real mechanism behind what this audit called "UTS–RSB recorded with anonymous starters".
It is an engineering defect, not a data problem.

**Status:** being fixed on `claude/fantasy-pending-items-fast-save`. The fix applies the legacy
branch to non-adaptive documents only, with pgTAP controls.

## Agreement

| This audit                               | Astra                                 | Status on the build branch                                        |
| ---------------------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| F1 whole-match holds                     | F2 snapshot/intake whole-fixture gate | in progress: builder done, database part being built              |
| F2 non-scoring fields reject the match   | F6 rating                             | done                                                              |
| F3 next gameweek coupled to finalization | F4                                    | owner approved (P1); next piece                                   |
| F4 quadratic save                        | F5                                    | done, set-based                                                   |
| F5 observed treated as terminal          | F3                                    | next piece                                                        |
| F6 minutes override / threshold          | F7                                    | done: a straddle keeps the agreed point and the extra point waits |
| F9 zero shown for pending                | F10                                   | done in app; database contract in progress                        |
| F11 monitoring                           | §5 monitoring                         | later piece                                                       |
| F12 retries, error classes, fairness     | F9, F11                               | later piece                                                       |
| F14 latest observation wins              | F12                                   | later piece                                                       |
| F10 identity, name-only auto-map         | F12, §G                               | later piece                                                       |

## Additional items from Astra, not in this audit

These are added to the backlog.

- **F8: no executable published-correction workflow was found.** The 72-hour rule exists, but
  nothing writes a corrected version or recalculates downstream data: rankings, leagues, prizes,
  recaps and Manager Card.
- **Ruleset drift risk.** The adaptive document replaces the ruleset metadata but inherits the
  legacy position, scoring and feature arrays (`20260927094823:234-238`). Today those values are
  equal, so no points discrepancy is observed. Every rule component should be bound to the
  assigned ruleset.
- **Lineup-wide pending.** Any pending player in a squad suppresses all substitutions and
  vice-captain promotion for that lineup. This is deliberately conservative. A narrower dependency
  check is possible later.
- **Attempt state has no claim or fencing token,** and `note()` ignores write errors.
- **Pricing:** Astra asks for a policy on price timing when the previous week is unresolved. This
  audit verified that price changes are driven by transfers only, not points (`20260720163222`).
  The point is therefore narrower than Astra states.
