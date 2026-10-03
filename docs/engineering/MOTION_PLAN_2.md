# Motion plan, round 2: fourteen more animations

Status: **in progress.** Follows `MOTION_PLAN.md` (all of round 1 is live) and
uses the same toolkit (`src/lib/motion.ts`, the utilities in `src/styles.css`)
and the same rules: reduced motion respected in CSS and in every JS-driven
effect, RTL-aware, `transform` and `opacity` only, the server render shows the
finished state, no new library, nothing that loops without a reason.

Built in three batches, one pull request each.

## Batch A: small touches (1 to 5)

1. **Follow and reminder buttons.** The check on "Suivre" and the bell on a
   match reminder pop when they switch on (never on first show).
2. **Prediction steppers.** The goal number rolls up or down when + or - is
   tapped, in the direction of the tap.
3. **Images fading in.** Photos and crests fade in once they have loaded. The
   server HTML and images already in the browser's cache are shown as they are,
   so nothing is hidden if scripts never run.
4. **Switching theme or language.** A soft cross-fade through the browser's
   view transition (skipped under reduced motion and where it is not supported).
5. **Toasts and sheets.** One shared "settle" easing with a slight overshoot
   for sheets opening and toasts arriving.

## Batch B: football moments (6 to 10)

6. **Deadline countdown.** Under an hour the clock breathes slowly; under a
   minute it ticks once a second.
7. **Full time.** A match that ends while its page is open settles: the final
   score and the "FT" pill pop once.
8. **Points arriving.** On the Fantasy points screen each player's points pop
   in one after another, row by row.
9. **Transfer in.** A player brought in on the transfers screen arrives with a
   soft pop. (Only the arrival is animated; a leaving player is simply replaced,
   because removal needs exit animation machinery the app does not have.)
10. **Chips.** Activating a chip sweeps a shine across it once.

## Batch C: first impressions and reading (11 to 14)

11. **Onboarding.** The welcome and team-creation steps slide in step by step,
    in the reading direction, with a progress bar that fills.
12. **Empty states.** The illustration eases in and settles once.
13. **Article reading.** A thin progress line at the top fills as you read, and
    the hero picture drifts a little as you scroll.
14. **Search.** Results fade in one after another and the letters you typed are
    highlighted (accents ignored).

## Out of scope

Anything that loops forever (floating icons), sound and vibration, and the
Pronostics design polish (parked, to be done separately).
