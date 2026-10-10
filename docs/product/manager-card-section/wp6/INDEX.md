# WP6a · Account path, Pépites back pill, deletion line: evidence

What the package changes for a reader and how it was measured. Plan section 8.8, M1c, section 4's deletion row and
section 3.4; the brief is [`BRIEF.md`](BRIEF.md). Nothing here touched a database, an Edge Function or a deployment:
every run used the mock modes (`VITE_MANAGER_CARD_PREVIEW=1 VITE_MANAGER_CARD_DATA_MODE=mock VITE_AUTH_MODE=mock
VITE_FANTASY_DATA_MODE=mock VITE_FOOTBALL_DATA_MODE=mock VITE_PEPITES_DATA_MODE=mock bun run dev -- --host 127.0.0.1
--port 4186 --strictPort`), with the real Écharpe card (`active-renderer.ts` on `echarpe-v2`).

## What it does

| Surface                              | Live only                                                                                                                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/auth/register`                     | A hint under « Nom complet » (`m1.register.hint`), between the field box and its reserved error line.                                                                                                            |
| `/auth/profile-setup` steps 1 and 2  | From the Fantasy builder (`next` is `/fantasy/create`): a slim 64 px row under the step bar (token + the name as typed); the nickname hint on the name field. Step 2's club list is shorter by the row's height. |
| the club hint and the token recolour | Only when the account's own card read already carries a club (owner decision 5). Otherwise the token keeps its own material and nothing promises a colour.                                                       |
| `/profile`, deletion dialog          | One line when a card exists: `state.deletion` with the serial as one unit, `state.deletion_noserial` while the card has no number.                                                                               |
| `/pepites`                           | A « Fantasy » back pill above « PÉPITES », in both title bands the home has (a published edition; last season's ranking before the first edition).                                                               |

Off, all five render as they did.

## Captures

Named `<scene>-<fr|ar>-<light|dark>-<390|1440>.png`; `after/` is this branch, `before/` the same scene before the
change (a subset: light theme, plus 1440 for French). Command for the set:
`node docs/product/manager-card-section/wp6/capture.mjs` (add `WP6_PROBE=1` for element measures, `WP6_CONTRAST=1` for
text contrast read from rasterised pixels, `WP6_OUT=<dir>` and `--tag` to keep a second set; `WP6_SELFTEST=1` proves the
overflow probe can fail). Fixtures: `rated` by default (the card has a club), `noCard` for an account with no card yet,
`born0` for a card with no number.

| Scene (`after/`)                     | What it shows                                                                          | Sizes · themes · languages       | Before                     |
| ------------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------- | -------------------------- |
| `register`                           | The hint under « Nom complet »                                                         | 390 · light, dark · fr, ar       | `before/register-*`        |
| `register-error`                     | The hint and the reserved error line after a failed submit (nothing moves)             | 390 · light · fr, ar             |                            |
| `setup-name`                         | Step 1, name typed, token beside it, nickname hint                                     | 390, 1440 · light, dark · fr, ar | `before/setup-name-*`      |
| `setup-name-arabic`                  | Step 1, an Arabic name typed                                                           | 390 · light · ar                 |                            |
| `setup-club`                         | Step 2, a club tapped, club resolved: token recoloured, club hint                      | 390, 1440 · light, dark · fr, ar | `before/setup-club-none-*` |
| `setup-club-none`                    | Step 2, resolved, no club tapped yet: token in its own material, club hint             | 390 · light · fr, ar             | `before/setup-club-none-*` |
| `setup-club-unresolved`              | Step 2 with no card (`mc=noCard`), a club tapped: token unchanged, no hint, no promise | 390 · light · fr, ar             |                            |
| `setup-no-next`                      | Profile setup not from the builder, live: nothing of the card                          | 390 · light · fr, ar             | `before/setup-name-*`      |
| `pepites`                            | The home with the « Fantasy » back pill                                                | 390, 1440 · light, dark · fr, ar | `before/pepites-*`         |
| `profile-delete`                     | The deletion dialog, card with a number                                                | 390 · light, dark · fr, ar       | `before/profile-delete-*`  |
| `profile-delete-noserial`, `-nocard` | The same with a card that has no number yet, and with no card (no line)                | 390 · light · fr, ar / fr        |                            |

## Measured

All from this branch's dev server with the preview on, over the 44 captures above (`WP6_PROBE=1`, `WP6_CONTRAST=1`).

- **Nothing escapes the viewport.** Element rectangles, not `scrollWidth` (`html, body { overflow-x: clip }` hides
  overflow): no visible box crosses a side of the viewport in any capture. The probe was checked to fail: with
  `WP6_SELFTEST=1` a 200 px box pushed past the right edge is reported in all four register captures. (A first version of
  the probe excused any box under a clipping `html`, and did not see that box in French; it stops at `<body>` now, and
  the 44 captures were measured again with the fixed probe.)
- **« Suivant » on step 2 stays above the fold.** Bottom edge at 390 × 844: French 780 (780 before the row; the new row and, when the club is resolved, its two-line hint are paid for by the
  shorter list), Arabic 777 with the two-line hint and 754 without
  (754 before). The row is 64 px tall (86 px in Arabic with the club hint), and the club list is 13 rem instead of
  18 rem to pay for it.
- **Tap targets.** The back pill is 108 × 44 (French) and 98 × 44 (Arabic). The package adds no other control.
- **Contrast, read from rasterised pixels** (the element's box is screenshotted, the backdrop is the commonest colour
  on its border, the text colour the furthest pixel that occurs at least three times): hints 7.43 (light) to 8.07
  (dark); the name beside the token 19.44 (light) and 15.89 (dark); the deletion line 15.82 / 14.33 (French), 15.92 /
  14.33 (Arabic); the back pill 10.35 to 11.48; every one in both languages at 390 and 1440 where the scene has both.
- **Arabic.** `dir="rtl"` on `<html>`; computed `letter-spacing` is `normal` on the register hint, the name hint, the
  row's name, the deletion line and the back pill; the token sits at the right, the back pill at the right with its
  arrow mirrored, the serial is one `<bdi dir="ltr">` that never breaks.
- **No console error and no failed or 4xx response** on any of the 44 captures.

## Switch off means identical

`off-identical.mjs` takes the DOM of each surface with the section off (`?mc=featureOff` answers the status read as
off, so `useManagerCardLive()` is false) from two trees and compares them:

```
node docs/product/manager-card-section/wp6/off-identical.mjs snapshot base.json   # tree A, port 4186
node docs/product/manager-card-section/wp6/off-identical.mjs snapshot after.json  # tree B, port 4186
node docs/product/manager-card-section/wp6/off-identical.mjs compare base.json after.json
```

Tree A is the section branch before this package (`80d1009f`), tree B this branch. 18 surfaces (register, register
after a failed submit, profile setup steps 1, 2 and 3 from the builder and step 1 without `next`, Pépites, Profile and
its open deletion dialog; French and Arabic): the `<body>` markup is identical on all 18 (script and style elements
removed, `data-tsd-source` stamps and React's generated ids normalised), with the same `localStorage` and
`sessionStorage` keys and the same console errors. The dev server requests differ only by module granularity (it serves
each source file; the base loads `manager-card-mode.ts`, the branch loads the small `fantasy-create-path.ts` that only
the profile-setup route imports). The built output does not have either difference in a page's own requests:

- **Built chunks** (`bun run build` of both trees at the section head `407c6d77` and this branch, static imports of every
  chunk compared with `chunk-graph-diff.ts`): the chunks of the five edited pages gain only `preload-helper` (profile, profile setup), which the
  entry chunk already loads; `auth.register` and `pepites.index` are unchanged; `fantasy-create-path` is folded into the
  profile-setup chunk (no separate file). The two card components are `gradins-card-setup-row-*.js` and
  `gradins-card-deletion-line-*.js`, reached only by dynamic `import()` from a live branch.
- **Bundler cut.** Once a lazily loaded card component uses the section's hooks, the bundler cuts shared library code
  differently, as WP1 saw: `ClientOnly` (293 bytes) and `fantasy-hub-share` (26 KB, out of the entry chunk, which is
  26 KB smaller than the base's) become their own files that the entry now imports; the same bytes load. Not a card module, and it
  happens for any package that makes a card component lazy and shares code with the entry.
- **Tests.** The existing tests of the five files pass unchanged (the full run is below), and
  `src/components/auth/manager-card-off-imports.test.ts` keeps the property: no static import of a card or Gradins
  module from those files (only `useManagerCardLive`), the two card components loaded with `lazy` from `live`
  branches, no section copy accessor read while off (the two hints are plain dictionary reads under `live`).

### The off-bundle gate

`bun run build && bun scripts/qa/manager-card-off-bundle-gate.ts` on this branch **fails with one line**:

```
to-profile-<hash>.js imports manager-card-<hash>.js, which holds the Manager Card's code
```

`to-profile` is not an ordinary page. It is the chunk the bundler cut for code shared between `gradins.index`, the
renderer chunk and `gradins-card-setup-row` (it is named after one of its modules), and every chunk that imports it
statically is the section's own. The gate recognises the section's chunks by name only (`gradins.*`, `gradins-*`), so a
shared section chunk with another name fails as soon as a lazily loaded card component and a Gradins page share code
that reaches the service. It will happen to every package that lazy-loads a card component. The gate file is WP1's
(then WP6b's), so it is not changed here. [`off-bundle-gate-section-chunks.patch`](off-bundle-gate-section-chunks.patch)
is the fix, ready for `git apply` from the repository root: a chunk whose static importers are all the section's chunks
is the section's chunk too (a fixed point over the import graph). Checked: with it, the gate passes on this branch (306
chunks) and on the section head (301 chunks); and a chunk that an ordinary page imports statically is still reported
(`profile` importing `to-profile` fails, both of them). The fixture gate passes (683 files, no fixture).

## Differences from the plan, and findings

- **The club colour is gated on the account's own card read, not on a flag.** The status read carries no club
  resolution flag and a new account has no card, so for the guest path from the builder the hint and the recolour stay
  off until the card read carries a club. If the status read gains a `clubResolution` field, the switch is one line in
  `gradins-card-setup-row.tsx` (`serverResolvesClub`). Decision 5 holds meanwhile: nothing promises a colour.
- **No eyebrow label and no motion on the row** (lab finish review): the name sits beside the token; « Votre carte » only
  fills the place of the name while none is typed. A recolour changes the token in place.
- **The register hint is shown whenever the section is live**, not only from the builder: it is true of every account
  (the name is the display name on the card and in the rankings). The card row on profile setup is shown only when
  `next` is `/fantasy/create`, as the plan says.
- **`PepitesParts.tsx` gained two optional props** (`backTo`, `backLabel`) so the home's second title band, last
  season's ranking before the first edition (the state every season starts in until its first edition), gets the same back pill. The
  plan named only `PepitesHome` and `PepitesShell`.
- **The hint under « Nom complet » has its own error line** (a copy of the kit's reserved line) because the kit puts a
  hint after the error line and drops it while there is an error, which would have moved the line.
- **The deletion line's chunk is started on page load** (a `warm` instance outside the dialog), so the line is in the
  dialog the moment it opens; with the switch off nothing of this renders.

## Checks

| Command                                                                                                                                                                          | Result                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `bun run typecheck`                                                                                                                                                              | pass                                                                                                                                 |
| `bun run lint`                                                                                                                                                                   | 0 errors, 31 warnings (none in this package's files)                                                                                 |
| `bunx prettier --check` on every touched file                                                                                                                                    | pass                                                                                                                                 |
| `bun test`                                                                                                                                                                       | 6828 pass, 1 fail: `editorial-session.test.ts` « Morocco's Ramadan clock change » fails identically on the section head, not touched |
| `bun test src/components/ui-kit src/components/shell src/theme src/i18n src/lib/feature-flags.test.ts src/components/a11y-source.test.ts src/routes/nested-route-outlet.test.ts` | 590 pass                                                                                                                             |
| `bun scripts/qa/i18n-gate.ts`                                                                                                                                                    | pass (counts at baseline)                                                                                                            |
| `bun run build`, `bun scripts/qa/manager-card-fixture-gate.ts`                                                                                                                   | pass                                                                                                                                 |
| `bun scripts/qa/manager-card-off-bundle-gate.ts`                                                                                                                                 | one line, above; passes with the patch                                                                                               |
