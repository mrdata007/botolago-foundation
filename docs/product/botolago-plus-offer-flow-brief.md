# BotolaGO+ offer flow — brief (lane 1: the non-member side)

Owner-approved screen work (2026-10-14: "organize it"). Scope: the offer a non-member meets, from
every entry point to the final button. The member side (Profil, renewal, card page, season data) and
the admin are other lanes and are not touched here. Everything stays behind the existing switches.

Evidence: four audits with screenshots (`onboarding-audit/A` and `D`), used as the "before".

## What must be preserved
- Business rules: 20 MAD per month, renewed each month; 200 MAD per year for 12 months, no renewal.
  Prices, dates and the saving stay computed (`plus-pricing.ts`), never typed.
- The night-stadium look (always-dark surface, mint call to action, the phone frame on wide screens).
- The product name is never typed on screen: the logo is used (`PlusLogo`). Spoken labels and the
  browser tab keep the plain name.
- French « vous », never « débloquer », bold text where it already is. Arabic is mirrored (RTL),
  Western digits.
- Step 4 (welcome) stays after a purchase. Nothing takes money: checkout is still a stub.
- Entry points, their lock chip and their « Découvrir » button; the example season stays under the blur.
- The build and database gates (`premium-gate`, `PREMIUM_BUILD`, `usePremium`).

## What changes (plan, lane 1)
1. **Two doors, one flow.** Every in-app entry (locks, home tile, duel, card rows) opens the short
   paywall: no progress bar, no way back to unseen steps, a visible headline that carries the context
   (season, duel, career, card styles, or the general one). A small « Voir l'aperçu » link opens the
   3-screen story (style, season, subscription); the story is reached from that link only.
2. **The step lives in the URL**, one history entry per step: the phone's Back button goes to the
   previous step; the close button leaves the offer entirely.
3. **Members never see sales screens.** `/plus` and `/curva/plus` show the member view
   (« Mon abonnement ») for a member; only `?step=4` after a purchase shows the welcome.
4. **Signed out:** « S'abonner » goes to sign-up first and comes back to the same screen. The
   « après votre inscription gratuite » note becomes a link to sign-up. No new entry for signed-out
   readers; the URL works.
5. **Before launch** (checkout not open): the button reads « Bientôt disponible », disabled, with one
   line under it. No toast.
6. **Style chips change the example card** (the card renderer already draws the four editions). The
   duel sheet entry returns to the open sheet when the offer is closed.
7. **Terms:** the « Remboursement : à confirmer » line is removed until it is known. Escape closes
   the terms before it closes the offer. On the standalone paywall the benefit rows are not buttons
   (no dead chevrons).
8. **Desktop (≥ 1024 px):** the paywall is wider, plans and benefits side by side.
9. **One vocabulary** (on these screens): abonnement; Mensuel / Annuel; Découvrir; S'abonner;
   Mon abonnement. No « pass », no plural « offres » for plans, no « membre » in public copy.
   Arabic: اشتراك, شهري / سنوي, اكتشف, اشترك.

## Acceptance criteria
Functional
- From each entry (season lock, duel lock, card rows, home tile → season lock) the paywall opens at
  `/curva/plus` (`?step=3`, with a context) in one tap; no progress bar, no back button.
- « Voir l'aperçu » → style → season → paywall; phone Back walks the same steps in reverse; Close
  from any step lands where the reader came from (not on an earlier step of the offer).
- A member on either route sees « Mon abonnement » and a link to Profil; never a price.
- Signed out: « S'abonner » (when checkout is open) leads to `/auth/register?next=<this screen>`.
  Checkout closed: the button is disabled and says « Bientôt disponible »; no toast.
- Choosing Holo / Électrique / Pixels / Chrome visibly changes the card on screen 1.
- Esc with the terms open closes the terms only.
- `?step=4` still shows the welcome to a member only.

Visual (measured at 390 and 1280, French and Arabic/RTL, signed out, signed in, member)
- No horizontal overflow (measured with `scrollWidth` on the offer container, not the page).
- The headline is visible and wraps without truncation in both languages; the button is never
  covered by content.
- At 1280 the paywall is about 60 rem wide with plans and benefits in two columns; at 390 unchanged.
- RTL mirrors layout; prices stay left-to-right units.

Checks run: `bun test` (plus, curva, routes, services, lib), `bun run typecheck`, `bun run lint`, the
plus CSS lint test, before/after screenshots.
