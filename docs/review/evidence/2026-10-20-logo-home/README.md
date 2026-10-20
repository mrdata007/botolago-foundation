# Header logo home navigation

The TopBar and AuthShell logos now use a single router link to `/`, including
the responsive GO icon and the member logo branch. Accessible labels use the
current language's home label; focus rings match the surface and photo band.
The existing landing/admin header logos already link home.

Local Chromium checks passed all 12 combinations of French/Arabic, 320/390/1440
px and Matches/sign-in. Each link is at least 44×44 px, has no nested links,
and navigates to `/`. The 320 px cases use keyboard Enter; others use clicks.
Header controls stay within the viewport, and all page-error logs are empty.
Before/after screenshots cover both headers, languages and 390/1440 px.
Raw measurements are in `before.json` and `after.json`.

Existing header, account and Plus integration tests: 99 passed. TypeScript,
scoped ESLint, Prettier and diff checks passed. Tests used the isolated local
mock server on port 4187; no live accounts or database writes.

Included in the home refinement draft PR; no merge or deployment performed.
