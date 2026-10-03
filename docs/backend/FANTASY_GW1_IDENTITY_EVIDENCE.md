# Fantasy: GW1 identity evidence batch (seven finished matches)

Status: **review only**. Nothing here is a proposal, an approval or a mapping. No candidate, observation,
proposal or mapping was written; production was only read. Single-operator mode is unchanged. Builds on
[`FANTASY_MAPPING_AWARE_RECONCILER.md`](FANTASY_MAPPING_AWARE_RECONCILER.md) and the completed 189-row batch
(`docs/production/APPLIED_2026_10_03_PLAYER_MAPPING_BULK_189.md`, manifest untouched).

## Three dates, kept apart

| What                                              | Value                                                         |
| ------------------------------------------------- | ------------------------------------------------------------- |
| Fixture kickoffs                                  | 2026-09-24 to 2026-09-27 (per fixture, in the manifest)       |
| Provider payloads (historical, committed Phase 0) | observed 2026-10-01 12:00 UTC; **not** a fresh provider check |
| Reviewed mapping snapshot (191 Sofascore rows)    | read 2026-10-03; digest `e9dfc405…c7874`                      |
| Candidate records                                 | read 2026-10-03 07:07 UTC                                     |
| Date-of-birth corroboration                       | read 2026-10-03 07:15–07:17 UTC                               |

## What was added (all pure, local, read-only)

| Piece                                                                                                                                                               | File                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Worklist: every player who appeared, deduplicated by provider id, five classes, explicit dependencies, collision checks, hashed manifest, hypothetical mapping rows | `src/backend/fantasy/provider-identity-worklist.ts`      |
| Date-of-birth corroboration (a state only, never a date)                                                                                                            | `src/backend/fantasy/provider-identity-corroboration.ts` |
| Four stage verdicts and unresolved-appearance counts                                                                                                                | `src/backend/fantasy/provider-replay.ts`                 |
| Canary ranking                                                                                                                                                      | `src/backend/fantasy/provider-canary-ranking.ts`         |
| Collector for the manual "Provider probe" workflow (`corroborate_pairs`)                                                                                            | `scripts/backend/provider-identity-corroboration.ts`     |
| Builder: worklist, manifest, A-versus-B replay                                                                                                                      | `scripts/backend/build-gw1-identity-evidence.ts`         |

The bridge (PR 314) was also corrected: the same Flashscore id and the same app player across matches is one
suggestion with every match's evidence; one id for two players, or two ids for one player, is a conflict and the
input order decides nothing; copies of one incident count once; a goalkeeper/outfield disagreement is caught in
both directions; and the bridge is used only for the same linked, finished, same-score, same-kickoff match pair
(own goals tolerated).

## Provider requests: 28 of at most 32

The existing verified endpoints only: Sofascore `matches/get-lineups` (carries every player's birth date; one
request per distinct match, reused) and Flashscore `v1/players/data` (one per distinct player). Squads were not
re-collected. Each response was fetched once, none failed, none was retried, the quota reserve held.

| Run                                                   | Sofascore | Flashscore | Pairs  | Result                   |
| ----------------------------------------------------- | --------- | ---------- | ------ | ------------------------ |
| 37105728275 (Maghreb Fès–Zemamra)                     | 1         | 7          | 7      | 7 AGREE                  |
| 37105800631 (goalkeepers, assisters, Kawkab–Hassania) | 6         | 14         | 14     | 14 AGREE                 |
| **Total**                                             | **7**     | **21**     | **21** | **21 AGREE, 0 DISAGREE** |

The logs of a public repository are public: the collector prints only provider ids, a state per pair and request
counts, and refuses to print anything that looks like a date. Flashscore writes the birth date as unix seconds.
A 1 January date is treated as no signal (placeholder); a missing or unreadable date is no signal, never a
disagreement.

What agreement shows: two providers give the same person the same birth date, a second signal beside the shirt
number on the same side of the same match. It does not show the player's club on a match date, his position, or
that he played. Flashscore's current team was not used (current squad context does not establish membership at an
earlier kickoff).

## The batch (one consolidated list; manifest sealed)

