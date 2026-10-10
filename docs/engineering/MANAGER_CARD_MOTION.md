# Manager Card motion: tier-up ceremony, flip, rating badge, entrance

Status: **built on `claude/manager-card-motion`; draft pull request, not merged.**
Scope approved by the owner on 2026-10-10. Curva is switched off in
production (`MANAGER_CARD_ENABLED = false`), so none of this is visible to the
public until it is switched on. Check it locally with `VITE_MANAGER_CARD_PREVIEW=1`
and the `?mc=<fixture>` ids.

## Ground rules

The Éclat card (`src/components/manager-card/eclat/`) has strict, tested motion
rules (`eclat/beats.test.ts`, `layers.test.ts`, `holo.test.ts`, `tilt.test.ts`,
`eclat/README.md`):

- The number, serial, text and shirt never animate.
- Beats stay at or under 600 ms (`BEAT_CAP_MS`).
- Keyframes live only in the `prefers-reduced-motion: no-preference` block.
- `tilt.ts` owns the card's 3D tree.

This work **keeps every one of those rules and their tests unchanged**. New
motion is built around the card (DOM wrappers in `curva/` and `moments/`), not
inside its SVG. The only exception is an additive one: a new beat move, which
must still pass the existing beat tests (see 1).

No new library. CSS keyframes and the Web Animations API, `transform` and
`opacity` only, motion tokens from `src/styles.css`.

## What must be preserved

- The card's look and every existing beat, plus the tilt, foil and touch float.
- The moment logic: which hero shows, once per session, the deadline gate, and
  the acknowledgements.
- The 24–80px `CardToken`, which gets no new motion.
- Accessibility: the number stays the hit target, the card's accessible name is
  unchanged, and there is a visible focus ring.
- French and Arabic, including RTL; the server render shows the finished state.
- Reduced motion: no flips, bursts or swings. Content changes at once.

## Improvements

1. **Tier-up ceremony.** When a `tier_up` hero plays, a stadium-light burst
   opens behind the card in `HeroFrame`/`MomentHero`: a DOM layer outside the
   SVG, radial light beams, opacity and scale only. It grows with the tier
   (Stade < Pro < Champion; Legend keeps its prism and gets the strongest
   burst). It is timed with the existing `tier`/`legend` beat, and the burst
   may outlast the beat (about 1.2 s) because it is not part of the card.
   Optional, if the beat tests pass unchanged apart from additive entries: a
   light run along the rim as a new `TIMELINE` move within 600 ms.
2. **Card flip.** A "Retourner" / "اقلب" button on the card stage
   (`curva/CardStage.tsx`, `/curva` and `/curva/carte`) turns the card over to
   a back face. The back face is DOM, not SVG, and shows the four stats (CAP,
   SEL, TRF, CON), the season and the serial, in the card's colours.
   - The rotation is on a wrapper outside the tilt tree. The tilt is off while
     the card shows its back.
   - The button is `aria-pressed`. The hidden face is `inert` and
     `aria-hidden`.
   - Under reduced motion the faces swap at once.
3. **Rating change badge.** After a new round, a "+3 ▲" / "−2 ▼" chip pops next
   to the rating line under the card (DOM, `RatingLine`), in the
   positive/negative colours. It plays once per new round on this phone (the
   same once-per-phone storage pattern as the `tick` beat). It is still shown,
   with no pop, under reduced motion. It does not appear when there is no
   previous rating.
4. **Entrance on every visit.** Once per visit (session), when the rated card
   first appears on `/curva`, the stage swings in like a card drawn from a
   pack: a short rise, a slight 3D turn settling to flat, and the shadow
   growing. It uses Web Animations on a wrapper outside the tilt tree, at
   `--duration-hero` or a little longer. It is skipped while a hero is
   showing, when the card is already on screen from the server render (no
   flash), and under reduced motion.

## Acceptance criteria

- The existing Manager Card tests pass unchanged, except for additive beat
  entries if the optional rim run is built.
- Each feature is measured in a browser (local preview, mock fixtures:
  `tierUp`, `legend`, `rated`, `forming1`) at 390px and 1440px, in French and
  in Arabic: it plays, it ends in the rest state, and nothing moves under
  reduced motion.
