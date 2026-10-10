# WP3 · Gradins screens: evidence

Branch `claude/manager-card-section-wp3`, from the section branch (merged three times: the WP1 loader fix,
WP1 final, then WP4 and WP6a, head `be98884b`). Plan sections 8.5, 4.0 to 4.9, 2 and 5.4. Every number
below was measured in this worktree on its own dev server (port 4183, mock data modes), with the real
Écharpe card and WP4's real heroes, lines and sheets. Nothing here touched a database.

## What is built (`src/components/gradins/`)

| Screen                     | Files                                                                                                                                                                                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 home `/gradins`         | `GradinsHome` (`GradinsHomeView` is the state-driven, testable half), `CardStage`, `IdentityLine`, `PeopleBlock`, `ClubBlock`, `SeasonsBlock`, `ThisRoundBlock`, `StatTiles`, `GuestHero`, `NoTeamHero`, `GuestPoints`, `ClubTryOn`, `StateBlocks`                                                         |
| G2 « Votre carte »         | `GradinsCardPage`, `TierLadder`, `FounderBlock`, `RevoirList`                                                                                                                                                                                                                                              |
| G3 « Les vôtres » and G4   | `GradinsPeoplePage`, `LeagueRows`, `LeagueBand`, `HeadToHeadSheet`, `h2h.ts`, `people.ts`                                                                                                                                                                                                                  |
| G6 « Vos saisons »         | `GradinsSeasonsPage`, `SeasonRack`, `Sparkline`, `HistoryTable`, `season-profile.ts`, `sparkline-math.ts`, `use-all-history.ts`                                                                                                                                                                            |
| Pure logic and hooks       | `gradins-state.ts` (which G1 state; « Cette journée »), `replay-items.ts`, `club-resolve.ts`, `use-gradins-screen.ts`, `use-gradins-people.ts`, `use-club-block.ts`, `use-stage-beat.ts`, `use-launch-gate.ts`, `use-replay-beat.ts`, `use-private-leagues.ts`, `use-season-label.ts`, `use-view-event.ts` |
| Tests (9 files, 105 tests) | `gradins-state`, `people`, `replay-items`, `club-resolve`, `sparkline`, `head-to-head`, `gradins.render` (server renders of every G1 state and G3), `gradins.blocks.render`, `gradins.source` (what the files may import and say)                                                                          |

Nothing outside `src/components/gradins/` and this folder changed. The four WP1 route stubs keep their
imports (`GradinsHome`, `GradinsCardPage`, `GradinsPeoplePage`, `GradinsSeasonsPage`).

### How the page uses WP4 (the contract, as built)

- **Hero slot.** `<div data-hero-slot class="empty:hidden">` holds `<MomentHero>` and `<CardBornPanel>` with
  no children. While the slot is not empty, the stage's own card is hidden by CSS
  (`[data-hero-slot]:not(:empty) ~ … [data-stage-card]`), so the card is on the page once, and the stage
  keeps the rating line, the identity line and the share action.
- **State lines.** `<MomentLines card={card} />` under « Cette journée » writes the new-season sentence and the
  cleared label; `<MomentLines card kinds={["tier_down"]} />` sits in G2's tier card. Gradins writes neither
  sentence itself (`gradins.source.test.ts` fails if `m10.started` or `m8.downLine` appears in the folder).
- **Stage beat.** The one beat the stage asks for is `tick`, or `make` for a guest's first visit
  (`use-stage-beat.ts`). It waits for the moment gate's decision (the shared `["gameweek"]` read, then the
  store's answer) and plays only on a visible card; when a hero carries the card, the hero's beat stands
  for the stripe and the count is noted so it is not knitted again tomorrow. The probe flags any beat
  played on a card that is not drawn (it found this once: see « Found on the way »).
- **Counters** `k/n` are one `<bdi dir="ltr">` figure (« 1/3 » in both languages, never « 3/1 » in Arabic).

## How to reproduce

