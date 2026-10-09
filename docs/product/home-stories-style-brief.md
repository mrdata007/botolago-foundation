# Home stories style — 9 October 2026

## Expanded owner request — admin uploads

The owner requested an admin upload workflow and explicitly authorized pushing
the branch and opening a draft PR. Extend the existing implementation as follows:

- Preserve the current home row styling, page layout, game rules, theme/RTL
  support, and the existing staff/MFA and editorial permission model.
- Add `/admin/stories`: upload an image through the existing trusted News
  uploader, add French/Arabic labels and image descriptions, choose an optional
  in-app destination, set its order, save as a draft, and publish/unpublish.
- Store story records durably in the database; public reads expose only
  published records with validated media. Keep the current section shortcuts
  as the empty/unavailable fallback until stories are published.
- Default to an image viewer opened from the circles, with previous/next,
  close, and an optional destination link. No automatic playback or expiry.
- Verify actual upload request handling, unauthorized and insufficient-MFA
  access, draft visibility, publish permissions, invalid inputs, stale updates,
  viewer navigation and focus restoration. Capture mobile/desktop FR/AR admin
  and viewer states. Include a forward-only migration and deployment order in
  the draft PR; do not apply anything to production or deploy.

This scope expansion is committed before any further interface changes.

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
