# BotolaGO+ « Votre journée expliquée »

Screen-work brief (AGENTS.md, "Screen work"). Written before any interface change, on branch
`claude/plus-round-recap`, based on `origin/main`. Copy it into the draft pull request description.
Approved scope: owner decision of 2026-10-15, design v2 « Vue tactique » (the eleven on a dark pitch).

## What must be preserved

- The free recap: « Ma journée BotolaGO » (`GameweekRecapCard`, `gameweek-recap.ts`, its share image and
  public recap pages). Free stays free: total, captain line, top scorer, the basic share image.
- Curva's card page, « Votre saison » and the duel sheet, their tests, the offer (`/curva/plus`) and its steps.
- Business logic: Fantasy rules, scoring, gameweek lifecycle, the Manager Card. The feature is display only
  and writes nothing. Membership never changes a score, a rating or a rank.
- The BotolaGO+ « night stadium » look (`plus-embed.css`, tokens), the logo as the only way the name appears,
  French « vous », Arabic right to left with Western digits, one headline per block, all text bold.
- The BotolaGO+ switches: `PREMIUM_BUILD` / `usePlusAccess()` (off, locked, member).

## Rules applied over the design (owner, 2026-10-15)

- Never the word « provisoire »; use « en attente » / « بانتظار التقييم ».
- No card serial number anywhere.
- A player without a rating yet reads « sans note » or « en attente », never a number taken from a fallback.
  Points are shown as points; a rating is shown only if the backend says it is one.
- The app has no injury or suspension source. The bench strip shows only minutes played and published points;
  no absence list is invented.
- A trophy is never taken back and a corrected result is shown as « Résultat corrigé »; nothing here
  removes anything earned.

## What changes

1. **Backend (new migration only, forward-only, slot 20261015120000):** one member read,
   `api.get_round_recap(p_gameweek, p_league)`, `security definer`, gated by the same membership state as the
   other premium reads (off / preview / locked / member). It serves the caller's own journée: score parts,
   starters and bench with points and minutes, the captain, the transfers with this journée's points of the
   player out and in, the league average, best and rank movement over the managers of ONE private league
   (averages hidden under three managers), and a remainder « vos autres choix ». No table, no job, no writer.
2. **Guarded apply script** `scripts/backend/apply-20261015120000-premium-round-recap.sql` (rehearsal ends in a
   raise, then apply) and a pgTAP test.
3. **Front end:** repository interface, Supabase implementation and a development mock (Karim B., journée 11);
   a section « Votre journée expliquée » on Curva's card page: member (pitch, cause list, bench, share),
   locked (the real score and rank clear, the example blurred, « Découvrir »), off (nothing, no request); a
   share card (post 4:5 and story 9:16) through the existing share sheet; a season recap strip
   « Votre saison jusqu'ici » built from the career and league reads that already exist.
4. French and Arabic copy in one block per dictionary file.

## Acceptance criteria

Functional
- Off: no node, no request. Locked: the free score and rank are clear, nothing of the member's pitch or
  figures is rendered under the blur (the example is a fixed dataset). Member: the full section.
- Every figure that depends on ratings carries « Publié le … »; a player not yet scored reads « en attente »
  and the score is marked « en attente »; a corrected result says « Résultat corrigé ».
- The league average is « moyenne de votre ligue privée (N managers) » and absent under three managers.
- Tapping a cause (Capitaine, Transfert, Vos autres choix) lifts the chips it came from; keyboard operable.
- The share card has no league name and no other manager's lineup; basic share stays free.
- Database: grants (authenticated, service_role only), stable security definer with empty search_path, the
  off and locked answers, values worked out by hand on a seeded league, the minimum group, a league the caller
  is not in, writes nothing. `bun run backend:migrations:check` passes. No database was touched by this lane.

Visual (measured, not asserted)
- Match the v2 design: navy pitch with mowing stripes, chips lit by points (mint rim at 8 and above, hatched
  sky rim for « en attente »), captain badge, transfer badge, cause rail with thin tracks, bench strip.
- FR and AR at 390 px and FR at 1280 px, in member, locked and off states, no horizontal overflow checked per
  element, text at least 12 px, tap targets at least 44 px, contrast at least 4.5:1 from rasterised pixels.
- Motion is transform and opacity only and off under `prefers-reduced-motion`.
- The i18n gate, the plus CSS 4 px-grid lint, the manager-card copy test and the ui-kit RTL rule keep passing.