```
cd /home/user/mc-wp3
VITE_MANAGER_CARD_PREVIEW=1 VITE_MANAGER_CARD_DATA_MODE=mock VITE_AUTH_MODE=mock VITE_FANTASY_DATA_MODE=mock \
  VITE_FOOTBALL_DATA_MODE=mock VITE_PEPITES_DATA_MODE=mock bun run dev -- --host 127.0.0.1 --port 4183 --strictPort &
export BASE=http://127.0.0.1:4183
node docs/product/manager-card-section/wp3/capture.mjs --full --scale 1   # the pictures (about 25 minutes)
python3 docs/product/manager-card-section/wp3/shrink-pictures.py          # 256-colour PNGs, 40 MB to 11 MB
node docs/product/manager-card-section/wp3/probe.mjs [--langs fr,ar] [--widths 390,1440] [--only g1,g3]
node docs/product/manager-card-section/wp3/sticky.mjs
node docs/product/manager-card-section/wp3/repo-probe.mjs --kind layout|contrast --routes "…" --langs fr,ar --widths 390,1440 --theme light|dark [--visitor] [--all]
```

`harness.mjs` signs the mock account in through storage (no form), picks the language, theme and reduced
motion, and makes the few states the mock data cannot make on its own by rewriting the served mock module
in flight (`noLeague`, `alone`, and the arrival-forming card); the repository's files are untouched.
`states.mjs` lists the screens and states for both scripts. The repo's own `layout-probe.mjs` and
`contrast-probe.mjs` do not sign in or find this Chromium: `repo-probe.mjs` wraps them without editing them.

## Pictures

