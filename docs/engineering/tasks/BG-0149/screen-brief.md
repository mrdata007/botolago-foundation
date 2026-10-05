# BG-0149 — Dark mode on, following the phone's setting

Owner decision, 2026-10-05: dark mode is switched on. The default choice stays
"Système", so anyone whose phone is set to dark sees BotolaGO dark at once, and
Profil > Apparence lets them pick Clair, Sombre or Système. Brand blue follows
recommendation (a), "two blues, two jobs": the logo blue `#0151fc` stays an
asset colour, the interface stays navy, and in dark mode the logo renders the
existing all-white files.

Scope: everything outside `src/components/pepites/**`, which the Pépites
restyle lane owns (BG-0152).

Inspected before any interface change: the theme machinery (`src/theme/*`,
`src/routes/__root.tsx` head script, `src/routes/profile.tsx` ThemeRow), the
logo and inline wordmark, the Toaster, every `ui.surface.inkPlain` call site,
the `--ui-ink` ring/dot/accent sites, the admin chart, the column shadow, the
theme switcher and the static error page; plus the light "before" screenshots
of 27 routes (fr/ar × 390/1440) taken from untouched `main` (a6fac90).

## What must be preserved

- **Light mode looks the same.** Every change here is either dark-only (a
  token redeclared under `.dark`) or swaps a light value for a token with the
  same light value (`--ui-ink-fg` = `--ui-ink` in light; `--ui-selected` =
  `--ui-ink` and `--ui-on-selected` = `--ui-on-ink-plain` in light;
  `--ui-wash-home` = `--brand-accent` in light). The one intended light
  difference is the Apparence row that now shows on /profile.
- **The brand.** The colour logo stays exactly as it is in light. In dark it is
  the existing approved all-white file, never a recoloured or new logo.
  Surfaces that are dark in both themes (AuthShell, landing hero, welcome)
  keep `tone="light"`.
- **No flash and no hydration error.** The theme is applied before first paint
  by the existing inline head script; React never manages the `<html>` class;
  the logo swap is pure CSS on the `.dark` class, so server rendering is
  identical in both themes and an explicit in-app choice beats the phone.
- **Business logic and copy.** No Fantasy rule, scoring, gameweek, routing,
  data or dictionary text changes. Pépites is not touched.
- **One rollback switch.** `DARK_MODE_ENABLED` keeps gating the head script,
  the provider effects and the Profile row, so setting it back to `false` and
  republishing restores today's behaviour.
- **Accessibility already in place.** Selection stays carried by
  `aria-pressed` / `aria-selected` / `aria-checked` / `aria-current`; the logo
  keeps a single accessible name; Arabic stays right-to-left.

## Improvements being made

1. Switch `DARK_MODE_ENABLED` on and record the owner decision in its comment.
2. Logo and inline wordmark: a new default `tone="auto"` that shows the colour
   file in light and the all-white file in dark, chosen in CSS through `.dark`.
3. Toasts follow the theme: Sonner gets `theme` from `useTheme()`, its own
   `--normal-*` variables point at kit tokens, and the legacy colour classes
   become kit tokens that actually apply over Sonner's unlayered CSS.
4. Fill colour no longer used as a foreground (rest of BG-0083/BG-0116): the
   link-button text and focus ring, the vice-captain rings, the admin selected
   row ring, the unread-notification dot and the checkbox accent move from
   `--ui-ink` to `--ui-ink-fg`; the admin chart moves off `--brand-*`.
5. A visible selected state in dark: new kit tokens `--ui-selected` /
   `--ui-on-selected` (`ui.surface.selected`) used by every selected, active
   or current control that painted `ui.surface.inkPlain` (chips, pill
   segments, top-bar active link, theme switcher, language chooser, matchday
   strip live match, fixture sort, help accordion, admin tabs).
6. The desktop column shadow gets a dark value (hairline ring plus a black
   drop) so the phone column keeps its edge on a dark page.
7. Theme switcher: 44px tall, one tab stop with arrow keys (mirrored in
   Arabic), like the first-launch language chooser.
8. The static "page didn't load" fallback follows the phone's theme.
9. Tests that pin the new behaviour (the dark-mode browser suite rewritten for
   "on"; source tests that stop fill-as-foreground and `--brand-primary`
   colours coming back outside the kit; a Toaster theme test), and the
   contrast probe able to measure the real dark path.

## Acceptance criteria (visual and functional)

Functional:

- Phone dark, nothing stored: `<html>` has `dark` at DOMContentLoaded and after
  load on `/`, `/profile`, `/fantasy`, `/matches`, with no React hydration error
  (#418/#423) in the console.
- Stored "dark" on a light phone gives dark; stored "light" on a dark phone
  gives light.
- Profile shows the Apparence radio group in French and Arabic. Choosing Sombre
  sets `html.dark` and `localStorage["botolago.theme"] = "dark"`, and survives
  a reload. With Système chosen, the phone switching to light removes the class
  without a reload.
- The switcher is one tab stop; arrow keys move and select (Left moves forward
  in Arabic); each segment is at least 44px tall.
- A toast's computed background, text and border colours are the kit surface,
  on-surface and rule colours, in both themes.
- Typecheck, lint (0 errors), unit tests and the rewritten browser suite pass.

Visual:

- Light "after" screenshots (fr/ar × 390/1440) match the light "before" set
  except for the Apparence row on /profile.
- Every dark screenshot reports `dark: true`.
- Measured from rasterised pixels in dark, fr and ar, 390 and 1440: no text
  pair under 4.5:1 and no UI pair under 3:1 outside Pépites on `/`, `/matches`,
  a match page, standings, clubs, news, an article, `/fantasy`,
  `/fantasy/players`, `/fantasy/rankings`, `/fantasy/fixtures`, `/pronostics`,
  `/prizes`, `/profile`, `/auth/login`, `/jouer` — or each remaining pair is
  listed with its location.
- In dark the logo is white everywhere it was blue, and appears once (no double
  logo, no layout shift).
- Selected chips, pills, the active nav link and the chosen theme are clearly
  distinguishable from unselected ones in dark.
