# Match page: a compact timeline and an honest freshness line (screen brief)

Approved Phase 3 proposal `Match.dc.html`, 2026-10-27. Branch
`claude/p4-match-redesign`. Scope: the match page,
`src/routes/matches.$matchId.tsx` and `src/components/matches/*`.

## What must be preserved

- The club-colour split header (`MatchScoreHeader`), the sticky score bar
  (`MatchTopBar`), the share button and the "Lien copié" toast.
- The four tabs: Résumé, Stats, Compos, Face à face, and their routing
  (`?tab=`).
- Related news (still gated by `NEWS_ENABLED`) and the prediction card.
- The refresh cadence and freshness rules: `src/lib/match-refresh.ts` and
  `src/lib/match-freshness.ts` are not touched. The stale and expired notices
  and their "Actualiser" button stay as they are.
- The "Moments forts" switch and the "Afficher les N remplacements" control,
  with substitutions hidden by default; the goal moment takeover; the fade-in
  of an event that arrives during a live refresh.
- Fantasy, scoring and every other business rule.

## Improvements

1. Events timeline: one compact line per event instead of one card per event.
   The minute sits in a pill in the middle, home events on the inline start
   side and away events on the inline end side (mirrored in Arabic by logical
   properties, no extra rule). Goals are emphasised (heavier text, a club-tinted
   row, a navy minute pill); cards are a small card shape beside the name;
   substitutions stay folded behind the existing control. Half-time and
   full-time separators; newest event first, as in the proposal, so a live
   match shows its latest event at the top. The whole match fits in roughly
   one screen on a phone.
2. Freshness while live: the quiet line reads "Mis à jour il y a X min" /
   "آخر تحديث قبل X دقيقة", worked out from the fixture's stored update time
   (`Match.dataUpdatedAt`), falling back to the time of our last read when the
   source gives none. It re-reads the clock every 15 seconds through the
   existing `useLiveFreshness` tick. Server render and first browser render
   keep the clock-time wording, so hydration agrees.
3. Missing and failed sections: a missing section says one short honest
   sentence (the existing phase-aware wording). The Résumé shows the statistics
   state under the timeline when the match has started (message when none, its
   own retry when that read failed). A failed section shows only its own retry
   and the score and header always stay (already true, now covered by a test).
4. Not built: the "LOGO / Match présenté par" sponsor line (sponsor slots are a
   later feature with an admin switch) and the "EXEMPLE" tag (mock-up data
   marker). The proposal's "Résultat validé" line for a finished match is not
   built: nothing in the data says a result is validated.

No backend change is needed.

## Acceptance criteria

- Visual: in French and Arabic, at 320, 360 and 1280 px, each event is one line
  (a long name may wrap to a second), home on the start side, away on the end
  side, minute pill centred; in Arabic the sides swap. Goals are clearly
  louder than cards. Kawkab–DHJ (10 substitutions folded) fits in about one
  screen below the tabs. No horizontal overflow, measured on element boxes.
- A finished match shows the full-time separator with the score and a half-time
  separator with the half-time score when the data has one.
- Live: the freshness line says "il y a X min" and moves on by itself; stale
  and expired states are unchanged.
- No tap target added below 44 px; text no smaller than 12 px.
- Functional: tabs, share, substitutions control, related news, refresh cadence
  and the existing tests behave as before; i18n keys match in both languages.