226 files in this folder: `<screen>-<fixture>-<fr|ar>-<light|dark>-<390|1440>.png`. The 390 pictures are
390 × 844 and the 1440 pictures 1440 × 900, both at one pixel per CSS pixel, the first screenful as the
reader sees it (the bottom bar is the screen's own; the orange « MODE DÉMO » tag is the development
build's). `…-390-full.png` is the whole page at 390 (a viewport as tall as the page), light, French and
Arabic. Pictures were taken with motion allowed and the card settled (3.5 s after load).

| Screen | State (file part)                                                                              | What it is                                                                                                            |
| ------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| G1     | `g1-guest`                                                                                     | Signed out: the base scarf, « Essayer les couleurs d'un club », « Créer mon équipe » and « Se connecter », the points |
| G1     | `g1-noteam`                                                                                    | Signed in with no team: the card in the manager's name waits for the team                                             |
| G1     | `g1-forming1`                                                                                  | One journée counted: « Carte en formation · 1/3 », the people, the club, the seasons                                  |
| G1     | `g1-rated`                                                                                     | Rated, provisional: WP4's first-rating hero above the stage                                                           |
| G1     | `g1-founder`                                                                                   | Founder 2026: the founder hero, the ·26 on the card                                                                   |
| G1     | `g1-seasonClosed`                                                                              | Season over: « Saison 2026/27 terminée : 86, CHAMPION »                                                               |
| G1     | `g1-seasonStarted`                                                                             | New season: last season's number labelled 2026/27, the new counter                                                    |
| G1     | `g1-offline`                                                                                   | The read failed: the error panel and « Réessayer »                                                                    |
| G1     | `g1-born0`, `born0Serial`, `forming1Arrival`, `launchArrival`, `returning`, `tierUp`, `legend` | WP4's heroes on this page (390 only, four language and theme pairings each)                                           |
| G2     | `g2-rated`, `ratedTrfNull`, `insufficient3`, `founder`, `tierDown`                             | The card, « D'où vient votre note », « Votre palier », the serial, « Revoir », share and « Voir ma ligue »            |
| G3     | `g3-rated`, `g3-noLeague`, `g3-alone`                                                          | The league with its band and table (own row marked), no league, a league with only the manager                        |
| G4     | `g4-rated`                                                                                     | The face-à-face sheet over G3                                                                                         |
| G6     | `g6-rated`, `g6-born0`, `g6-seasonStarted`                                                     | The rack, the season's line and table, « Revoir »; no counted journée yet; a new season                               |

## Measurements

| What (plan 9 item)                                                     | Command                                                                                                                                                                                                                          | Result                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tap size, row height, Arabic, motion, words, console (7, 10, 12 to 17) | `probe.mjs`, fr and ar at 390 and 1440, each screen once with motion and once reduced                                                                                                                                            | 54 + 54 screens at 390 and 40 + 40 at 1440: **0 findings**                                                                                                                                                                                                       |
| Layout: nothing past 390, nothing clipped or spilling (9)              | `repo-probe.mjs --kind layout`, 15 routes × 2 widths × 2 languages, light and dark, plus the signed-out route                                                                                                                    | 128 checks: scroll 0 · past 0 · clipW 0 · clipH 0 · spill 0 · starved 0 · decorative 0; 119 `clipH-fontbox` notes, all of them the kit's `h1` title (« Gradins », « Votre carte », « Les vôtres », « Vos saisons »), which the probe labels « neither a defect » |
| Contrast from rasterised pixels (11)                                   | `repo-probe.mjs --kind contrast --all`, same routes, light and dark                                                                                                                                                              | 128 pairs, 8,564 texts measured, **0 below AA**; 1,050 texts under another element are not judged; 80 sit on a gradient                                                                                                                                          |
| Reduced motion (13)                                                    | `probe.mjs`                                                                                                                                                                                                                      | `document.getAnimations()` empty after load on every screen; no « Revoir » beat button                                                                                                                                                                           |
| Number never held back (14)                                            | `probe.mjs` (a frame-by-frame watcher on every beat)                                                                                                                                                                             | tick, make, first, founder, tier, legend, castoff: at every frame opacity 1 and `elementFromPoint` at the number's centre is the number; no beat played on a card that is not drawn                                                                              |
| Arabic mirror (12)                                                     | `probe.mjs`                                                                                                                                                                                                                      | `html[dir=rtl]`, letter-spacing 0, no Western digit next to a Latin letter outside an isolate; back pill at the right; own-row bar on the right edge of its row (370 to 374 of 16 to 374 at 390; 16 to 20 in French); names in rows and the band weigh 800       |
| Desktop column sticks                                                  | `sticky.mjs`                                                                                                                                                                                                                     | G1 and G2, fr and ar, 1440 × 900: scrolled to the foot the column rests at 81 px (the top bar's height plus 16) inside the window; under a hero it starts lower and never moves down                                                                             |
| Unit and render tests                                                  | `bun test src/components/gradins`                                                                                                                                                                                                | 105 pass, 0 fail                                                                                                                                                                                                                                                 |
| Source rules of the screens                                            | `gradins.source.test.ts`                                                                                                                                                                                                         | no card direction imported, nothing outside the section imports these files, no logical-property violation, no uppercase or tracked label, no generic entrance, no colour literal, every `t("…")` key exists                                                     |
| Guard suites                                                           | `bun test src/components/ui-kit src/components/shell src/theme src/i18n src/lib/feature-flags.test.ts src/components/a11y-source.test.ts src/routes/nested-route-outlet.test.ts src/components/manager-card src/components/auth` | 1,253 pass, 0 fail (the shell's frame guard is why G1 and G2 clip the column through a class: see below)                                                                                                                                                         |
| Impeccable detector                                                    | `impeccable detect src/components/gradins`                                                                                                                                                                                       | no findings (the detector flags a planted side-tab, gradient text and purple gradient in a control file, so it does read `.tsx`)                                                                                                                                 |

## Found on the way (each fixed, then re-measured)

- **A stripe knitted unseen.** With a hero in the slot the stage's own card is hidden, yet its `tick` was
  decided in the window before the gate's decision and played on a card with no height. The probe's watcher
  now fails on any beat on an undrawn card; the stage waits for the gate and notes the count instead.
- **« 3/1 » in Arabic.** Counters written as two isolated figures with a slash between them read backwards
  in a right-to-left line. Each counter is one left-to-right figure now; `m5.row.forming` is filled the same
  way, as WP4 asked.
- **Uppercase kicker.** `UiHeader`'s kicker (« GRADINS ») is an uppercase label; the three sub-screens now
  carry the title and the back pill only.
- **A line with one point.** A season with one note drew a lonely hollow circle in an empty frame; the
  sentence and the table say it, so the line draws from two notes.
- **Rows 40 px, a crash on the lone-manager league, a tier label cut to « CHAMPI… »**: found by the probe
  and fixed before the pictures.

## G1's order, changed at the finish review (WP6b)

The plan's order (section 4.1) is stage, identity, « Cette journée », stat tiles, then people, club, seasons. This
package built belonging first (people, club, seasons, then « Cette journée » and the tiles) and did not record it.
It is recorded now as an owner-facing deviation in plan section 5.2 item 6. Because « Cette journée » then starts far
down the page, **one line under the identity line** (`RoundGlance.tsx`, `roundGlance` in `gradins-state.ts`) names the
next round and its deadline from the same read, and links to `/fantasy/team` like that block's button. Measured at
390 × 844, `forming1`, light, element rectangles (top edge, page coordinates):

| Block               | French, before the line | French, with the line | Arabic, before | Arabic, with the line |
| ------------------- | ----------------------- | --------------------- | -------------- | --------------------- |
| Identity line       | 566                     | 566                   | 594            | 594                   |
| The round line      | none                    | 586 to 630            | none           | 619 to 663            |
| Les vôtres          | 606                     | 650                   | 639            | 683                   |
| Votre club          | 887                     | 931                   | 963            | 1,007                 |
| Vos saisons         | 1,194                   | 1,238                 | 1,323          | 1,367                 |
| « Cette journée »   | 1,438                   | 1,482                 | 1,603          | 1,647                 |
| Ce que dit la carte | 1,674                   | 1,718                 | 1,874          | 1,918                 |

In the plan's own order « Cette journée » would start where « Les vôtres » starts now, about 606 px (French): the identity
line's bottom plus the 20 px block gap. That position is derived from the layout, not a picture of a
build in that order. The other numbers were measured on the page. The round line is 44 px, so everything below it moved
down by 44 px, and « Cette journée » is 876 px further down than the plan has it, which is what the line makes up for.
Pictures:
[before](g1-forming1-fr-light-390-full.png) and [after](../wp6b/after/g1-forming1-fr-light-390-full.png) (French),
[before](g1-forming1-ar-light-390-full.png) and [after](../wp6b/after/g1-forming1-ar-light-390-full.png) (Arabic).

## Deviations from the plan, and what other packages must do

- **Names in « Changa 800 » (item 12).** Names in rows and in the band are weight 800 in the language's body face
  (Manrope; Noto Sans Arabic), as Fantasy's standings table does; Changa is the display ramp.
- **`stickyBottomBar`.** Keeping G1's and G2's stage column sticky needs the frame's column clipped with
  `overflow: clip`, which the frame offers as `stickyBottomBar`. `src/components/shell/safe-area.test.ts` lists the
  two screens that may pass it, so the section passes the same two classes through the frame's `className`
  instead and leaves the shell alone. If the owner prefers the prop, the guard's list needs the two
  Gradins pages added (shell owner).
- **`MomentGate` has no « decided » flag.** The stage reads the store (`momentStore.get("gradins")`) and the same
  `["gameweek"]` query the gate waits for. A `decided` boolean on `MomentGate` would let `use-stage-beat.ts`
  drop both (WP4).
- **The card's own labels** (patch figures, knitted number) are the renderer's: the contrast probe measures the page's
  text, and the card's labels at the stage size belong to WP2's own captures.
- **Plural forms for 1, 2, 3, 5, 11 (item 12)** are WP1's copy accessors' (tested there); this folder uses them and never
  builds a plural.
- **The report flag** (the flag beside another manager's name) is painted 32 px with a 44 px hit area behind it
  (`ui.hitArea`), so the tap probe skips it by attribute; the row's name button is 44 px tall.
- **One failing test in the full `bun test`**: `src/backend/news/editorial-session.test.ts` (« Morocco's Ramadan clock
  change ») expects « GMT » where this machine's ICU writes « GMT+0 ». It fails the same way on the section
  branch's own checkout, so it is not caused by this work. All other 7,068 tests pass (17 skipped).

## Not measured

- Network behaviour and the data modes other than mock; the Supabase reads were not exercised (no database in
  this task).
- Screen-reader output beyond the accessible names asserted by the render tests.
- The share image and the replay sheets are WP4's; they are opened from these pages (G1, G2, G6) and appear in
  WP4's own index.
