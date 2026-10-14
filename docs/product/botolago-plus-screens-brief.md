# BotolaGO+ screens: brief (lane D, paywall and screens)

Written before the first interface change, as `AGENTS.md` "Screen work" rule 3 asks. Branch
`claude/plus-screens`, from a clean `origin/main`. Owner approved the sketch on 2026-10-13
("I love it! we need to push it"). Design source: `docs/plans/botolago-plus-sketch.html` (read-only,
four screens). Rules and prices: `docs/plans/BOTOLAGO_PLUS_PLAN.md` and
`BOTOLAGO_PLUS_DELIVERY_PLAN.md` (lane D). Build path: straight in code (`.impeccable/config.json`).

Nothing here is reachable while `PREMIUM_BUILD = false` (`src/lib/feature-flags.ts`). No database
write, no deploy, no payment.

## What was inspected

- `src/routes/curva.tsx`: the route gate (`beforeLoad` redirect to `/fantasy` while Curva is not
  live) and the `curva.*` child routes that set `noindex` and the reader's title after mount.
- `src/components/curva/CurvaCardPage.tsx` (`/curva/carte`), `CurvaHome.tsx`, `HeadToHeadSheet.tsx`:
  the places a premium extra would be offered (editions, career detail, detailed duel).
- `src/routes/profile.tsx`: `Group` / `RowLink` / `RowInner` rows over `ui.surface.card`, a `Section`
  with `SectionHeader`, lazy sections (`DeleteAccountSection` loads its code only when needed).
- `src/components/manager-card/ManagerCard.tsx` and `to-profile.ts`: the card is drawn by the
  active renderer from a `CardProfile`; another lane is replacing that renderer, so this lane
  only passes a profile and a width and never edits `src/components/manager-card/**`.
- `src/i18n`: `fr` is the source dictionary, `ar` is loaded on demand, an i18n gate checks key
  parity and use; `fill()` (manager-card `interpolate.tsx`) fills `{placeholders}` with nodes and
  isolates numbers in Arabic.
- `src/assets/brand/wordmark-paths.ts`: the official BotolaGO wordmark as path data.
- `src/backend/manager-card` and `src/services/use-manager-card.ts`: the contract/repository/hook
  pattern the premium contracts mirror.

## What must be preserved

- Fantasy rules, scoring, the gameweek lifecycle, and every other business rule. Rating and tier
  never change with a style or a purchase (the reassurance line says so twice, as in the sketch).
- The brand identity, the existing Curva sections and their behaviour, the Manager Card component
  and its renderer (not edited), the Profil structure and its rows (the BotolaGO+ section is added,
  nothing moves or is removed), the route-gate pattern of `/curva`.
- With `PREMIUM_BUILD = false`: no new route resolves, no new entry point renders, no new request
  is made, and Profil, Curva and the bundle's reachable behaviour are as before.
- Owner rules: 20 MAD/month and 200 MAD/year (12 months from purchase, no automatic renewal for
  the year, saving 40 MAD against 12 monthly payments, computed not typed); BotolaGO+ is always
  the logo with the 3D mint "+", never typed on screen (plain text only in tab titles and
  `aria-label`s); no "just for fun", no prize mention, no AI-authorship notice; "Sans publicité" is
  a promise (the app has no ads today).

## Improvements (what is built)

1. The four-screen offer at `/curva/plus` (style picker, season and rivalry, paywall, welcome),
   ported from the sketch: same hierarchy, copy (FR and AR), tokens, and behaviour (screen 4 only
   after a purchase, swipe and arrow keys stop at screen 3, "Voir les prix" shortcut, reduced
   motion honoured).
2. Paywall in the plan-card layout: big logo, selected plan card with the "Le plus avantageux" chip
   and a check, "Voir toutes les offres" reveals the other plan, "Avantages de l'abonnement" as
   four cards, one "S'abonner" button, "Conditions de l'abonnement" and "Restaurer un achat" links.
3. `/plus`: the paywall on its own (screen 3), and a short membership summary for a member.
4. Profil, BotolaGO+ section: plan, renewal or end date, cancel (with its consequences), restore,
   receipts, all wired to a mocked `usePremium()` (`src/services/use-premium.ts`) over typed
   contracts in `src/backend/premium/` that `premium_status` and `get_my_premium` (lane B) will
   satisfy later.
5. Lock chips on the premium entry points in Curva (card editions, career detail, detailed duel),
   and a J-3 renewal reminder banner component.
6. The checkout button calls a stub that shows a "bientôt" toast. No payment exists in this lane.
7. The card on screens 1 and 4 is the existing `ManagerCard`, as it renders today. The edition is
   a prop on `PlusCard` (`edition`), and `data-edition` is on its wrapper: lane E plugs the real
   edition in there. Until then the style picker records the choice and announces it, and the card
   does not change.

## Acceptance criteria

Functional

- [ ] `PREMIUM_BUILD = false`: `/curva/plus` and `/plus` redirect before any loader runs; Profil and
      Curva show nothing new (checked in a build and with a test of the gate).
- [ ] Flag forced on in a dev run: all four screens reachable in the sketch's order; screen 4 only
      when the mock says the person is a member; the plan radio group is a real radio group
      (arrows, Home/End); "Voir toutes les offres" reveals the other plan; the terms open and name
      the dates computed from today; the yearly saving shows 40 MAD only because 12 x 20 - 200 = 40.
- [ ] Unit tests: price/date/saving maths, the counted-noun forms in Arabic, the contracts, the
      mock repository and `usePremium` states, the J-3 rule, the route gate.
- [ ] Lint, typecheck, build, the i18n gate and the touched areas' existing tests pass.

Visual (390x844 and 1280x900, French and Arabic/RTL, every screen and the expanded plans)

- [ ] Matches the sketch: deep-navy surface, mint primary button 52 px high, card as the hero,
      plan cards 22 px radius, benefit cards with 56 px mint icon tiles.
- [ ] The logo is the official wordmark with the 3D "+", never text; nothing reads "BotolaGO+" as
      typed text on screen.
- [ ] RTL with logical properties (no `left`/`right`, mirrored chevrons and progress); no
      letter-spacing on Arabic; Arabic scores never share one string; numbers isolated (`bdi`).
- [ ] No horizontal overflow (measured with `scrollWidth` and the visual viewport, not only
      `scrollWidth === clientWidth`); tap targets at least 44 px; visible focus ring on every
      control; `prefers-reduced-motion` stops the "+" tilt and the reveal.
- [ ] Text contrast at least 4.5:1 on its surface, read from rasterised pixels.

## Out of scope

Payments, the editions' artwork (lane E), real career and duel reads (lane C), the database
(lane B), legal texts (lane I), the store builds (lane G).
