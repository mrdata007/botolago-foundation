# First visit: `/` is always Home, and the language chooser reads both languages equally — screen brief

Owner request, 2026-10-07: "go" on the critique plan
(`.impeccable/critique/2026-10-06T20-00-17Z__src-routes.md`, finding P1-4 "First
visit puts Fantasy before football and French before Arabic", and its open
question "Should `/` ever replace Home for a fan?"). Owner decision the same day:
**`/` always shows Home.** The landing page lives only at `/jouer`; Home's own
Fantasy card does the selling to new visitors.

Branch `claude/first-visit-home`, from `main` at `1c12b5b0`. Impeccable commands:
`layout` (what a newcomer reads first) and `adapt` (the chooser for an Arabic
phone). Written after inspecting the screens and before any interface change
(AGENTS.md, "Screen work", rule 3).

## Screens

1. **`/` on a first visit** (`src/routes/index.tsx`, `HomePage`): signed out,
   nothing stored on the device.
2. **The first-launch language chooser** (`src/components/shell/FirstLaunchLanguage.tsx`),
   which opens over whatever `/` shows.

`/jouer` (`src/routes/jouer.tsx`, `src/components/landing/LandingPage.tsx`) does
not change.

## What exists today (inspected and measured on `main`, 2026-10-07)

Local dev server on port 5304 against production data, read only; Chromium,
reduced motion, nothing stored for a first visit (no `botolago.language`, no
`botolago.welcomed`), Playwright `locale` `fr-MA` or `ar-MA` with a matching
`Accept-Language`.

- **The swap.** `HomePage` renders `LandingPage` in Home's place when the
  visitor is anonymous, has not been "welcomed" (`hasWelcomed()`, the
  `botolago.welcomed` key) and has not left it in this visit, once the splash and
  hydration are done. The page is a lazy chunk preloaded during the splash, with
  `LandingFallback` (the hero's dark ground, holding light status-bar icons) while
  it loads. The server always renders Home.
- **Measured at 390x844**: after the chooser, `/` is the landing page in both
  languages (`data-testid="landing-page"`, no bottom navigation, H1 "Vous
  connaissez la Botola. À vous de jouer.", page 5,926 px tall in French and
  6,535 px in Arabic). Opening `/` again in the same browser (language stored,
  never "welcomed") shows the landing page again: only leaving it by one of its
  links ends the swap.
- **A returning visitor** (welcomed, language stored) gets Home: the gameweek
  band, "À venir", then the Fantasy card. At 390x844 the card "Votre Fantasy ·
  Créer mon équipe" (link to `/fantasy/create`) starts at y = 901 in French and
  y = 1,018 in Arabic, about one short scroll below the first screen (the bottom
  nav covers y > 768); the bottom nav's "Fantasy" tab is on screen throughout.
- **Status bar (phone app), measured with a stand-in iPhone bridge**: first visit
  in the light theme sends `DARK` (light icons) once and holds it through the
  splash, the chooser and the landing page; a returning visitor gets `DARK` for
  the splash, then `LIGHT` (dark icons) for Home; `/jouer` holds `DARK`.
- **The chooser**: French is preselected in every case, also with `ar-MA`
  (`navigator.languages` = `["ar-MA"]`). The title is two steps apart: "Choisissez
  votre langue" is Changa 34/800 on two lines (85 px), "اختر لغتك" is a 14 px
  muted line in the body face (27 px), and it is the dialog's description rather
  than part of its title. One tab stop on the chosen tile, arrows move the
  choice, "Continuer" in the chosen tile's language, Arabic waits for its
  dictionary and offers a bilingual retry if it fails.
- **Other users of the welcome flag**: `markWelcomeDone()` is called by `/jouer`
  (leaving the landing page) and by the sign-in, registration, verification and
  two-step screens; `hasWelcomed()` is read only by the swap in `index.tsx`.
  `src/lib/system-bars.test.ts` and `src/lib/launch-sequence.test.ts` pin the swap
  and its fallback.
- Pre-existing and out of scope: every page load logs one React hydration
  mismatch, in a news card's text on Home (the news-dates lane owns it).

## What must be preserved

- Home exactly as a returning visitor sees it today: section order (pinned by
  `index.home-structure.test.ts`), the server-rendered content, the Fantasy card
  and its target, the bottom navigation.
- `/jouer` exactly as it is: the page, its button that adapts to the reader, its
  status-bar hold and strip, its analytics events.
- The welcome flag's writers (sign-in, registration, verification, two-step,
  `/jouer`): untouched, so nothing outside this lane changes behaviour.
