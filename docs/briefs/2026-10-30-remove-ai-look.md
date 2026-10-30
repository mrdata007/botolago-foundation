# Remove the generic "AI-made" look (screen brief)

Owner-approved screen work. Branch `claude/botolago-remove-ai-look-5fhtrp`.
Scope: the screens that showed the generated object pictures
(`src/assets/illustrations/*.webp`), the Fantasy hub, the lower half of Home,
three pieces of copy, the locked Curva screen and the 404 button. Nothing under
`supabase/` and no database change.

## What must be preserved

- The brand: Floodlight Navy, Changa / Manrope / Noto Sans Arabic, the
  turf-to-sky action gradient, club colours through the club palette, the logo.
- Only kit tokens and primitives (`src/components/ui-kit`): no new colour,
  shadow or font.
- Every business rule: the Fantasy deadline and its countdown source
  (`useSecondCountdown`), who sees "Créer mon équipe" (signed out, no team,
  registration open, no draft on the device), the sign-in note, the draft
  resume card, the owner's checklist and its two buttons, the prize catalog and
  winners wall as the API returns them, the Curva lock's `next` return address
  and its two buttons.
- "Journée 14 · Date limite" stays one element (the e2e journey finds the hub
  by it).
- French and Arabic (right-to-left), light and dark, 44px tap targets,
  logical properties only.
- The asset files stay in the repository; only their use goes.

## Improvements

1. **No object pictures.** Every empty state, the 404 and error pages, the
   Fantasy intro, help and rules lose the generated picture. An empty state is
   a type-led block: a short Changa headline saying what is happening, one line
   of body text and, where there is somewhere to go, one button. On the prizes
   page a prize with no real product photo shows its value in the score style
   ("2 500 MAD") instead of a stock picture; the hero loses its cup.
2. **Fantasy hub.** The deadline is one scoreboard line ("37 h 59", the Changa
   score step) instead of three white countdown boxes. The shortcut tiles become
   one plain list. One rules link and one help link (the duplicate "Règles du
   jeu" under the intro goes). The feature list under "Comment ça marche" loses
   its gradient icon discs and becomes a plain short list.
3. **Home, lower half.** Fantasy alerts become player rows (club disc, name,
   status pill) instead of tinted boxes. The "Explorer BotolaGO" icon grid,
   which repeats the bottom menu, is removed.
4. **Copy.** "RISING" under Prospects scores is translated ("Indice" /
   "المؤشر"), share image included. A prize card whose description repeats
   "Comment gagner" keeps one. The "100 % gratuit" pill above the prizes
   headline goes; the body line says it.
5. **Locked Curva.** The real Manager Card front (the example card) as a
   teaser, with the sign-up and sign-in buttons, instead of a blurred page and a
   padlock box.
6. **404 / error buttons** are fully round, like every other button.

## Acceptance criteria

Visual:

- No `src/assets/illustrations/` import is left in `src/` outside the assets
  folder.
- Each touched screen captured before and after at 390px, in French and
  Arabic, light and dark; Arabic mirrors correctly.
- Every button on the touched screens is a full capsule.
- No new colour literal, shadow value or font.

Functional:

- The hub still counts down to the same deadline, and the owner still has the
  checklist with "Mon équipe" and the transfers button.
- Each empty state's button goes where it says.
- The Curva lock's buttons still carry `next`.
- `bun run typecheck`, `bun run lint` and `bun test` pass (apart from failures
  that exist on `main` before this branch), with tests that pinned the old
  pictures or layout updated and listed in the pull request.
