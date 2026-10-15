# BotolaGO+ « Briefing avant la deadline » — screen brief

Owner-approved scope, 2026-10-15. Chosen design: v3 « Feuille de match / tableau d'affichage ».
Branch `claude/plus-deadline-briefing`. AGENTS.md "Screen work" applies. Docs only in this commit.

## What exists today and must be preserved

- The free deadline card on the Fantasy hub (`DeadlineCard`, `deadline-checklist.ts`): round, date, second
  countdown, checklist, free transfers. It stays free and unchanged.
- Fantasy rules, scoring, rating points, the gameweek lifecycle, transfer cost (1 free per week, 4 points per
  extra transfer, wildcard and free hit make it 0), the 3-per-club limit, prices and chips. Nothing here
  changes a score, a rank or a rule: the briefing only reads.
- The BotolaGO+ switches (`PREMIUM_BUILD`, `usePlusAccess()`: off / locked / member), the night-stadium look
  (`plus-embed.css`, tokens), the shipped locked-section pattern (`PlusLockedSection`), the logo SVG (the
  name BotolaGO+ is never typed on screen), the existing transfer and captain screens (the briefing only
  opens them; nothing is saved from the briefing).
- Owner rules: never « provisoire » (use « en attente » / « بانتظار التقييم »); no card serial number; no
  AI-authorship notice; French « vous », « abonnement », « Découvrir »; Western digits in Arabic.

## What changes

1. A new screen `/fantasy/briefing` (« Briefing J11 ») reached from the Fantasy hub, under the deadline card.
2. Scoreboard header: LED-style countdown to the deadline (days / hours / minutes) and four tally cells
   (confirmed absences, players with no information, free transfers, league rank).
3. « Depuis votre visite » strip: what changed since this device last opened the briefing (stored on the
   device only, labelled « sur cet appareil »): a new published journée, new listed absences, a rank change.
4. A deck of four decision cards, swiped one at a time (tabs 1 to 4 are the pager):
   - Absences: only what the app has. Absences listed by the data provider (with source date) and, for every
     other player, the minutes played in the last published journée. No invented list: where nothing is
     listed the card says plainly that no absence list is available yet. « Aucune info ne veut pas dire
     disponible ».
   - Remplacer: affordable same-position alternatives for a chosen player (budget = sale price + bank), the
     last three journées' published points, club limit, whether the transfer is free.
   - Capitaine: the squad's candidates compared on published points only, next opponent, our own difficulty
     estimate with its confidence. No « best pick », nothing preselected; « les points passés ne prédisent
     pas la J11 ».
   - Transferts: free transfers, the 4-point cost of each extra transfer, the bank.
5. Backend (new migrations only, forward-only, ships OFF): one paid read `api.get_my_deadline_briefing`
   and one `api.get_my_briefing_alternatives`, gated like the other premium reads, no table, no job.
6. States: off renders nothing and requests nothing; locked (signed in, not a member): the real countdown
   clear, the example blurred, « Découvrir »; guest: the countdown and « Créez un compte pour préparer votre
   équipe »; member: everything.

## Honest limits (shown on screen)

- A rating that is missing stays « sans note » (never the fallback 5 as a number); a journée not yet
  published is « en attente ». Every past figure carries « J10 publiée le 12 oct. ».
- Difficulty is our own estimate with a confidence level. Past points do not predict the next journée.
- No injury or suspension feed exists for the SofaScore source: the absence list is the provider's, when
  there is one, and is otherwise empty with an explicit sentence.

## Acceptance criteria

Functional: off → no node, no request; locked → no paid read is made and no member figure is rendered
under the blur; member → all four cards from one read; a pending or missing rating never renders as a
number; transfer-cost warning matches `computeTransferCost`; the screen writes nothing; FR and AR keys in one
block per dictionary; i18n gate, plus CSS 4px-grid lint, ui-kit RTL rule and the manager-card copy test pass.
Visual: matches the chosen design (scoreboard, split-flap digits, deck, ticker) in the real tokens; 390 px and
1280 px; French and Arabic mirrored; text at least 12 px (body 14 px), contrast 4.5:1 measured from
rasterised sRGB, tap targets 44 px, no horizontal overflow measured per element; motion limited to
transform and opacity and off under `prefers-reduced-motion`.
