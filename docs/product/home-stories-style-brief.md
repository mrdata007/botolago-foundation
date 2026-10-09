# Home stories style — 9 October 2026

The owner requested the circular stories style shown in the attached Premier
League screenshot. This change adapts its horizontal row of section highlights
to BotolaGO's existing Home screen.

## Preserve

- BotolaGO's navy, spring/sky accent, typography, light/dark themes and assets.
- The welcome screen, shell, deadline strip, matchday band, matches, Fantasy,
  news, club cards and standings, including their data and business rules.
- French and Arabic parity, the existing section routes and feature flags.

## Improvements

- Add a compact stories-style navigation row above Home's matchday content.
- Use circular existing images, an accent ring, a surface gap and bold labels.
- Link to Actualités, Fantasy, Matches, Classement, Pronostics and Pépites;
  optional sections follow their existing promotion/availability flags.
- Swipe on phones and use keyboard-accessible links at every width. These are
  section highlights, with no fabricated unread state or new publishing system.

## Acceptance criteria

- Before/after captures at 390px and 1440px in French and Arabic; after checks
  also cover 360px and dark mode. Inspect element bounds, not only scrollWidth.
- Circles retain their shape, labels remain readable, the row starts on the
  right in Arabic, and every item is reachable by scrolling and keyboard.
- Each highlight navigates to its existing section. Images load, controls meet
  the 44px target floor, and focus is visible in both themes.
- Relevant Home/UI-kit/i18n tests, typecheck, formatting and browser checks run.
- Open a draft PR with the brief and measured evidence; no merge or deployment.