- Status-bar handling: the splash and `/jouer` hold light icons over their dark
  tops; every other screen follows the theme. No screen at `/` may be left
  holding a band it no longer draws.
- The chooser's behaviour: a mandatory gate (no close control, no Escape, no
  outside dismissal), a radio group with one tab stop and arrow keys, "Continuer"
  in the chosen tile's language, the wait and bilingual retry for Arabic, and the
  gate closing only once the chosen language can be shown. Its look: kit overlay,
  sheet radius, tiles, selected pairing, gradient button.
- BotolaGO's identity and business logic: kit tokens and primitives only, no new
  colours or fonts, nothing about Fantasy rules, scoring or the gameweek
  lifecycle.

## Improvements being made

1. **`/` always shows Home.** Remove the first-visit swap from `HomePage`
   (`showLanding`, the `hasWelcomed()` check, the landing preload, `LandingFallback`
   and the state that only served them). `HomePage` renders Home. `/jouer` keeps
   the landing page. `hasWelcomed()` stays in `src/lib/welcome.ts` with its
   writers, documented as having no reader in the app now.
2. **The newcomer still finds the game.** No new section: Home's Fantasy card
   (to `/fantasy/create`, or the player list when entries are closed) and the
   bottom nav's Fantasy tab are verified on a first visit at 390 px in both
   languages.
3. **The chooser starts on the reader's language.** After hydration, the first
   of `navigator.languages` that BotolaGO speaks decides the preselected tile:
   any `ar` tag gives Arabic, any `fr` tag French; a list with neither starts on
   French as today. Nothing is stored and nothing changes language until
   "Continuer".
4. **One bilingual title.** "Choisissez votre langue" and "اختر لغتك" become the
   two lines of the dialog's title, on the same display step (Changa 22/800,
   `ui.display.section`, measured against the 34 px step at 320x568 and 390x844:
   both lines at 34 px take 151 px and leave the gate 33 px from the top of a
   320x568 screen; at 22 px the pair is 71 px at 390 wide, 98 px at 320 where
   the French wraps, and the tiles lead). Each line
   carries its own `lang` and `dir`, so the Arabic takes Changa's Arabic with
   its own leading (1.95) from `[lang="ar"]`, and neither line has
   letter-spacing.
5. **Docs that describe the old behaviour** are corrected: `PRODUCT.md`,
   `docs/engineering/LANDING_PAGE_2026_10_03.md`,
   `docs/product/PRODUCT_CONTEXT_2026-10-05.md`, and the comments in
   `src/routes/jouer.tsx` and `src/lib/analytics.ts` that say the landing page is
   also shown at `/`.

## Acceptance criteria (visual and functional)

Functional:

- A first visit to `/` (nothing stored), in French and in Arabic, shows the
  chooser over Home, then Home with its bottom navigation; no
  `data-testid="landing-page"` at `/`, on the first visit or after a reload.
- `/jouer` still renders the landing page, and leaving it still writes the
  welcome flag.
- With `locale: "ar-MA"` the Arabic tile is checked, holds the group's one tab
  stop and has focus when the gate opens, and the button reads "متابعة"; with
  `fr-MA` French is checked as before. Tapping the other tile, arrows and
  "Continuer" behave as before; choosing Arabic still waits for its dictionary.
- No component reads `navigator` in its first render (the gate renders nothing
  until hydration, and the read is guarded by it).
- Status bar with the stand-in bridge: a first visit in the light theme sends
  `DARK` for the splash, then `LIGHT` once Home is under the chooser; in the
  dark theme it stays `DARK`; `/jouer` still sends `DARK`.
- Tests: the swap's pins are replaced by pins of the new behaviour (Home only at
  `/`, no landing chunk or fallback in `index.tsx`, `/jouer` still the landing
  page and its hold), plus unit tests of the preselection and of the bilingual
  title's markup. Typecheck, lint and the full test suite pass.

Visual:

- Home on a first visit at 390x844 matches a returning visitor's Home, in French
  and Arabic (right to left), light; the Fantasy card is on the page and leads to
  `/fantasy/create`.
- The chooser at 390x844 and 1440x900, French and Arabic locales, light and dark:
  both title lines at 22 px in Changa, the Arabic at its 1.95 leading, no
  letter-spacing on either, centred; the gate no taller than before at 390x844
  and fully on screen at 320x568. No horizontal overflow at 320, 390 or 1440.
