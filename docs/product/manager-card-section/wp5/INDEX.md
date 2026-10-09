# WP5: Fantasy inline and the Pépites tile

Branch `claude/manager-card-section-wp5`. The last source commit is `802c738f`; the commit that adds this
document and the pictures follows it. Package: plan section 8.7, with 3.4
(Pépites inside Fantasy), 5.1–5.3 and the approved onboarding plan (M1a–c, M2, M3a–f, M5).
Started from `claude/manager-card-section` at `0195b344`; the section branch was merged in three times
as the orchestrator announced it (the Écharpe switch, WP1, then WP4 and WP6a at `be98884b`). The section
has moved since, to `dd01d431` (WP3 merged): merging that into this branch is conflict-free
(`git merge-tree` reports no conflict), and it was not merged here because nobody asked for it.

The brief written before the first interface change is [`BRIEF.md`](BRIEF.md) (what must be preserved,
what improves, the acceptance criteria). Everything below is measured against it.

## The hard rule, and how it is proved

Every edit to an existing Fantasy file is gated on `useManagerCardLive()`. With it false, each edited
file renders exactly as before and its existing tests pass unchanged. Three proofs:

1. **Existing tests are unmodified.** `git diff --name-status be98884b..HEAD` lists no changed
   `*.test.*` file; the tests that cover the edited files (`FantasyGuestIntro.test.tsx`,
   `FantasyHubPersonal.test.tsx`, the route tests and the others) pass as they were. My tests are new files only
   (`inline-model.test.ts`, `inline.test.tsx`).
2. **A DOM and server-render comparison with the switch off** ([`off-compare-result.md`](off-compare-result.md),
   made by [`off-compare.mjs`](off-compare.mjs)): the base tree (`be98884b`, its own `node_modules`) and this
   branch, both with the build switch OFF, 24 scenarios (hub as visitor, manager and with the prize welcome;
   the builder's squad and name steps for a visitor and a signed-in account; the team page, its captain sheet
   and its substitution bar; transfers and their confirmation; rankings; points; a private and a public league
   page; French and Arabic where the text differs). **All 24 are identical** in the hydrated DOM, in the
   server's own markup, and in the focused element, storage keys, requests and console. No request is made to
   any `inline` module and no storage key appears. The base captured twice is byte-identical, so the harness has
   no noise of its own.
3. **The off bundle.** Every existing page imports only `useManagerCardLive` from the section statically;
   everything else is lazy and goes through one facade, `inline/gradins-inline.ts`, whose chunk carries the
   section's name. `bun run build` then `bun scripts/qa/manager-card-off-bundle-gate.ts` passes (result below), and
   a test in `inline.test.tsx` reads the thirteen edited files and fails if any of them imports the card
   statically.

Not reachable in the mock data modes (so proved by tests and by reading, not by a picture):
`FantasyImportPrompt` (it needs a cloud account with an empty cloud squad), the recap line
(`GameweekRecapCard` needs a finished round with a card that counts it) and the late signer's hub state (the
mock fixtures have no card whose season closed before a first number).

## What was built

New, in `src/components/manager-card/inline/`:

| File                                                | What it is                                                                                                                                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `inline-model.ts`                                   | Pure decisions: the hub block's head and line (forming, first counted, eve, over, insufficient, late, closed), the rankings figure, the recap's `k/n`, the next deadline, hint and first-transfer eligibility, the league's newly rated members. |
| `GuestIntroCardPoint.tsx`                           | M1a: the fifth « Comment jouer » point, the guest mini in the same 36 px gradient disc as the four steps. Silent without `minRated`.                                                                                                             |
| `CardSaveLine.tsx`                                  | M1b and M1c: the 64 px row above « Entrer l’effectif » (a visitor's unnamed token, a manager's own name and club), and the « Compte créé » status line after sign-up.                                                                            |
| `HubCardBlock.tsx`                                  | M3a, M3b: the hub block, 112 px minimum, 64 px token, counter or number, the next round, « Nouveau ». One link to `/gradins`. A skeleton while the card loads.                                                                                   |
| `RankCardToken.tsx`                                 | M3c: a 44 px token with `k/n` or `84 OVR` at the end of « Mon classement ».                                                                                                                                                                      |
| `RecapCardLine.tsx`                                 | M3d: « Journée comptée pour votre carte : 2/3 » under the recap total, `{k}/{n}` as one left-to-right run.                                                                                                                                       |
| `CardHint.tsx`, `hint-once.ts`                      | M3e: CAP, SEL and TRF hints, an info alert, dismissible, once per phone (the device key is written when the hint is claimed; blocked storage counts as seen), only while the card has no number.                                                 |
| `FirstTransferLine.tsx`                             | M3f: « TRF mesurera ce transfert après 3 journées terminées » on the transfer confirmation while TRF has no transfer.                                                                                                                            |
| `LeagueCardBand.tsx`, `LeagueRowMini.tsx`           | M5: the band (a rail with up to three 24 px minis and the names of whoever was just rated), the plain « Comparer les cartes de la ligue » link, and a 28 px mini in each name cell.                                                              |
| `PepitesHubTile.tsx`                                | 3.4: a plain link to `/pepites` under the four shortcuts.                                                                                                                                                                                        |
| `TeamBornSlot.tsx`, `MomentBlock.tsx`               | M2: the slot in which WP4's `CardBornPanel surface="team"` sits on the team page, and the moment block the import prompt shows while it is open.                                                                                                 |
| `gradins-inline.ts`                                 | The facade every lazy import of an existing page goes through (see the off-bundle rule above).                                                                                                                                                   |
| `inline-model.test.ts` (27), `inline.test.tsx` (40) | Both languages, every hub state, the banned words, no uppercase, no hex, no physical property, the lazy-import rule over the thirteen edited files, hint storage with working, blocked and server storage.                                       |

