# GW1 fixture 711: position evidence for SportsMonks player 38227322 (1 Oct 2026)

**Decision: POSITION_STILL_UNVERIFIED.** No source above the "general aggregator" tier gives
a position, and the only structured source that groups him (FotMob's squad list) is
shown below to be unreliable for records like his. Read-only: nothing was written to
production, no code changed, no observation recorded.

Player: Soufane Abderrahmane, SportsMonks 38227322, CR Khemis Zemamra (SportsMonks team
227263), shirt 21, substitute (not a starter) in fixture 19874711, 27 Sept 2026 18:00
UTC, MAS Fès (home) 2-1. SportsMonks position: null in the lineup; absent from every
club squad in the 1 Oct observation.

## Identity cross-check (before using any external evidence)

| Attribute | SportsMonks | FotMob (player 2306971) | BSD (player 216086) |
| --- | --- | --- | --- |
| Name | Soufane Abderrahmane | Soufane Abderrahmane | Soufane Abderrahmane |
| Club | CR Khemis Zemamra | Renaissance Club Zemamra (team 950070) | Renaissance Zemamra |
| Shirt | 21 (lineup) | 21 (profile, squad, last-lineup bench) | none |
| Same fixture | 19874711, 27 Sept 2026 18:00 UTC | 27 Sept 2026 18:00 UTC, away at MAS Fès | n/a |
| Bench / minutes | substitute (`started: false`) | `onBench: true`, 0 minutes | n/a |
| Date of birth | null | placeholder (year 0001) | null |

FotMob matches on four attributes (name, club, shirt, same match and bench state), so it is
the same person. BSD matches on name and club only (it has no shirt or match data), which is
not enough to link on its own. The date of birth is missing everywhere, so it cannot be used.
Sofascore player 2791384 was **not** cross-checked: Sofascore could not be reached (below).

## Evidence by source tier

| Tier | Source | What it says |
| --- | --- | --- |
| A. Official federation, club, match sheet | Web searches for the FRMF match sheet and club squad; MAP Sport report fetched | Not found. The report I fetched names only scorers (Essaghir 48', Mabasa 59' penalty, El Mahraoui 64') and has no lineup. I did not reach an FRMF match sheet or an official club squad list, so tier A is unresolved, not negative. |
| B. Sofascore authenticated API | RapidAPI subscription | **Not reachable from this environment.** No key here, and the repo's probe workflow prints field names and types only (never values, by design, because the repository is public). The public Sofascore pages return HTTP 403. See the requests to run below. |
| C. Structured provider | FotMob player page | `positionDescription` is **null**; career role null; shirt 21; no age. |
| C. Structured provider | FotMob club squad list | Lists him under "defenders" (`role: defender_long`, `positionId: 1`) with `positionIds: null`, `age: 0`, no date of birth. |
| D. Aggregator | BSD sports-data API | Record exists (club Renaissance Zemamra); `position` is an **empty string**. |
| D. Aggregator | Flashscore squad page, YS Scores and Footix lineup pages (fetched) | His name was not found in the fetched pages (Flashscore may render its list with scripts, so this is weak). BeSoccer blocked the request; Footmercato's squad page was only seen as a 2025/26 search result. |

## Why FotMob's "Defender" is not enough

- His own profile has no position; the squad grouping is the only place it appears.
- His squad record is nearly empty (no age, no date of birth, no detailed positions). The
  same page holds comparable sparse records: **Achraf Eddahbi** (SportsMonks 38227321, in
  the same 711 lineup) is grouped as a *defender* by FotMob while SportsMonks says
  *midfielder*. So for records like this the grouping disagrees with another source, and the
  grouping may be a default for an unknown position.
- You asked that FotMob alone not be sufficient, and nothing from tier A or B backs it.

Side note (not acted on): the 711 plan files Eddahbi as a Fantasy MID at 7.20 from
SportsMonks' lineup position. FotMob disagrees. That is an owner question separate from this
one; no Fantasy row has been created.

## Requests to run in the RapidAPI Playground (Sofascore, `sofascore.p.rapidapi.com`)

Event 17132481 is "MAS 2-1 Renaissance Zemamra" in the repository's earlier Sofascore audit
(`docs/audits/2026-10-01-sofascore-rapidapi-coverage-test.md`, full-coverage match, 31
played). Three calls, about 3 of the 500 monthly requests:

1. `matches/detail?matchId=17132481`: confirm home team MAS Fès, away team Renaissance
   Zemamra, start time 1790532000 (2026-09-27 18:00 UTC), score 2-1.
2. `matches/get-lineups?matchId=17132481`: in the **away** side's players find the entry whose
   `player.id` is **2791384**. Record: `player.name`, `player.position` (G, D, M or F, his
   profile position), the entry's own `position` if present (position played), `shirtNumber` /
   `jerseyNumber` (expect 21), `substitute` (expect true), and whether `statistics` is absent
   (an unused substitute has none). Use the home/away side, not `teamId` (the audit found it
   can be a player's registered club).
3. If the Players group is on the playground's endpoint list (check the left-hand list; the
   name is not documented in this repository): player detail for `playerId=2791384`: team,
   position, shirt number.

Accept as verification only if: (1) the match, teams, date and score match, (2) player 2791384
appears on the Zemamra side as shirt 21, substitute, with the name above, **and** (3)
Sofascore gives a position. Do not infer a position from formation order or shirt number. If
Sofascore also gives none, the position stays unverified; if Sofascore and FotMob disagree,
it stays unverified.

Please paste the three responses' relevant fields (not the key). Alternatively, the club's
official squad list or the FRMF match sheet, if you can get it, outranks Sofascore.

## What 711 needs next

Not a position override yet. 711 cannot proceed to the planned scoped rehearsal: the
rehearsal's plan skips a player the provider gives no position (`skip_no_position`), so he
would stay unplaced and 711 would keep failing with `PLAYER_MAPPING_NOT_FOUND`. If a
position is verified, the smallest variant would be a reviewed one-id override (player
38227322 only) carrying the source, the evidence and a review reason, with every other
player on the normal rules and tests proving a missing, mismatched or unapproved override is
refused. It is not prepared, because the position is not verified.
