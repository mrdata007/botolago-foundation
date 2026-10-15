# BotolaGO+ « Saison » — brief (offer, payment, Ma saison, admin)

Owner decisions of 2026-10-15. Scope: the screens only. The database half is another branch
(`claude/plus-season-backend`); these screens run on the mock repository until it lands. Evidence
for the "before": the offer (`/curva/plus`), Profil › « Mon abonnement » (`?plus=yearly`, `expired`),
Curva's member rows and `/dev/plus-admin-sample`, inspected on `main` before any edit.

## What must be preserved
- Fantasy stays free. « Le compte est gratuit » / « sans achat » claims (`landing.faq_free_a`,
  `curva.guest.free`, `prizes.free_to_play`) are untouched.
- The night-stadium look of the offer (always-dark surface, mint call to action, phone frame on wide
  screens), the ui-kit tokens in Profil and the admin. No new visual language.
- The product name is the logo (`PlusLogo`), never typed on screen. French « vous », Western digits
  in Arabic, RTL mirrored, prices as left-to-right units.
- The benefits list, the card styles, the example season, entry points, lock chips and « Découvrir ».
- Business rules of Fantasy, scoring and the gameweek lifecycle. Old monthly/yearly data still parses.
- The build and database gates (`PREMIUM_BUILD`, `usePremium`), the audit and step-up rules of the admin.

## What changes
1. **One purchase.** « Saison 2026/27 · 200 MAD · Valable jusqu'au {date} » (date from `validUntil`).
   No monthly card, no toggle, no saving, no renewal, no restore.
2. **New « Payer » step** after « Payer ma Saison »: amount, bank transfer block (holder, bank, RIB
   with copy), CashPlus/Wafacash block (recipient), the personal code `BG-XXXXXX` with copy, and a
   large « Envoyer le reçu sur WhatsApp » button (`wa.me`, message prefilled FR/AR with the code).
   Details not published: « Les coordonnées de paiement arrivent bientôt », no button. Details come
   from the database (`get_premium_payment_details`), never from code.
3. **« Ma saison »** replaces « Mon abonnement » (Profil, Curva rows, hub): « Votre Saison 2026/27 est
   active · jusqu'au {date} », « Votre Saison est terminée » with the offer link. Cancel, restore,
   receipts, pay-update, renewal reminder and grace banners leave the member UI.
4. **Copy.** Every `plus.*` key listed in the audit rewritten to the Saison vocabulary, FR and AR, no
   banned word (abonnement, abonné, pass, premium, membre, débloquer, provisoire, mensuel,
   renouvellement). Unused keys removed so the i18n gate's W3 does not grow.
5. **Admin.** Lookup also takes a `BG-` code; the member panel gets the main action « Activer la
   Saison 2026/27 » (method chips Virement / CashPlus / Wafacash / Offert, reference required unless
   Offert, reason, computed end date); the free grant stays as « Offrir un accès »; grants show method,
   reference and amount; new card « Coordonnées de paiement » (form with `premium.grant`, read view
   with `premium.read`).

## Acceptance criteria
Functional
- Offer shows one card with the date from `validUntil`; the button leads to the pay step; signed out,
  it goes to sign-up first and returns.
- Pay step: copy buttons copy the RIB and the code; the WhatsApp link is `https://wa.me/<digits>?text=…`
  with the code in the text; unavailable details show the soon line and no button.
- Ma saison: active shows the end date; ended shows « terminée » and the offer link; legacy
  monthly/yearly/cancelling/grace read as « jusqu'au » with none of the old actions.
- `PlusRenewal` renders nothing for a season or grant.
- Admin: activation refuses an empty reference unless « Offert »; code lookup works; payment details
  save and read back.
- `tsc`, lint, `bun test src`, i18n gate (W3, W4 not up), manager-card copy test, plus CSS lint, prettier.
Visual (measured, not asserted)
- FR and AR at 390, FR at 1280: offer, pay, Ma saison active and ended, admin activation and payment
  details. No element overflowing the viewport, smallest text >= 12px, tap targets >= 44px, RTL mirrored.