Edited, each gated on `useManagerCardLive()`: `FantasyGuestIntro.tsx`, `FantasyHubPersonal.tsx`,
`MyRankCard.tsx`, `GameweekRecapCard.tsx`, `FantasyImportPrompt.tsx`, `PlayerActionSheet.tsx`,
`fantasy.create.tsx`, `fantasy.index.tsx`, `fantasy.team.tsx`, `fantasy.transfers.tsx`,
`fantasy.leagues.$leagueId.tsx`, and (two additive optional props, see deviations)
`SquadBuilderScreen.tsx` and `TransferConfirmScreen.tsx`.

`track("fantasy_team_created")` on the import path is its own commit (`d614676b`), as the plan asks. It is
analytics only and not gated.

## Where each moment lands

| Moment     | Where                                                                                      | Gate                                                                   |
| ---------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| M1a        | `FantasyGuestIntro`, open state only (never the registration-closed intro)                 | `useManagerCardLive()` and the status's `minRated`                     |
| M1b        | `/fantasy/create`, name step, between the captain rows and the guest note                  | live; `autoFocus` off the team name while live                         |
| M1c (back) | `/fantasy/create`: a draft the new account adopted reopens on the name step                | live; focus goes to the save button, or to the name when it is missing |
| M2         | `/fantasy/team`, under the deadline strip, above the controls                              | live; WP4's panel decides whether it shows                             |
| M3a, M3b   | the hub, after « Préparer mon équipe » and the transfers row, before the three figures     | live; the block renders nothing if the read gave nothing               |
| M3c        | « Mon classement »                                                                         | live and a card                                                        |
| M3d        | the gameweek recap                                                                         | live, no number yet, the round counted and evaluated                   |
| M3e        | the player sheet (CAP), the substitution bar (SEL), transfers (TRF)                        | live, a card with no number, once per phone                            |
| M3f        | the transfer confirmation                                                                  | live and TRF's reason is `no_transfers`                                |
| M5         | a private league's page                                                                    | live; the band shows only when someone was just rated                  |
| 3.4        | the hub, under the four shortcuts                                                          | live                                                                   |
| decision 6 | `FantasyImportPrompt`: the card is read fresh after an import; the moment block while open | live (the analytics event is not gated)                                |

## The lab's open points, solved in the real components

| Open point (review notes)                                                                                                                                                                                                                                                                               | What was done                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S05: the M2 panel and the pitch's first row                                                                                                                                                                                                                                                             | Measured on the real page (below). The panel is WP4's and is 419 px tall in French; the budget above the pitch's first row is about 300 px. It sits directly under the deadline strip so the controls and the pitch stay one unit. **WP4 must slim the team surface** or the pitch starts below the fold.                                                                                                             |
| Tall cards (Écharpe 193 px at 128 px wide, others taller)                                                                                                                                                                                                                                               | Every token is in an auto-width column sized by the renderer's own box, never a fixed width; the text column takes what is left. Nothing is clipped at 64 px.                                                                                                                                                                                                                                                         |
| S06: the hub block is 134 px (planned 120)                                                                                                                                                                                                                                                              | Measured on the real page at 390 px: **French 130 px forming, 134 px with « Nouveau », 114 px once rated; Arabic 161–165 px forming, 136–140 px rated.** The 112 px floor holds in every state. The forming sentence is three lines at that width (« Nouveau » starts the line row instead of taking a row of its own); Arabic wraps to one more line than French. Nothing is clipped.                                |
| S03: a tapped club recolours the token against decision 5                                                                                                                                                                                                                                               | Nothing in this package recolours a token in answer to a tap, and no copy of it says « couleur ». A visitor's token is the unnamed base object; a signed-in account without a team gets the club the account itself names (`favoriteClubId`, as the Gradins no-team hero does), and the line is not worded as a promise about it.                                                                                     |
| S03: no direction draws the name on its token                                                                                                                                                                                                                                                           | The real renderer (WP2) does draw the name on the full card: the 128 px card in the M2 panel reads « ALI ». At the 44 px of the save row a name would not be legible and the row does not pretend to show one; its sentence says what the card is and when its number arrives, not who it belongs to.                                                                                                                 |
| S03 step 2: the button falls below the fold                                                                                                                                                                                                                                                             | The row is 64 px with a 44 px token. At 390 × 844 « Entrer l’effectif » ends at about 586 px in French and 601 px in Arabic, and the visible area ends at about 763 px: it stays on the first screen (pictures `create-name-*`).                                                                                                                                                                                      |
| Register hint before UiInput's reserved error line                                                                                                                                                                                                                                                      | WP6a's file, not this package's.                                                                                                                                                                                                                                                                                                                                                                                      |
| Placeholders at 4.40:1 and 4.47:1 in light mode                                                                                                                                                                                                                                                         | Existing app issue, outside this package (reported).                                                                                                                                                                                                                                                                                                                                                                  |
| S10: the Arabic league page scrolls about 87 px                                                                                                                                                                                                                                                         | Measured on the real page (390 × 844): the band and its link add 68 px (French) and 77 px (Arabic) to the league page. « Quitter la ligue » was at the edge of the first screen in French (ending at 766 px of 768) and is now 66 px below it; in Arabic it was already below the fold (861 px against 762) and is now at 938 px. The page scrolled before this package in Arabic, and still does; nothing is hidden. |
| Lab finish lessons (orchestrator): no layout animation, guest fifth point in the same gradient disc, the league band as stands and rail with a plain muted compare line, the late signer's hub line first with `1/3 · 2026/27` beneath and no title or big counter, no uppercase letter-spaced eyebrows | Applied; each has a test in `inline.test.tsx`.                                                                                                                                                                                                                                                                                                                                                                        |

