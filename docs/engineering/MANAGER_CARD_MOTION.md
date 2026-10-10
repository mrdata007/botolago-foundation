# Manager Card motion: tier-up ceremony, flip, rating badge, entrance

Status: **in progress on `claude/manager-card-motion`; draft pull request, not merged.**
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