Manifest: `docs/production/manifests/gw1-identity-evidence-2026-10-03.manifest.json`, SHA-256 in the matching
`.sha256` file. Names and raw birth dates are not in it.

| Provider                        | READY  | AMBIGUOUS | CONFLICT | INSUFFICIENT_EVIDENCE | CANDIDATE_RECORD_MISSING | Total |
| ------------------------------- | ------ | --------- | -------- | --------------------- | ------------------------ | ----- |
| Flashscore                      | **53** | 0         | 0        | 146                   | 19                       | 218   |
| Sofascore (no reviewed mapping) | **1**  | 2         | 40       | 79                    | 11                       | 133   |
| **Total**                       | **54** | 2         | 40       | 225                   | 30                       | 351   |

READY rows by evidence class:

| Class | Rows | Chain                                                                                                                                                                                             |
| ----- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1    | 32   | Flashscore → reviewed Sofascore → app: a shirt number plus aligned goals, cards or substitutions (or two events)                                                                                  |
| F2    | 21   | Flashscore → reviewed Sofascore → app: an agreeing unique shirt number plus the same birth date from both providers (8 are goalkeepers)                                                           |
| S1    | 1    | Sofascore → app: exact birth date, club and position agree on one app player (no SportsMonks identity on the target, which the 189-row contract required: shown as a class so it can be excluded) |

Dependencies: **0** (no Flashscore row rests on a Sofascore mapping that is only proposed; the mechanism exists and
is tested). Collisions: **0** (no app player is the target of two ready rows, none already has a Flashscore mapping).
5 ready rows are players in a locked Fantasy squad; 8 are scorers, 4 assisters, 9 goalkeepers.

Not ready, and why (identity gaps):

- **Flashscore, no candidate record (19):** includes a Hassania goalkeeper. A record cannot be proposed on until one
  exists; none was created.
- **Flashscore, insufficient (146):** the partner Sofascore player has no reviewed mapping and no safe canonical
  target.
- **Sofascore, no candidate record (11)** versus **no safe canonical match (79):** different problems.
  The 79: 57 have no app player of the observed club with the same birth date (the catalogue's date may be
  missing, a placeholder or different), and 22 have a provider birth date that is missing or 1 January.
- **Sofascore, conflict (40):** the one birth-date match has a contradicting club, position or shirt, or the
  provider registers the player to a different team. These need a person to look at the app's membership data;
  more evidence of the same kind cannot settle them.
- **Six goalkeepers** have a Sofascore partner with no reviewed mapping and no safe target; the date-of-birth check
  can corroborate the pairing but there is no canonical player to point it at.

## Seven-match replay: current (A) against HYPOTHETICAL (B)

**B is HYPOTHETICAL, NOT PRODUCTION-REVIEWED**: the 191 reviewed mappings plus the 54 ready rows as if executed.
Four separate stages: IDENTITIES_RESOLVED (every appeared player reviewed on both providers), EVENTS_RECONCILED,
PARTICIPATION_ESTABLISHED (minutes, goals conceded and clean sheet verified for everyone, nobody unpaired),
SCORING_FIELDS_READY (full or simple, nobody held back). A legacy full or simple result alone is never ingestion-ready.

| Match                   | A result            | B result (hypothetical) | Unresolved appearances A (Sofa / Flash) | B (Sofa / Flash) | Unresolved with scoring incidents B | Events       | Participation | Scoring fields | Identities |
| ----------------------- | ------------------- | ----------------------- | --------------------------------------- | ---------------- | ----------------------------------- | ------------ | ------------- | -------------- | ---------- |
| Maghreb Fès 2-1 Zemamra | full                | full                    | 22 / 31                                 | 22 / **22**      | 6                                   | yes          | yes           | yes            | **no**     |
| Kawkab 2-3 Hassania     | simple              | simple                  | 18 / 32                                 | 18 / **18**      | 12                                  | yes          | yes           | yes            | no         |
| Tetouan 0-0 Berkane     | incomplete (2 held) | incomplete (2)          | 13 / 31                                 | 13 / 23          | 2                                   | yes          | **no**        | no             | no         |
| Touarga 2-1 FUS         | incomplete (1)      | incomplete (1)          | 18 / 29                                 | 18 / 21          | 10                                  | yes          | **no**        | no             | no         |
| WAC 1-3 Temara          | **review**          | incomplete (13)         | 23 / 32                                 | 22 / 27          | 12                                  | yes (was no) | **no**        | no             | no         |
| Tiznit 1-3 Tanger       | incomplete (3)      | incomplete (3)          | 19 / 31                                 | 19 / 27          | 13                                  | yes          | **no**        | no             | no         |
| DHJ 2-6 CODM            | review              | **review**              | 20 / 32                                 | 20 / 27          | 15                                  | **no**       | no            | no             | no         |

