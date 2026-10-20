# Signup and Curva regression evidence

Local development server from this checkout on `127.0.0.1:4186`, using explicit
mock Auth, Fantasy, Football, Pépites and Manager Card modes and the Curva
preview switch. Chromium: `/usr/bin/chromium`. No live accounts or shared
database writes.

## Before

Two independent agents traced signup and the missing Curva exit. Browser
screenshots show the old neutral token after choosing a club and the no-team
screen offering only Fantasy creation. Captures use a new verified mock
account with no Fantasy squad, in French and Arabic at 390 and 1440 px.

Files: `before-setup-{fr,ar}-{390,1440}.png` and
`before-curva-{fr,ar}-{390,1440}.png`. One initial browser context saw a
development dependency reload while missing dependencies were installed;
the final acceptance run starts after installation and checks diagnostics.

## After

`tests/e2e/signup-curva.e2e.ts` runs actual local mock registration, code
verification, profile setup, preferred-club selection, persistence and exit.
It checks Wydad/Raja gradient changes in the setup token, clearing the choice,
the saved club and selected ring in Curva, full-card recolouring on try-on,
reload restoring the saved favourite, and successful home navigation.

Files: `after-setup-{fr,ar}-{390,1440}.png` and
`after-curva-{fr,ar}-{390,1440}.png`. After screenshots wait for toasts to
disappear. Curva screenshots scroll the explicit completion action into view.
The browser tests measure control/heading/card rectangles and the home action's
44 px minimum target; they inspect console errors, failed requests and error
responses. Both languages also cover signup entered directly from Curva.

## Checks

- Six browser journeys passed (57.1 seconds), including direct Curva signup in
  both languages and the four language/viewport combinations above. All final
  browser console, request and response diagnostics are clean.
- Focused unit/render/i18n suite: 735 passed across 54 files.
- Renderer regressions cover shared token/full/share-art colour, neutral and
  hostile colours, light-club text contrast, tiers, ladder and paid editions.
  Contrast assertions use the actual hex paint values; the screenshots are
  visual evidence, not a claim of a measured raster contrast ratio.
- Curva exit render regressions cover open, closed, unavailable and loading
  team creation.
- TypeScript, changed-file ESLint, Prettier and `git diff --check` pass.

Run browser checks against the server above:

```sh
E2E_CURVA_PREVIEW=1 E2E_BASE_URL=http://127.0.0.1:4186 \
  E2E_CHROMIUM_PATH=/usr/bin/chromium \
  bunx playwright test tests/e2e/signup-curva.e2e.ts --workers=1
```

The app's mock-mode results verify the frontend journey. They do not certify
email delivery or production backend configuration. Changes await draft PR
review; no merge or deployment was performed.
