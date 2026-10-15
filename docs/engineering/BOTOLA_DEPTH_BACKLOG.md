# Botola depth backlog (evidence first)

Written 2026-10-15 for audit roadmap item D6 ("Botola depth, not feature volume").
This is **not a feature specification**. It lists the questions a local supporter
may ask on the match, club and player pages, what those pages answer today, and the
unmet need that must be observed before any of it is built. Nothing here has been
observed yet: every "question" below is a hypothesis taken from the owner's positioning
(one league, two languages) and from reading the code.

## Purpose

Keep depth ahead of feature volume. Pages are read from `src/routes/matches.$matchId.tsx`,
`clubs.$clubId.tsx`, `matches.standings.tsx`, `fantasy.players.$playerId.tsx` and
`pepites.joueur.$playerId.tsx`, plus the freshness work in `docs/audits/` (Phases A to C).
Every answer must reach supporters in French and Arabic with its source and freshness
stated. New guides or social competitions stay out until a need is observed.

## Steps

1. **Observe, in each language separately.** Sessions with 5 to 8 supporters per language
   (the method of `CURVA_COMPREHENSION_TEST.md`): "Show me how you would find ...", on a
   match day. Add support messages and the owner's own notes. Do not log search text: the
   analytics are name-only on purpose (`src/lib/analytics.ts`).
2. **Record each unmet need** as: the question in the supporter's words, the language, the
   page, what they did instead, and whether the page already answers it.
3. **Decide per item**, with the owner. An item enters a specification only when its
   "observe first" line below is met. Suggested bar: the same need from at least two
   supporters of one language.
4. **Name the source and the age** of every answer before building it. If the data holds no
   timestamp or source, that is a backend dependency (the Phase A notes say a true "last
   polled" time needs a new field), not something the page may imply.
5. A native Arabic reader checks any wording on the live pages. The 2026-10-14 audit lists
   stored and dynamic editorial text as not yet proofread, and the dictionary reviews do not
   cover it.

## Backlog, in priority order

Priority follows trust first: a supporter who doubts the score will not use the rest.

**1. "Is this score current, and who says so?"** (match page, live strips)

- Shown today: the live match page states its age ("Mis à jour à", "Score non actualisé
  depuis") and, past 3 hours of quiet data after kick-off, "Score à confirmer" (Phase A,
  DATA-01). An unknown score is a dash (DATA-03).
- Source and freshness today: no page names the data provider. Live strips, match cards,
  the matchday strip and head-to-head rows have no freshness check (Phase A, limit 3).
- Observe first: supporters who doubt a score on a card or strip, or compare with another
  app and say which is right.

**2. "Is the date and time of this match confirmed, and what is the new one?"**

- Shown today: "Heure à confirmer" and "Date à confirmer"; postponed, suspended, cancelled
  and abandoned each have wording, and a postponed match says "Nouvelle date à confirmer"
  (Phase B, DATA-04).
- Source and freshness today: no "date changed on" and no reason.
- Observe first: supporters looking for a rescheduled date, or asking why it moved.

**3. "Is the table right, and what is counted?"** (standings, club Classement tab, Face à face)

- Shown today: a note that the table is computed from results, "non officiel" or
  "provisoire" when it is, shared ranks explained, club points deductions kept (Phase B,
  DATA-05).
- Source and freshness today: no calculation time on the Botola table. A corrected table is
  recomputed in the browser; the backend has no official correction time (Phase B, limit 6).
- Observe first: disputes about a position, or questions about a deduction or tiebreak.

**4. "Who is out, and who starts?"** (Compos tab)

- Shown today: "Compositions probables" with a "Probable" mark; absent players per club
  as injured or suspended, with the provider's expected return date when it has one.
- Source and freshness today: no age on lineups or absences.
- Observe first: supporters asking before kick-off when lineups appear, or trusting a
  "probable" lineup as final.

**5. "How is my club doing and what is next?"** (club page: overview, matches, table, squad)

- Shown today: record, goals, win rate, clean sheets, form chips, next match, the club's
  news, the season picker.
- Source and freshness today: season statistics have no age.
- Observe first: which question comes first for a club's supporters (home and away form,
  the next opponent, top scorers). Do not add all of them on assumption.

**6. "Who is this player?"** (squad rows, global search, player pages)

- Shown today: the squad lists number, name and position, and a row opens nothing ("there
  is no football player page", `ClubSquad.tsx`). Searching a player opens the **Fantasy**
  player page (price, form, minutes, ownership, next match). Pépites pages cover under-23
  players only.
- Source and freshness today: the Fantasy page is Fantasy data, not a football profile.
- Observe first: supporters tapping a squad row expecting a profile, or leaving the Fantasy
  page without what they came for. Rights for photos and crests apply to any new surface.

**7. "How did these two clubs meet before?"** (Face à face)

- Shown today: where the two clubs stand and their last meetings, newest first.
- Source and freshness today: depth of the history is whatever the provider holds.
- Observe first: whether supporters want more than the last meetings, and for which
  matches (derbies, cup ties).

**8. "Are the names the way I write them?"** (clubs, players, venues in Arabic)

- Shown today: names come as stored localized text (venue, clubs, players).
- Observe first: a native Arabic reading of live match, club and squad pages; do not
  infer problems from the dictionary files alone.

## What counts as evidence

Recorded sessions and messages in the format of step 2, per language, with the date and
the build seen, and a native Arabic reader's notes. An item without recorded observation
stays on this list unbuilt.

## What we will NOT claim

- That any listed question is something supporters ask: they are hypotheses until observed.
- That a page is complete, accurate or "live": freshness is shown only where the code shows
  it, and no provider is named to readers today.
- Any gain in visits, retention or Fantasy sign-ups from adding depth.
- That depth in one language holds in the other; check each separately.
- Anything about prices, tiers or prizes. The game stays free to play.
