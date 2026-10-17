# Sweep fixes B: brief (written before any interface change)

Date: 2026-10-16. Branch: `work/sweep-fixes-b`, from `origin/main` at `7751b5fc`. Written under the owner's screen-work rule 3 (`AGENTS.md`, "Screen work"). Nothing here touches a database, an auth setting, a migration or Fantasy rules.

Source: the state sweep (defects D2 and D3, cases A8 and H5). Both were reproduced on this branch before any edit.

## Defect 1 (H5): 200% text size

**What I measured before changing anything.** Dev server, sample mode, `html { font-size: 200% }` (the sweep's emulation), element bounding boxes against the viewport (not `scrollWidth`, which `overflow-x: clip` hides). 390x844 and 320x568, French and Arabic:

- Bottom bar: the fifth tab (Curva) sits fully outside the screen at 390 (x 368 to 456 on a 390 screen). At 320 two tabs are outside (Curva and Matchs; in Arabic they are off the left edge). Cause: every tab carries the 44px tap floor as `min-width: 2.75rem`, which is 88px at 200%; five of them need 440px, the bar has 358px. The active pill is `w-14` (3.5rem, 112px at 200%), wider than its tab.
- Home, 390: 31 elements past the edge. Three sources: the match rows (a fixed `6.25rem` time column plus `pe-14` for the reminder bell leave the team column narrower than its own padding), the Table preview rows (five form chips of 36px each plus the points cell cannot fit next to the club name), and the bar.
- Prospects, 390: 18 elements past the edge, all in the percentile legend beside the wheel (the wheel is `size-33`, 264px at 200%, so the legend starts at x 328).
- At 100% nothing is past the edge on any of these screens (checked, same method).

**Preserve.**

- The look and layout at 100%, 130% and 150% (sweep: clean). Nothing may move at those sizes on a phone or on desktop.
- BottomNav's tap floor in height (44px), the sliding pill and its stretch animation, `aria-current`, `aria-label`, the label colour and weight cue, `--bottomnav-h` (term for term with the bar), the five tabs in the order they have today, RTL behaviour with no physical utilities.
- MatchCard content and order (time, teams, score, reminder bell), the stacked one-line-per-club layout; the Table preview's data (position, crest, name, form, points); the Prospects legend's figures and order. Brand colours, fonts, copy, Fantasy, scoring.

**Improvements.**

1. Bottom bar: the tab's width floor no longer scales with text size, so five tabs share the bar at any text size. The pill's width is capped to its tab, and the sliding pill takes the measured width of the icon it sits on. Labels keep `truncate`; every tab already has an `aria-label`.
2. Rows are given a narrow layout that switches on the width of their own box measured in `rem` (a container query), so it turns on when text is large and a phone is, in effect, a very small screen, and does not turn on at 100% on a 320px phone:
   - MatchCard (list rows): the time and round sit in a line above the two clubs.
   - Home Table preview: the form chips drop to a line under the club name.
   - Prospects legend: the wheel and the legend stack.
3. A thin guard test for the pure parts, and a Playwright measurement per screen at the sizes below.

**Acceptance criteria.**

- 390x844 and 320x568, French and Arabic, 200% text: the bar shows all five tabs with each tab's box inside the viewport (bounding boxes), each at least 44px high and not narrower than 44px; the active pill is inside its tab; no element on Home, Fantasy, Matchs, Prospects, Profil and Curva past the edge (bounding boxes, scroll containers excluded); the last content clears the bar.
- 1440x900 at 100% and 200%: no regression; the Table preview no longer overflows at 200% on Home.
- 100% and 130%/150%: the measured boxes of the bar, the match rows, the Table preview and the legend are unchanged from before (compared numerically, before and after).
- Existing tests for BottomNav, MatchCard, the standings, the Prospects pages and the touched e2e specs pass. `typecheck`, eslint, prettier pass.

## Defect 2 (A8): Google or Apple sign-in with the provider switched off in Supabase

**What I measured before changing anything.** Dev server in Supabase-auth mode against a stub origin, `/auth/v1/authorize` answered with the 400 that Supabase gives (`error_code: validation_failed`, `msg: Unsupported provider: provider is not enabled`): tapping either button navigates the whole page to the Supabase address and shows the raw JSON. The app's own `auth.error.provider_unavailable` text is never shown, and `auth.login.tsx` maps any failure to the generic text anyway.

**Can the redirect be stopped client-side?** Not after the browser has left: a top-level navigation to a URL that answers 400 shows that answer. What the app can do is ask first. `signInWithOAuth` with `skipBrowserRedirect: true` returns the URL without navigating; the app asks that URL with `fetch(..., { redirect: "manual" })`. A working provider answers with a redirect to the provider (an opaque redirect, readable without cross-origin permission); a switched-off provider answers a 400 that the app can read only if the Supabase gateway allows cross-origin reads. If it does not, the check cannot tell, and the app goes ahead as it does today. That limit is stated in the report; it could not be verified against the real project (no contact with production or staging was made). The check is not free of side effects: the auth server writes a sign-in state row on every `/authorize` call (never used, expires on its own), so a tap now makes two such calls instead of one.

**Preserve.** Auth configuration (not touched), `OAUTH_PROVIDERS_ENABLED` (stays `true`: switching providers off is the owner's call), the button look, the mock auth service, the callback's handling of codes, tokens and recovery links, the session and MFA flow, the redirect's `next` sanitising.

**Improvements.**

1. `SupabaseAuthService.signInWithOAuthProvider` checks the authorize address first and returns `provider_unavailable` (or `rate_limited`, `network`) instead of leaving the app. If the check cannot be read it navigates as before.
2. Login and register map the error code to the right existing text (`auth.error.provider_unavailable`, `auth.error.network`, `auth.error.rate_limited`) instead of always the generic one. The provider text is reworded to tell the visitor what to do (use e-mail), in French and Arabic.
3. `/auth/callback`: when the provider's return carries `error_code=provider_disabled` or `validation_failed` (or the description says the provider is not enabled), the page shows the same friendly text, not "link invalid or expired".

**Acceptance criteria.**

- With the stub answering the 400: on 390x844, 320 and 1440x900, French and Arabic, tapping Google and Apple keeps the visitor on the login page, shows the friendly text in the form-error slot (inside the viewport, RTL correct in Arabic), re-enables the buttons.
- With the stub answering a redirect (provider on): the visitor is still sent to that address.
- With the stub's 400 hidden from the app (no cross-origin permission): behaviour is as today (documented, not hidden).
- Unit tests: the check for each answer (redirect, 400 provider off, 429, 5xx, unreadable, offline), the callback classifier, the dictionary gate (`bun run` i18n gate) with both languages carrying every new or changed key. Arabic wording is marked "owner to confirm" on the review sheet convention used in `docs/review/`.
