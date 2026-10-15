# BotolaGO+ member side: brief

Owner decision, 2026-10-14 ("organize it"). Written before the change, per AGENTS.md "Screen work".
Lane 2 of the BotolaGO+ reorganisation (the offer flow and the admin are other lanes and other
files). No database change, no migration, no Lovable. Everything stays behind the existing
switches: the public sees nothing until the owner turns BotolaGO+ on.

## Inspected first (audit B, screenshots of every member state at 390 and 1280, FR and AR)

- Profil: the section is headed by the logo, then a card with « Formule / Statut », then
  « Restaurer un achat » (for a member too) and « Reçus ». Nothing links to the member's
  season, duels or card style. A non-member gets the pitch, receipts and a restore row.
- « Renouvelé le … » reads in the past for a future date. Cancelling shows no way back. Grace
  shows no date and no way to fix the payment, and no banner on Curva. The cancel button
  opens a dialog that ends in « bientôt ».
- Card page: « Votre saison » sits below « Revoir », at the bottom of a long page; on desktop it
  is squeezed into the 240 px side column.
- Season and duel sections write « — » for every league comparison in development, and the
  example numbers disagree (616 points in the member mock, 612 in the sample standing). The
  duel always shows « Karim B. contre Sami », whoever was opened.
- No member can choose a card style: the only picker is the sales step.

## What must be preserved

- Prices (20 MAD monthly with renewal, 200 MAD yearly for 12 months, no renewal), editions
  (holo, electric, pixel, chrome + standard), Fantasy rules, scoring, the gameweek lifecycle.
- The night-stadium look of the season and duel sections; the BotolaGO+ logo is the product name
  (never typed); French « vous »; the word « débloquer » stays banned; no « pass », « premium »,
  « membre » in public copy.
- Non-members still see the pitch and « Découvrir »; with the feature off nothing renders.
- Cancellation, checkout and restore stay « bientôt » (the repository answers `soon`).
- Files of the offer flow (PlusOffer, PlusPage, paywall, routes, locked-section targets) and of
  the admin are not touched.

## Changes

1. Profil: for a member the section becomes « Mon abonnement »: plan and price, status, date
   (« Se renouvelle le », « Jusqu'au », « Prend fin le »), then four links: Votre saison, Vos
   duels, Style de la carte, Gérer. No « Restaurer un achat » for a member. Non-members: the
   pitch and « Découvrir », and the restore row only for a former member (something to restore);
   receipts only when there are some.
2. Style de la carte: a member picker (Standard + the four editions) in a sheet, opened from a
   row on the card page and from the hub, with a live preview and « Enregistrer », calling
   `api.choose_card_design` through a new `chooseCardDesign` on the card-reads repository (mock
   in development). The card's current edition is read from `card.edition` (`my card`).
3. States. Cancelling: primary « Garder mon abonnement ». Grace: the unpaid date, « Mettre à jour
   le paiement », and a banner on Curva (like the J-3 reminder). Expired: two short lines and
   « Découvrir ». The cancel action is hidden until cancelling works; the hub says how it will
   work (« Vous annulerez ici, en un geste. Votre accès reste ouvert jusqu'à la fin de la
   période payée »).
4. Card page: « Votre saison » right under the card block; on desktop it is a full-width
   section under the two columns, not the 240 px column.
5. Wording from the shared table (abonnement, Mensuel / Annuel, Découvrir, Mon abonnement,
   « Se renouvelle le »); the tense of the renewal date is fixed (profile, banner).
6. Season and duel: a comparison without league data is hidden, with its clause in the headline,
   never written « — ». Mock data: 612 points everywhere (Karim B., 11 journées), a mock league
   context (5 managers, 3rd), and the duel shows the opponent that was opened.
7. Dictionary: new keys in one block `// plus member side (lane 2)`; only keys used by these
   screens are changed.

## Acceptance criteria

Functional:
- A member never sees « — » as a league comparison on the season or duel screens.
- The picker saves through `chooseCardDesign`; a lapsed member can go back to Standard; an
  unavailable answer shows a plain message and keeps the previous style.
- Hub states: active monthly (renews), yearly (until, no renewal), cancelling (keep), grace
  (update payment), expired and none (Découvrir only).
- With the feature off: nothing renders, no request.
- Tests: `bun test` for src/components/plus, curva, routes, services, lib, backend/premium;
  `bun run typecheck`; `bun run lint`; the plus CSS lint test.

Visual (390 and 1280, FR and AR/RTL, scenarios monthly, renewing, cancelling, grace, expired,
none; Profil, card page, Curva home, duel): no horizontal overflow, no text clipped, the primary
action of each state is the only filled button, « Votre saison » is directly under the card,
desktop season section spans the content width.