## M2: the panel and the pitch's first row (the lab's open point)

Measured on the real team page by [`m2-panel-measure.mjs`](m2-panel-measure.mjs) at 390 × 844, French and Arabic,
from element rectangles (the bottom navigation covers the last pixels of the viewport, so a row is visible when it
ends above the navigation's top edge). « forming » is the same page with no panel; « born » is WP4's real
`CardBornPanel surface="team"` in the slot this package gives it.

| language | card               | panel height | first row (goalkeeper) ends at | visible area ends at | short by   |
| -------- | ------------------ | ------------ | ------------------------------ | -------------------- | ---------- |
| FR       | forming (no panel) | none         | 449 px                         | 768 px               | 0 px       |
| FR       | born (panel)       | 419 px       | 892 px                         | 768 px               | **124 px** |
| AR       | forming (no panel) | none         | 509 px                         | 762 px               | 0 px       |
| AR       | born (panel)       | 406 px       | 939 px                         | 762 px               | **177 px** |

With the panel, the pitch itself starts at 788 px in French (821 px in Arabic), below the first screen; without it
the pitch starts at 345 px (390 px). The lab found the first row 8 px short in French and 19–51 px short in Arabic
with its own panel; WP4's real panel is taller (its card is 128 px beside three lines and an invite button), so
the shortfall on the real page is larger.

**What this package did:** the slot sits directly under the deadline strip and above the facts row and the
controls, so the controls and the pitch stay one unit below it, and it adds no wrapper of its own (the panel brings its
gutter). It passes the page's next deadline. Nothing here can make the first row visible: the panel is WP4's.

**What the numbers say, for the product call:** for the pitch's first row to stay on the first screen the team surface
of the panel has to be **about 295 px tall or less in French and about 229 px or less in Arabic** (419 − 124 and
406 − 177). Two ways: slim the team surface (a 96 px card beside the two lines, the invite as a link line, the title
folded into the first line), or accept that the pitch starts below the first screen while the panel is open (it stays until the ×
or the invite button acknowledges it, and two seconds with half of it on screen also count as seen).

## Pictures

Every picture is made by [`capture.mjs`](capture.mjs) against this worktree's development server (port 4185,
switch on, mock data modes), with `reducedMotion: "reduce"`. `before/` is the base screen at the same scroll
position (the switch off on the same tree renders the base, proved above); `after/` is this package.
`--measure` writes `after/capture-log.json`: for every surface of this package and everything inside it,
element rectangles (never `scrollWidth`), controls under 44 × 44, animations running, and contrast read from
rasterised pixels (the text colour painted on a canvas to get its sRGB value, the backdrop the modal colour of
the element's own screenshot; 4.5:1, or 3:1 for large text). Every picture was looked at.

What each picture was looked at for: that the object is whole and not clipped, the order of the rows, the mirror in
Arabic (token side, chevron, back pill, separators, the rail), Arabic digits and Latin names as left-to-right runs, no
letter-spaced or uppercase label of this package, light and dark, and that the page below the new element is
the page it was.

Which base screen each « before » is: the base hub for every hub state (`hub-owner-*`), the base builder for
`create-name-return` (it reopens on the squad, not the name step, which is what M1c changes), and the same
page for the others. `hint-sel`, `first-transfer-line` and `create-name-return` were taken with the switch off on
this tree (the off comparison above proves it renders the base).

#### hub-guest-intro

| variant                 | before                                                   | after                                                  | off-screen | targets < 44 | contrast (lowest, checked) | running animations |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------------ | ---------- | ------------ | -------------------------- | ------------------ |
| FR, light, 390 (rated)  | [before](before/hub-guest-intro-rated-fr-light-390.png)  | [after](after/hub-guest-intro-rated-fr-light-390.png)  | 0          | 0            | 7.42 (4)                   | 0                  |
| FR, dark, 390 (rated)   | [before](before/hub-guest-intro-rated-fr-dark-390.png)   | [after](after/hub-guest-intro-rated-fr-dark-390.png)   | 0          | 0            | 8.07 (4)                   | 0                  |
| AR, light, 390 (rated)  | [before](before/hub-guest-intro-rated-ar-light-390.png)  | [after](after/hub-guest-intro-rated-ar-light-390.png)  | 0          | 0            | 7.42 (4)                   | 0                  |
| AR, dark, 390 (rated)   | [before](before/hub-guest-intro-rated-ar-dark-390.png)   | [after](after/hub-guest-intro-rated-ar-dark-390.png)   | 0          | 0            | 8.07 (4)                   | 0                  |
| FR, light, 1440 (rated) | [before](before/hub-guest-intro-rated-fr-light-1440.png) | [after](after/hub-guest-intro-rated-fr-light-1440.png) | 0          | 0            | 7.41 (4)                   | 0                  |
| FR, dark, 1440 (rated)  | [before](before/hub-guest-intro-rated-fr-dark-1440.png)  | [after](after/hub-guest-intro-rated-fr-dark-1440.png)  | 0          | 0            | 8.07 (4)                   | 0                  |
| AR, light, 1440 (rated) | [before](before/hub-guest-intro-rated-ar-light-1440.png) | [after](after/hub-guest-intro-rated-ar-light-1440.png) | 0          | 0            | 7.41 (4)                   | 0                  |
| AR, dark, 1440 (rated)  | [before](before/hub-guest-intro-rated-ar-dark-1440.png)  | [after](after/hub-guest-intro-rated-ar-dark-1440.png)  | 0          | 0            | 8.07 (4)                   | 0                  |

#### hub-owner-forming

| variant                    | before                                                        | after                                                       | off-screen | targets < 44 | contrast (lowest, checked) | running animations |
| -------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- | ---------- | ------------ | -------------------------- | ------------------ |
| FR, light, 390 (forming1)  | [before](before/hub-owner-forming-forming1-fr-light-390.png)  | [after](after/hub-owner-forming-forming1-fr-light-390.png)  | 0          | 0            | 7.42 (4)                   | 0                  |
| FR, dark, 390 (forming1)   | [before](before/hub-owner-forming-forming1-fr-dark-390.png)   | [after](after/hub-owner-forming-forming1-fr-dark-390.png)   | 0          | 0            | 8.07 (4)                   | 0                  |
| AR, light, 390 (forming1)  | [before](before/hub-owner-forming-forming1-ar-light-390.png)  | [after](after/hub-owner-forming-forming1-ar-light-390.png)  | 0          | 0            | 7.42 (5)                   | 0                  |
| AR, dark, 390 (forming1)   | [before](before/hub-owner-forming-forming1-ar-dark-390.png)   | [after](after/hub-owner-forming-forming1-ar-dark-390.png)   | 0          | 0            | 8.07 (5)                   | 0                  |
| FR, light, 1440 (forming1) | [before](before/hub-owner-forming-forming1-fr-light-1440.png) | [after](after/hub-owner-forming-forming1-fr-light-1440.png) | 0          | 0            | 7.41 (4)                   | 0                  |
| FR, dark, 1440 (forming1)  | [before](before/hub-owner-forming-forming1-fr-dark-1440.png)  | [after](after/hub-owner-forming-forming1-fr-dark-1440.png)  | 0          | 0            | 8.07 (4)                   | 0                  |
| AR, light, 1440 (forming1) | [before](before/hub-owner-forming-forming1-ar-light-1440.png) | [after](after/hub-owner-forming-forming1-ar-light-1440.png) | 0          | 0            | 7.41 (5)                   | 0                  |
| AR, dark, 1440 (forming1)  | [before](before/hub-owner-forming-forming1-ar-dark-1440.png)  | [after](after/hub-owner-forming-forming1-ar-dark-1440.png)  | 0          | 0            | 8.07 (5)                   | 0                  |

#### hub-owner-rated

| variant                 | before                                                        | after                                                  | off-screen | targets < 44 | contrast (lowest, checked) | running animations |
| ----------------------- | ------------------------------------------------------------- | ------------------------------------------------------ | ---------- | ------------ | -------------------------- | ------------------ |
| FR, light, 390 (rated)  | [before](before/hub-owner-forming-forming1-fr-light-390.png)  | [after](after/hub-owner-rated-rated-fr-light-390.png)  | 0          | 0            | 7.42 (7)                   | 0                  |
| FR, dark, 390 (rated)   | [before](before/hub-owner-forming-forming1-fr-dark-390.png)   | [after](after/hub-owner-rated-rated-fr-dark-390.png)   | 0          | 0            | 8.07 (7)                   | 0                  |
| AR, light, 390 (rated)  | [before](before/hub-owner-forming-forming1-ar-light-390.png)  | [after](after/hub-owner-rated-rated-ar-light-390.png)  | 0          | 0            | 7.42 (8)                   | 0                  |
| AR, dark, 390 (rated)   | [before](before/hub-owner-forming-forming1-ar-dark-390.png)   | [after](after/hub-owner-rated-rated-ar-dark-390.png)   | 0          | 0            | 8.07 (8)                   | 0                  |
| FR, light, 1440 (rated) | [before](before/hub-owner-forming-forming1-fr-light-1440.png) | [after](after/hub-owner-rated-rated-fr-light-1440.png) | 0          | 0            | 7.4 (7)                    | 0                  |
| FR, dark, 1440 (rated)  | [before](before/hub-owner-forming-forming1-fr-dark-1440.png)  | [after](after/hub-owner-rated-rated-fr-dark-1440.png)  | 0          | 0            | 8.07 (7)                   | 0                  |
| AR, light, 1440 (rated) | [before](before/hub-owner-forming-forming1-ar-light-1440.png) | [after](after/hub-owner-rated-rated-ar-light-1440.png) | 0          | 0            | 7.41 (8)                   | 0                  |
| AR, dark, 1440 (rated)  | [before](before/hub-owner-forming-forming1-ar-dark-1440.png)  | [after](after/hub-owner-rated-rated-ar-dark-1440.png)  | 0          | 0            | 8.07 (8)                   | 0                  |

#### hub-owner-born

| variant                | before                                                       | after                                                | off-screen | targets < 44 | contrast (lowest, checked) | running animations |
| ---------------------- | ------------------------------------------------------------ | ---------------------------------------------------- | ---------- | ------------ | -------------------------- | ------------------ |
| FR, light, 390 (born0) | [before](before/hub-owner-forming-forming1-fr-light-390.png) | [after](after/hub-owner-born-born0-fr-light-390.png) | 0          | 0            | 7.42 (5)                   | 0                  |
| AR, light, 390 (born0) | [before](before/hub-owner-forming-forming1-ar-light-390.png) | [after](after/hub-owner-born-born0-ar-light-390.png) | 0          | 0            | 7.42 (6)                   | 0                  |

#### hub-owner-insufficient

| variant                        | before                                                       | after                                                                | off-screen | targets < 44 | contrast (lowest, checked) | running animations |
| ------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------- | ---------- | ------------ | -------------------------- | ------------------ |
| FR, light, 390 (insufficient3) | [before](before/hub-owner-forming-forming1-fr-light-390.png) | [after](after/hub-owner-insufficient-insufficient3-fr-light-390.png) | 0          | 0            | 7.42 (3)                   | 0                  |
| AR, light, 390 (insufficient3) | [before](before/hub-owner-forming-forming1-ar-light-390.png) | [after](after/hub-owner-insufficient-insufficient3-ar-light-390.png) | 0          | 0            | 7.42 (3)                   | 0                  |

#### hub-owner-seasonClosed

| variant                       | before                                                       | after                                                               | off-screen | targets < 44 | contrast (lowest, checked) | running animations |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- | ---------- | ------------ | -------------------------- | ------------------ |
| FR, light, 390 (seasonClosed) | [before](before/hub-owner-forming-forming1-fr-light-390.png) | [after](after/hub-owner-seasonClosed-seasonClosed-fr-light-390.png) | 0          | 0            | 7.42 (5)                   | 0                  |

#### hub-pepites-tile

| variant                 | before                                                    | after                                                   | off-screen | targets < 44 | contrast (lowest, checked) | running animations |
| ----------------------- | --------------------------------------------------------- | ------------------------------------------------------- | ---------- | ------------ | -------------------------- | ------------------ |
| FR, light, 390 (rated)  | [before](before/hub-pepites-tile-rated-fr-light-390.png)  | [after](after/hub-pepites-tile-rated-fr-light-390.png)  | 0          | 0            | 7.42 (4)                   | 0                  |
| FR, dark, 390 (rated)   | [before](before/hub-pepites-tile-rated-fr-dark-390.png)   | [after](after/hub-pepites-tile-rated-fr-dark-390.png)   | 0          | 0            | 8.07 (4)                   | 0                  |
| AR, light, 390 (rated)  | [before](before/hub-pepites-tile-rated-ar-light-390.png)  | [after](after/hub-pepites-tile-rated-ar-light-390.png)  | 0          | 0            | 7.42 (4)                   | 0                  |
| AR, dark, 390 (rated)   | [before](before/hub-pepites-tile-rated-ar-dark-390.png)   | [after](after/hub-pepites-tile-rated-ar-dark-390.png)   | 0          | 0            | 8.07 (4)                   | 0                  |
| FR, light, 1440 (rated) | [before](before/hub-pepites-tile-rated-fr-light-1440.png) | [after](after/hub-pepites-tile-rated-fr-light-1440.png) | 0          | 0            | 7.41 (4)                   | 0                  |
| FR, dark, 1440 (rated)  | [before](before/hub-pepites-tile-rated-fr-dark-1440.png)  | [after](after/hub-pepites-tile-rated-fr-dark-1440.png)  | 0          | 0            | 8.07 (4)                   | 0                  |
| AR, light, 1440 (rated) | [before](before/hub-pepites-tile-rated-ar-light-1440.png) | [after](after/hub-pepites-tile-rated-ar-light-1440.png) | 0          | 0            | 7.41 (4)                   | 0                  |
| AR, dark, 1440 (rated)  | [before](before/hub-pepites-tile-rated-ar-dark-1440.png)  | [after](after/hub-pepites-tile-rated-ar-dark-1440.png)  | 0          | 0            | 8.07 (4)                   | 0                  |

#### create-name-guest

| variant                | before                                                    | after                                                   | off-screen | targets < 44 | contrast (lowest, checked) | running animations |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------------- | ---------- | ------------ | -------------------------- | ------------------ |
| FR, light, 390 (rated) | [before](before/create-name-guest-rated-fr-light-390.png) | [after](after/create-name-guest-rated-fr-light-390.png) | 0          | 0            | 6.04 (1)                   | 0                  |
| AR, light, 390 (rated) | [before](before/create-name-guest-rated-ar-light-390.png) | [after](after/create-name-guest-rated-ar-light-390.png) | 0          | 0            | 6.04 (1)                   | 0                  |

#### create-name-signedin

| variant                | before                                                       | after                                                      | off-screen | targets < 44 | contrast (lowest, checked) | running animations |
| ---------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- | ---------- | ------------ | -------------------------- | ------------------ |
| FR, light, 390 (rated) | [before](before/create-name-signedin-rated-fr-light-390.png) | [after](after/create-name-signedin-rated-fr-light-390.png) | 0          | 0            | 6.04 (1)                   | 0                  |
| AR, light, 390 (rated) | [before](before/create-name-signedin-rated-ar-light-390.png) | [after](after/create-name-signedin-rated-ar-light-390.png) | 0          | 0            | 6.04 (1)                   | 0                  |

#### team-born

| variant                | before                                            | after                                           | off-screen | targets < 44 | contrast (lowest, checked) | running animations |
| ---------------------- | ------------------------------------------------- | ----------------------------------------------- | ---------- | ------------ | -------------------------- | ------------------ |
| FR, light, 390 (born0) | [before](before/team-born-born0-fr-light-390.png) | [after](after/team-born-born0-fr-light-390.png) | 0          | 0            | 7.42 (15)                  | 0                  |
| AR, light, 390 (born0) | [before](before/team-born-born0-ar-light-390.png) | [after](after/team-born-born0-ar-light-390.png) | 0          | 0            | 7.42 (16)                  | 0                  |

#### rankings-token

| variant                   | before                                                    | after                                                   | off-screen | targets < 44 | contrast (lowest, checked) | running animations |
| ------------------------- | --------------------------------------------------------- | ------------------------------------------------------- | ---------- | ------------ | -------------------------- | ------------------ |
| FR, light, 390 (forming1) | [before](before/rankings-token-forming1-fr-light-390.png) | [after](after/rankings-token-forming1-fr-light-390.png) | 0          | 0            | 18.1 (1)                   | 0                  |
| AR, light, 390 (forming1) | [before](before/rankings-token-forming1-ar-light-390.png) | [after](after/rankings-token-forming1-ar-light-390.png) | 0          | 0            | 18.1 (1)                   | 0                  |

#### rankings-token-rated

| variant                | before                                                    | after                                                      | off-screen | targets < 44 | contrast (lowest, checked) | running animations |
| ---------------------- | --------------------------------------------------------- | ---------------------------------------------------------- | ---------- | ------------ | -------------------------- | ------------------ |
| FR, light, 390 (rated) | [before](before/rankings-token-forming1-fr-light-390.png) | [after](after/rankings-token-rated-rated-fr-light-390.png) | 0          | 0            | 6.91 (2)                   | 0                  |

#### hint-cap

| variant                   | before                                              | after                                             | off-screen | targets < 44 | contrast (lowest, checked) | running animations |
| ------------------------- | --------------------------------------------------- | ------------------------------------------------- | ---------- | ------------ | -------------------------- | ------------------ |
| FR, light, 390 (forming1) | [before](before/hint-cap-forming1-fr-light-390.png) | [after](after/hint-cap-forming1-fr-light-390.png) | 0          | 0            | 5.59 (1)                   | 0                  |
| AR, light, 390 (forming1) | [before](before/hint-cap-forming1-ar-light-390.png) | [after](after/hint-cap-forming1-ar-light-390.png) | 0          | 0            | 5.59 (1)                   | 0                  |

#### hint-sel

| variant                   | before                                              | after                                             | off-screen | targets < 44 | contrast (lowest, checked) | running animations |
| ------------------------- | --------------------------------------------------- | ------------------------------------------------- | ---------- | ------------ | -------------------------- | ------------------ |
| FR, light, 390 (forming1) | [before](before/hint-sel-forming1-fr-light-390.png) | [after](after/hint-sel-forming1-fr-light-390.png) | 0          | 0            | 5.59 (1)                   | 0                  |

#### hint-trf

| variant                   | before                                              | after                                             | off-screen | targets < 44 | contrast (lowest, checked) | running animations |
| ------------------------- | --------------------------------------------------- | ------------------------------------------------- | ---------- | ------------ | -------------------------- | ------------------ |
| FR, light, 390 (forming1) | [before](before/hint-trf-forming1-fr-light-390.png) | [after](after/hint-trf-forming1-fr-light-390.png) | 0          | 0            | 5.59 (1)                   | 0                  |
| AR, light, 390 (forming1) | [before](before/hint-trf-forming1-ar-light-390.png) | [after](after/hint-trf-forming1-ar-light-390.png) | 0          | 0            | 5.59 (1)                   | 0                  |

#### first-transfer-line

| variant                        | before                                                              | after                                                             | off-screen | targets < 44 | contrast (lowest, checked) | running animations |
| ------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------- | ------------ | -------------------------- | ------------------ |
| FR, light, 390 (insufficient3) | [before](before/first-transfer-line-insufficient3-fr-light-390.png) | [after](after/first-transfer-line-insufficient3-fr-light-390.png) | 0          | 0            | 5.59 (1)                   | 0                  |
| AR, light, 390 (insufficient3) | [before](before/first-transfer-line-insufficient3-ar-light-390.png) | [after](after/first-transfer-line-insufficient3-ar-light-390.png) | 0          | 0            | 5.59 (1)                   | 0                  |

#### create-name-return

| variant                | before                                                       | after                                                    | off-screen | targets < 44 | contrast (lowest, checked) | running animations |
| ---------------------- | ------------------------------------------------------------ | -------------------------------------------------------- | ---------- | ------------ | -------------------------- | ------------------ |
| FR, light, 390 (rated) | [before](before/create-name-signedin-rated-fr-light-390.png) | [after](after/create-name-return-rated-fr-light-390.png) | 0          | 0            | 6.04 (2)                   | 0                  |
| AR, light, 390 (rated) | [before](before/create-name-signedin-rated-ar-light-390.png) | [after](after/create-name-return-rated-ar-light-390.png) | 0          | 0            | 6.04 (2)                   | 0                  |

#### league-band

| variant                 | before                                               | after                                              | off-screen | targets < 44 | contrast (lowest, checked) | running animations |
| ----------------------- | ---------------------------------------------------- | -------------------------------------------------- | ---------- | ------------ | -------------------------- | ------------------ |
| FR, light, 390 (rated)  | [before](before/league-band-rated-fr-light-390.png)  | [after](after/league-band-rated-fr-light-390.png)  | 0          | 0            | 6.92 (5)                   | 0                  |
| FR, dark, 390 (rated)   | [before](before/league-band-rated-fr-dark-390.png)   | [after](after/league-band-rated-fr-dark-390.png)   | 0          | 0            | 9.18 (5)                   | 0                  |
| AR, light, 390 (rated)  | [before](before/league-band-rated-ar-light-390.png)  | [after](after/league-band-rated-ar-light-390.png)  | 0          | 0            | 6.92 (6)                   | 0                  |
| AR, dark, 390 (rated)   | [before](before/league-band-rated-ar-dark-390.png)   | [after](after/league-band-rated-ar-dark-390.png)   | 0          | 0            | 9.18 (6)                   | 0                  |
| FR, light, 1440 (rated) | [before](before/league-band-rated-fr-light-1440.png) | [after](after/league-band-rated-fr-light-1440.png) | 0          | 0            | 6.92 (5)                   | 0                  |
| FR, dark, 1440 (rated)  | [before](before/league-band-rated-fr-dark-1440.png)  | [after](after/league-band-rated-fr-dark-1440.png)  | 0          | 0            | 9.18 (5)                   | 0                  |
| AR, light, 1440 (rated) | [before](before/league-band-rated-ar-light-1440.png) | [after](after/league-band-rated-ar-light-1440.png) | 0          | 0            | 6.92 (6)                   | 0                  |
| AR, dark, 1440 (rated)  | [before](before/league-band-rated-ar-dark-1440.png)  | [after](after/league-band-rated-ar-dark-1440.png)  | 0          | 0            | 9.18 (6)                   | 0                  |

## Checks (run in the worktree on the final tree)

| Command                                                                                                                                                                                                | Result                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run typecheck`                                                                                                                                                                                    | exit 0                                                                                                                                                                                                                                                   |
| `bun run lint`                                                                                                                                                                                         | exit 0: 0 errors, 31 warnings, none in a file this package touches (eslint over every touched file prints nothing). The warnings are the repository's existing fast-refresh ones, and `demo/`.                                                           |
| `bunx prettier --check` on every touched `.ts`, `.tsx`, `.md`, `.mjs` and `.json`                                                                                                                      | all pass                                                                                                                                                                                                                                                 |
| `bun test src scripts`                                                                                                                                                                                 | 6670 pass, 17 skip, **1 fail**: « Morocco's Ramadan clock change is followed » in `src/backend/news/editorial-session.test.ts` (expects `(GMT)`, this machine's ICU prints `(GMT+0)`). It fails on the base tree the same way and is not this package's. |
| `bun test src/components/manager-card/inline`                                                                                                                                                          | 67 pass (27 in `inline-model.test.ts`, 40 in `inline.test.tsx`)                                                                                                                                                                                          |
| `bun test src/components/ui-kit src/components/shell src/theme src/i18n src/lib/feature-flags.test.ts src/components/a11y-source.test.ts src/routes/nested-route-outlet.test.ts` (the plan 8.2 guards) | 590 pass, 0 fail                                                                                                                                                                                                                                         |
| `bun scripts/qa/i18n-gate.ts`                                                                                                                                                                          | `RESULT: pass` (no key added or changed by this package; the W3 baseline is untouched)                                                                                                                                                                   |
| `bun run build`, then `bun scripts/qa/manager-card-off-bundle-gate.ts`                                                                                                                                 | build exit 0; the gate passes: 310 chunks, the section's code is in its own chunks and no ordinary page imports it                                                                                                                                       |
| `bun scripts/qa/manager-card-fixture-gate.ts`                                                                                                                                                          | pass: 690 files in `.output`, no fixture found                                                                                                                                                                                                           |
| `git diff --name-status be98884b..HEAD`, filtered to `*.test.*`                                                                                                                                        | only additions: no existing test file is modified                                                                                                                                                                                                        |
| `node docs/product/manager-card-section/wp5/off-compare.mjs` (the base once; this branch twice, before and after its last source commits)                                                              | 24 scenarios × 3 kinds = 72 comparisons, all identical (see above)                                                                                                                                                                                       |
| `node docs/product/manager-card-section/wp5/capture.mjs --measure --out=…/after`                                                                                                                       | 63 pictures; in every one: 0 elements off-screen, 0 controls under 44 × 44, 0 failing contrast, 0 running animations (page-wide and inside the package's surfaces), no console error                                                                     |

Not run: the database tests (nothing here touches the database), and no database was written to. The working
dev server was this worktree's, on port 4185, stopped at the end.

## Known limits

- **The SEL hint** sits in the substitution bar, which already floats over the pitch; while it is shown it adds one
  alert's height to that overlay (about 66 px at 390 px) and covers part of the third and fourth rows. It is dismissible
  and shown once per phone; the pitch scrolls under it. The CAP and TRF hints sit above their controls and cover nothing.
- **The M2 panel** pushes the pitch below the first screen (measurements above); that is WP4's panel's height.
- **Arabic hub block:** four rows tall when forming (the approved sentence needs three lines in Arabic at 390 px).
- **The mock clock moves:** the mock deadlines are « now + a day », so the deadline minute differs by a minute from one
  picture to the next. Nothing else depends on it.
- **Not shown in a picture:** the late signer's hub line, the recap line and the import prompt's moment block (no mock
  fixture reaches them; they are covered by `inline.test.tsx` and `inline-model.test.ts`).
- **Dark theme** is shown for the hub and the league page only, as the brief asks; the other screens are light.

## Plan deviations

1. **Where the hub block sits.** The plan says « under the team card ». It sits after the two rows that
   act (« Préparer mon équipe » and the transfers row) and before the three figures, so the team card keeps
   its action beside it.
2. **The save row's token is 44 px, not 48.** The row is the plan's 64 px; with its padding a 48 px token
   would touch its edges. 44 px is also the tier ladder's size.
3. **Colour tokens.** The league band's rail uses `--ui-rule-strong`; the plan names `--ui-control-edge`,
   which is for controls and is not a rule.
4. **`fpl.close` instead of `common.close`** on the hints' dismiss: `common.close` is not referenced by the
   Fantasy screens today and using it moved the i18n gate's W3 baseline (251 against 252); `fpl.close` is
   the Fantasy screens' own close label, so the baseline is unchanged.
5. **Two additive optional props on files the plan does not list:** `SquadBuilderScreen` takes `aboveToggle`
   and `TransferConfirmScreen` takes `notice`. Both default to nothing and render nothing when absent; they
   are how the TRF hint and the first-transfer line reach screens that are components, not routes.
6. **The `gradins-inline` facade.** The plan names the individual files; the off-bundle gate lets only
   chunks named `gradins…` hold card code, so every lazy import of an existing page goes through
   `inline/gradins-inline.ts`.
7. **TRF's rounds.** The card read has no field for the number of rounds TRF waits for, so the line uses
   `card.minRated`, the same figure as the card's own forming line.
8. **`m3.late`'s next season** is inferred from the season label (« 2026/27 » to « 2027/28 ») by
   `nextSeasonLabel`; when the label is not in that shape the line is not shown. WP3 should share it.
9. **The hub's counter and tick beat** do not exist: the tokens never animate here (the lab's lesson), so
   there is nothing to hold a number back.
10. **A misplaced edit in the history:** the recap-card edit (M3d) sits in `53aeeb17`, the second Pépites
    commit, not in a commit of its own. Nothing was amended.
11. **`src/routes/README.md`** was reformatted by a formatter run in `e4405ccf`; `1a67dd7f` restores it.
12. **Trailers.** The commit trailers say « Claude Sonnet 5.5 » (the model that ran), where the orchestrator's
    text said « Opus 5.5 ».

## What other packages must do

- **WP4:** slim the team surface of `CardBornPanel` to about 300 px (measurements above), or accept that the
  pitch begins below the fold on the team page. `fill()` should isolate `{k}/{n}` as one run: written as two
  placeholders, Arabic reads « 3/2 » (`m2.arrival`, and `m5.row.forming` for WP3). This package merges the
  fraction into one `{kn}` value before it calls `fill`.
- **WP3:** share `nextSeasonLabel` and `hubCardModel` rather than redoing them; the G1 home and the hub block
  should say the same sentence for the same state.
- **WP1 and WP6b:** no i18n key was added or changed by this package; the W3 baseline is unchanged (251).
- **The orchestrator:** the section is at `dd01d431`; merging it here is clean. The Ramadan 2027 clock test
  (`src/backend/news/editorial-session.test.ts`) fails on the base tree too, not because of this branch. The
  product call on the M2 panel's height (above) is open.

## Reproducing

```sh
# the pictures and their measurements (a server on 4185 serving this worktree, switch on, mock modes)
cd /home/user/mc-wp5 && VITE_MANAGER_CARD_PREVIEW=1 VITE_MANAGER_CARD_DATA_MODE=mock VITE_AUTH_MODE=mock \
  VITE_FANTASY_DATA_MODE=mock VITE_FOOTBALL_DATA_MODE=mock VITE_PEPITES_DATA_MODE=mock \
  bun run dev -- --host 127.0.0.1 --port 4185 --strictPort
WAIT=7000 node docs/product/manager-card-section/wp5/capture.mjs --measure --out=$PWD/docs/product/manager-card-section/wp5/after
node docs/product/manager-card-section/wp5/m2-panel-measure.mjs
# the « before » pictures: the same server without VITE_MANAGER_CARD_PREVIEW
node docs/product/manager-card-section/wp5/capture.mjs --phase=before --out=$PWD/docs/product/manager-card-section/wp5/before
# the off comparison: once per tree (base worktree, then this one), switch off, then diff the two folders
node docs/product/manager-card-section/wp5/off-compare.mjs --out=/tmp/off-base
node docs/product/manager-card-section/wp5/off-compare.mjs --out=/tmp/off-branch && diff -r /tmp/off-base /tmp/off-branch
```

The server-render files differ by one line only, the `botolago-release` meta (the commit's own sha), which
`off-compare-result.md` leaves out of both sides.