- In the two best matches the Flashscore gap is now **exactly** the Sofascore gap: every still-unresolved Flashscore
  player is the same person as an unresolved Sofascore one, so the only thing left is a canonical target for
  those Sofascore players.
- **No match reaches IDENTITIES_RESOLVED.** Every match still has 13 to 22 Sofascore players with no reviewed
  mapping and no safe canonical target.
- WAC–Temara leaves review (its disputed scorer is now paired by reviewed identity), but 13 players are held back on
  substitution and timeline disagreements: a statistical conflict, not an identity one.
- DHJ–CODM stays in review: five of its six scorers are COD Meknes players with no reviewed Sofascore mapping.
- Statistical conflicts (held-back minutes, goals conceded and clean sheets in Touarga, Tiznit, Tetouan, WAC) are
  separate from identity and are not hidden by the mapping count. Nothing was converted to a verified zero.

## Canary recommendation: Maghreb Fès–Zemamra (MAS–Zemamra)

Ranked by the work left (rule in `provider-canary-ranking.ts`: evidence stages already cleared first, then fewer
unresolved identities on players with scoring incidents, then fewer unresolved appearances). It is the only match
that is `full` with every non-identity stage cleared and the fewest unresolved identities on scoring players.
Kawkab–Hassania (simple) is second.

Exact remaining blockers for MAS–Zemamra (all identity; events, participation and scoring fields are ready):

- 22 Sofascore players with no reviewed mapping: 11 with no app player of the club sharing the birth date, 7 with a
  contradicting signal, 2 with a provider birth date missing or a placeholder, 2 with no candidate record. Their
  Flashscore twins (22) cannot be resolved until the Sofascore side has a canonical target.
- 3 of the 22 are on the scoring sheet (a scorer, an assister or a card).
- The keeper at away is one of the 22 (his Sofascore id is not a candidate record).

A staging canary could ingest MAS–Zemamra with those players explicitly held back (the reconciler already holds back
an unresolved player and gives no points), but the reviewed-identity path should not be called ready for the match
until the 22 are settled.

## Does the bulk tool handle this evidence class?

Not as it is. The bulk path proposes Sofascore rows from a frozen manifest under one eligibility contract. The
smallest extension (not built here; no new platform): the manifest row gains `provider = flashscore`, a
`supportingMappings` list and `evidenceRefs` (fixture ids, incident kinds, minutes: the propose RPC already accepts
`flashscoreCandidateId` and references, and refuses names); and the per-row revalidation checks, before each
proposal, that the Flashscore candidate is still unmapped at the same evidence revision, that each supporting
Sofascore mapping is still active at the same version, that the target has no Flashscore mapping, and that no
dependency row was refused. Fingerprints stay server-computed; the owner still proposes, approves and executes.

## Smallest next step toward staging ingestion

1. Approve this manifest (hash in the `.sha256` file) as the batch to extend the bulk path for: 53 Flashscore rows
   (32 events, 21 shirt plus birth date) and, if the owner accepts the missing SportsMonks corroboration, 1 Sofascore row.
2. Settle the 22 MAS–Zemamra Sofascore players: the 7 conflicts are a membership question in the app's catalogue
   (club), not an identity-evidence one, and the 11 with no birth-date match need the catalogue's dates or another
   structured signal. Do not guess them.
3. Then replay again and rehearse MAS–Zemamra on staging.

Not done and not authorised here: any proposal, approval or mapping; candidate or observation population; production
ingestion or scoring; GW1 finalisation; automation.
