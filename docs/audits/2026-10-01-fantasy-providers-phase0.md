# Fantasy providers, Phase 0 probe: Sofascore and Flashscore (2026-10-01)

Evidence for `docs/backend/FANTASY_SOFASCORE_FLASHSCORE_PLAN.md`, Phase 0. Read-only: no
database, Supabase or production access. The RapidAPI key stayed in the
`staging-load-test` environment secret. Logs are public, so only field names, types and the
specific values named below were printed; the committed fixtures are trimmed copies (see
`tests/fixtures/providers/README.md`).

## Verdict

**The plan mostly works, with one part that does not hold up.** Both providers return what
the plan needs for goals, cards, minutes, substitutions and (together) assists and
penalties. Flashscore fills the assists and penalty markers that Sofascore leaves out on
limited-coverage matches. The derived goalkeeper-saves rule (plan section 4, and with it
decision D2 / ruleset v2.2) is **not supported by the data**: see finding 1.

## Requests used

| Provider | Requests this session | Monthly limit | Left at last reading |
|---|---|---|---|
| Sofascore (Api Dojo, BASIC) | 56 (including the last reading) | 500 | 408 |
| Flashscore (FlashLive, BASIC) | 52 (including the last reading) | 500 | 448 |

The 40 + 28 requests of the main fixtures run are included. Failed calls (404 and 422) count
against the quota; the gateway's 404 for `openapi.json` did not.

## What each source returned, per match

S = Sofascore, F = Flashscore. "Limited" = Sofascore returned no ratings, no saves and
zeros for assists.

| Match | S coverage | S goals / assists | F goals / assists / penalty markers | Shots on target (F) |
|---|---|---|---|---|
| Touarga 2-1 FUS | limited | 3 / 0 (FUS penalty labelled `regular`) | 2 + 1 penalty / 2 / awarded 1, scored 1 | 3 - 4 |
| DHJ 2-6 CODM | limited | 8 (3 penalty) / 0 | 5 + 3 penalty / 4 / awarded 3, scored 3 | 5 - 8 |
| WAC 1-3 Temara | limited | 4 (2 penalty) / 1 | 2 + 2 penalty / 1 / awarded 2, scored 2 | 2 - 6 |
| Tiznit 1-3 Tanger | full | 4 / 4 | 4 / 3 | 6 - 5 |
| MAS 2-1 Zemamra | full | 3 (1 penalty) / 1 | 2 + 1 penalty / 1 / awarded 1, scored 1 | 5 - 2 |
| Tetouan 0-0 Berkane | full | 0 / 0 | 0 / 0 | 1 - 5 |
| KACM 2-3 HUSA | full | 5 (1 penalty) / 3, 1 missed penalty | 4 + 1 penalty / 3 / awarded 2, scored 1, missed 1 | 8 - 4 |
| Wydad 1-2 Touarga (25/26) | full | 3 / 1; 1 second yellow | no Flashscore ID | - |
| Touarga 1-0 Tanger (25/26) | full | 1 / 1; 1 red | no Flashscore ID | - |
| HUSA 1-0 Touarga (25/26) | full | 1 / 0 | no Flashscore ID | - |

Goals add up to the final score in every match (Flashscore: `GOAL` + `PENALTY_SCORED`).

## The checks asked for

- **Flashscore IDs:** found for the 7 matches of 2026/27 round 1 (all on page 1 of
  `v1/tournaments/results`). **Not found for the 3 matches of 2025/26**: results lists one
  season stage at a time, search lists only the current stage, and the earlier stage ID is not
  exposed by the endpoints verified here. `events/list` needs `sport_id`, `timezone` and
  `indent_days` (a day offset from today), so it looks up one day at a time across all football;
  it was not called with parameters.
- **Assists and penalties where Sofascore had none:** yes. `v1/events/summary` gave 2 assists
  and the penalty goal for Touarga-FUS, and 4 assists for DHJ-CODM, where Sofascore had 0.
- **Team shots on target for every match:** yes, "Shots on target" is present for all 7
  Flashscore matches. The 3 limited matches have no such line on Sofascore.
- **`v1/events/player-stats`:** HTTP 404 (a 29-byte `detail` message). Nothing for Botola.
  `summary-incidents` returned the same bytes as `summary`, so only `summary` is needed.

## Findings that change the plan

1. **Derived goalkeeper saves do not hold up.** The plan derives a limited match's saves from
   Flashscore shots on target and only when Sofascore agrees. (a) On a limited match Sofascore
   has no shots-on-target line, so the agreement test can never pass. (b) Where both have it,
   they disagree on 3 of 4 full-coverage matches:

   | Match (home - away) | Sofascore | Flashscore |
   |---|---|---|
   | Tiznit-Tanger | 3 - 6 | 6 - 5 |
   | MAS-Zemamra | 4 - 1 | 5 - 2 |
   | Tetouan-Berkane | 1 - 5 | 1 - 5 |
   | KACM-HUSA | 9 - 5 | 8 - 4 |

   (c) Sofascore's own numbers are consistent: keeper saves + goals conceded equals the
   opponent's shots on target in 13 of 14 team sides across the 7 full-coverage matches; the
   Flashscore figures fit only 1 of 4. So a saves value derived from Flashscore would have been
   wrong in most of the matches that can be checked. (d) Flashscore has no keeper-saves line.
   Recommendation: do not publish ruleset v2.2 on this basis; leave decision D2 open until a
   reliable saves source exists. Without it, limited-coverage matches (about 3 in 10) stay in
   simple mode as today.
2. **Sofascore lineup `goals` undercounts.** WAC-Temara: one player scored twice in the
   incidents and is credited once in the lineup (3 against 4). Use incidents plus Flashscore
   for goals, as the plan's both-providers rule already does.
3. **Names differ between providers** ("M. Elhtemy" and "Lahtimi M."; "M. Farhane" and
   "Ferhane M."). Match players by side, shirt number and position first, not by name.
4. **Penalties:** Flashscore marks them explicitly (`PENALTY_KICK`, `PENALTY_SCORED`,
   `PENALTY_MISSED`). Sofascore's class `penalty` was right for 7 of the 8 penalty goals but labelled the
   Touarga-FUS penalty `regular`. A missed penalty is a Sofascore incident (`inGamePenalty`,
   class `missed`) and a player statistic (`penaltyMiss`), and agrees with Flashscore.
5. **Sofascore assists:** zero on a limited match means unknown (Flashscore listed assists
   for the same goals). On full matches the two agree, except Tiznit-Tanger, where Flashscore
   is silent on one assist that Sofascore names, the plan's "one source silent" case.

## Not established

- Flashscore labels for a red card, a second yellow and an own goal: none occurs in the 7
  matches. Sofascore shows `card/red` and `card/yellowRed`; no own goal in any of the 10.
- What the Flashscore incident type `NOT_ON_PITCH` means (seen in 2 matches).
- Whether Sofascore later fills a limited match: Touarga-FUS was still limited today, five
  days after the match, as in the earlier audit.
- Flashscore data for 2025/26 (no event IDs).