- No layout shift: the card stage has the same box before and after.
- The flip is keyboard operable. Focus stays on the button, and the screen
  reader announces the face shown.
- Typecheck, lint, Prettier and the full `bun test` pass (known unrelated
  failure: `src/backend/news/editorial-session.test.ts`, GMT vs GMT+0).

## As built (deviations and decisions)

- **Rim-light run: not built.** The optional new `TIMELINE` move was left out; `beats.ts`,
  `eclat.css` and the beat tests are untouched. The burst alone carries the ceremony.
- **Tier-up burst** (`moments/TierBurst.tsx`, `burst.ts`, `tier-burst.css`): beams and a glow behind
  the hero's card, opacity and scale only, 1.2 s, starting with the `tier`/`legend` beat once the card
  is drawn. STADE 8 beams, PRO 10, CHAMPION 12, LEGEND 16 with its prism; peak opacity 0.45, 0.6,
  0.78, 1. The beam pattern mirrors left to right, so Arabic needs no flip.
- **Flip** (`curva/CardStage.tsx`, `CardBack.tsx`): `flippable` on the stage of `/curva` and
  `/curva/carte` only (not the guest stage, the hero or the replay sheet). The button is a 44 px round
  icon button hanging off the card's lower start corner (8 px past the card's edge, 12 px below it, so it covers no text on either face), not a text label: a text button under the card
  would have cost G1's first-screen budget (`FIT_HEIGHT_WIDTH`), and one beside the number would
  have covered the stats. Its accessible name is « Retourner la carte » / «اقلب البطاقة». The
  tilt and the touch float are switched off while the back shows (`tilt={false}` unmounts them,
  they mount again when the card is turned back). The back takes its colours from the renderer
  interface: `CardRenderer.palette(tier)`, implemented by Éclat (`eclat/palette.ts`, reading the foil
  ladder; one added line in `eclat/index.ts`) and the plain renderer, and read through
  `use-card-palette.ts` (a neutral graphite until the renderer chunk has loaded). The back is
  built from the front's parts (cut-cornered outline and rim, honeycomb, club disc, serif name,
  tier chip, bars, wordmark). Under reduced motion the faces swap by visibility, with no 3D context.
  The status region announces only the face (« Dos de la carte »); `aria-pressed` carries the
  button's state, and the long sentence that repeated it was dropped.
- **Rating change chip** (`curva/rating-change.ts`, `use-rating-change.ts`, `RatingLine`): the previous
  rating is the newest earlier row of the season's history that has a number; no earlier number, no
  chip. Shown on Curva' home and on the card page. The once-per-round memory is its own key,
  `botolago.card.rating_badge.v1` in `rating-change.ts`, not a `DEVICE_KEYS` entry, because
  `storage.test.ts` pins that list.
- **Entrance** (`curva/entrance.ts`, `use-stage-entrance.ts`): decided once when the stage mounts. The
  card is client-drawn (the server renders its box with a skeleton), so « present at first paint »
  is read as « the stage mounted before hydration finished ». It also waits for the launch gate
  (splash, language chooser): a stage that arrives under it keeps the visit's entrance for a later
  arrival. A hero that is due (`pickHero` with no deadline known) or already decided skips it and
  spends it. The ground shadow is a small extra element outside the card, since the card's own
  shadow lives inside the tilt tree. The tilt and float stay off until the entrance has landed.
- **Words** live in a `card_motion.` group (`manager-card/motion-copy.ts`), not in Appendix A, whose
  184-key count is pinned by `copy.test.ts`.
- **Test changes made on the orchestrator's decision** (additive, nothing loosened): `copy.test.ts`'s
  banned-word, no-counts and voice lints now also cover `card_motion.` keys, and a new test checks
  they stay out of the 184-key pin and are read by literal calls in `motion-copy.ts`.
- **Burst geometry.** The layer is centred with `left/top 50%` and `translate`, at most the window
  wide, and clips its own beams; measured centre offset 0 px at 320, 390 and 1440, LTR and RTL.
- **Rating chip memory** is one key per account: `botolago.card.rating_badge.v1.<user id or local>`.
