# WP4 · Moments and share: evidence

Branch `claude/manager-card-section-wp4`, from the section branch with WP1 final and the Écharpe renderer
active. Plan sections 8.6, 5.3, 5.4, 4.6, 4.7, 6.7, 7.6. Every number below was measured in this
worktree on its own dev server (port 4184), not read from a file.

## What is built (`src/components/manager-card/moments/`)

| File                                      | What                                                                                                                                                                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `moments.ts`                              | `pickHero`: launch gate, one hero per session, priority (born > first rating > founder > tier > season closed), coalescing (arrival, returning), the 60-minute deadline rule, the team page's narrower reading. `deriveReplayItems`, `stateLines`. |
| `moment-store.ts`                         | What the gate remembers for the page's life: one decided hero per surface and account, kept after it is acknowledged; the lines that carry a moment; blockers.                                                                                     |
| `use-moment-gate.ts`                      | `useMomentGate(surface, card)`, `useMomentBlock(active)`, `useSeenFor` (two seconds, half on screen). Reads the shared `["gameweek"]` query for the deadline; decides before paint.                                                                |
| `moment-text.tsx`                         | The sentences of the approved copy (heroes, born panel, lines, replay) with numbers isolated for Arabic; the events each moment counts.                                                                                                            |
| `HeroFrame.tsx`                           | The shared anatomy: label row and ×, the card, the lines, the buttons; the collapse (1fr to 0fr, 260 ms, none under reduced motion).                                                                                                               |
| `MomentHero.tsx`                          | The hero on Gradins' home (first rating fresh, arrival, coalesced; tier up; founder; season closed).                                                                                                                                               |
| `CardBornPanel.tsx`                       | M2: on `/fantasy/team` (card at 128 px beside the lines) and in Gradins' hero slot. Named and default export, for `React.lazy`.                                                                                                                    |
| `InviteFriends.tsx`                       | « Inviter des amis »: the existing league create-and-invite flow in a sheet (WhatsApp first).                                                                                                                                                      |
| `MomentLines.tsx`                         | The one-line states: cleared label (acknowledged on display), new season (a state while the card shows last season's number), a fall (`kinds={["tier_down"]}`, for the card page).                                                                 |
| `ReplaySheet.tsx`                         | The replay sheet: full card from the stored journée, its own beat after the sheet has settled, « À la J3 : 84. Aujourd'hui : 87. », close only.                                                                                                    |
| `ShareCardSheet.tsx`                      | G7: controlled sheet, WhatsApp first, the phone's share sheet, copy link, download where a file cannot be shared, gallery save in the phone app.                                                                                                   |
| `card-share-image.ts`, `share-message.ts` | The 1080 × 1920 picture (renderer `image()` art + text runs + wordmark, name, number and tier, serial, season, club disc with initials, no crest) and the four message variants with tagged links.                                                 |
| tests (8 files, 135 tests)                | `moments`, `moment-store`, `moment-text`, `moments-ack`, `moments-components`, `moments-copy` (banned words, both languages), `share-message`, `card-share-image.draw` (recording canvas in `card-share-image.test-support.ts`).                   |

## How a page uses them (for WP3, WP5, WP6)

- **Hero slot (WP3).** `<MomentHero surface="gradins" card profile onDetail onShare />` and
  `<CardBornPanel surface="gradins" card profile nextDeadline />` in the slot above the stage. Each draws
  nothing until a hero is due, and then carries the card itself (240 px, 264 from 768 px, with its beat);
  the page hides its own copy while the slot is not empty, as WP3's `[data-hero-slot]:not(:empty)` rule
  does. A page that prefers to keep its stage in the tree passes it as `children` (a node, or a function
  of the beat to play on it); the hero is then only the frame around it.
- **Gate.** `useMomentGate(surface, card)` returns `{ hero, lines, ack, acked, collapsed, ready }`. Every
  caller of a surface reads one decision. `hero.beat` is null once acknowledged. `ack(keys, { collapse:
false })` acknowledges without folding the hero away (two seconds in view does that); the default folds it.
- **Team page (WP5).** `React.lazy(() => import("@/components/manager-card/moments/CardBornPanel"))`
  (default export). `surface="team"` shows only the born panel. Nothing in `moments/**` is imported
  statically outside `manager-card/` and `gradins/` (a source test in `moments-components.test.tsx`
  scans for it; WP1's off-bundle gate passes on the production build: see Checks).
- **Import prompt (WP5).** `useMomentBlock(open)` keeps heroes and the born panel shut while
  `FantasyImportPrompt` is open; the step-up notice is read from sonner at decision time.
- **Lines (WP3).** `<MomentLines card={card} />` under « Cette journée » writes the cleared label and the
  new-season sentence (`m10.started`) itself, so the page must not write that sentence; on the card
  page `<MomentLines card={card} kinds={["tier_down"]} />`.
- **Sheets.** `ReplaySheet` and `ShareCardSheet` are controlled and render nothing while closed.
  `deriveReplayItems(card, rows)` in `moments.ts` lists only what happened (WP3 has its own in
  `replay-items.ts`; either feeds `ReplaySheet`).

## Captures

Made through a small host that stands in for Gradins' home while WP3's page is not merged
(`capture/GradinsHome.wp4-host.tsx`: the hero slot, the stage's rating line, the lines, a share and a
replay trigger). `capture/with-host.sh` copies it over `GradinsHome.tsx` for one run and puts the real file
back; nothing of it is committed to `src/`. The card is the real Écharpe.

```
cd /home/user/mc-wp4
VITE_MANAGER_CARD_PREVIEW=1 VITE_MANAGER_CARD_DATA_MODE=mock VITE_AUTH_MODE=mock VITE_FANTASY_DATA_MODE=mock \
  VITE_FOOTBALL_DATA_MODE=mock VITE_PEPITES_DATA_MODE=mock bun run dev -- --host 127.0.0.1 --port 4184 --strictPort &
docs/product/manager-card-section/wp4/capture/with-host.sh docs/product/manager-card-section/wp4/capture/capture-all.sh
docs/product/manager-card-section/wp4/capture/with-host.sh node docs/product/manager-card-section/wp4/capture/probe.mjs
docs/product/manager-card-section/wp4/capture/with-host.sh node docs/product/manager-card-section/wp4/capture/behaviour.mjs
```

The manager is the mock login (`demo@botolago.ma`); the cards are the section's fixtures (`?mc=`). Still
images are 390 × 844 at 1x (desktop 1440 × 900); the share pictures are the real 1080 × 1920 PNGs the
module draws (three are halved to 540 × 960 to keep the folder small).

| Files                                                                                                             | What                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hero-<fixture>-<fr\|ar>-<light\|dark>-390.png`                                                                   | G1's hero: `born0`, `born0Serial` (M2 new), `rated` (fresh), `launchArrival`, `returning` (coalesced), `tierUp`, `legend`, `founder`, `seasonClosed`. French light and Arabic dark for each; `rated`, `founder`, `tierUp`, `born0Serial` also French dark and Arabic light.                                                    |
| `hero-forming1Arrival-<fr-light\|ar-dark>-390.png`                                                                | M2 arrival-forming (`forming1` with `card_created` pending; the fixture is rewritten in flight by the capture, the repository's file is untouched).                                                                                                                                                                            |
| `hero-born0-team-fr-light-390.png`, `hero-born0Serial-team-<ar-dark\|fr-dark>-390.png`                            | The born panel as `/fantasy/team` hosts it (card at 128 px beside the lines).                                                                                                                                                                                                                                                  |
| `hero-cleared-<fr-light\|ar-dark>-390.png`, `hero-seasonStarted-fr-light-390.png`                                 | The one-line states, with the page around them (no hero).                                                                                                                                                                                                                                                                      |
| `hero-rated-fr-light-1440.png`, `hero-born0Serial-team-fr-light-1440.png`                                         | Desktop, 672 px column.                                                                                                                                                                                                                                                                                                        |
| `hero-rated-reduced-fr-light-390.png`                                                                             | Reduced motion: the hero shows with the finished card.                                                                                                                                                                                                                                                                         |
| `share-<rated\|founder>-<...>-390.png`                                                                            | The share sheet (French light, Arabic dark, founder French dark).                                                                                                                                                                                                                                                              |
| `share-picture-<rated-fr\|rated-ar\|founder-fr\|legend-ar\|arabicName-ar\|longNameLatin-fr\|cleared-fr>-1080.png` | The picture itself: provisional note present for `rated`, absent for `cleared`; Arabic mirrored; Arabic and 28-character names; LEGEND's wider card.                                                                                                                                                                           |
| `replay-<returning-fr-light\|returning-1-ar-dark\|founder-0-fr-dark\|seasonClosed-0-fr-light>-390.png`            | The replay sheet (first rating, first time at a tier, founder, closed season).                                                                                                                                                                                                                                                 |
| `frame-<fixture>-t<ms>-fr-light-390.png`                                                                          | Frozen frames of the beats, motion on, taken with the beat's animations held at `t` ms (`document.getAnimations()`, `currentTime`): `rated` 0, 120, 250, 400 (`first`); `founder` 0, 150, 300, 480 (`founder`); `born0Serial` 0, 150, 350, 600 (`make`); and t = 0 of `tierUp` (`tier`), `legend`, `seasonClosed` (`castoff`). |
| `probe-results.txt`, `behaviour-results.txt`                                                                      | The measurements below, as the scripts printed them.                                                                                                                                                                                                                                                                           |

## Measured

**The number is never held back.** At t = 0 of every beat (`make`, `first`, `tier`, `legend`, `founder`,
`castoff`) and at every later frame, the `data-mc="ovr"` group has opacity 1, `visibility: visible`, and
`elementFromPoint` at its centre returns it or a descendant. The frames show it: the 84, the dash on a
forming card, the name and the serial are on the card in frame 0; only the rows of the beat knit
(`rated` 2 animated groups, `founder` 8, `born0Serial` 20, `tierUp` 2, `legend` 2, `seasonClosed` 1).

**Probe** (`probe-results.txt`; element rectangles and pixel contrast, every hero fixture, French and
Arabic, light and dark, 390 and 1440, plus the born panel on the team page):

- every button and link of a hero is at least 44 × 44 (the × 44 × 44, the buttons 175 × 48 at 390, 140 × 48
  at 320, the full-width invite button 358 × 48);
- no element of a hero leaves the viewport, at 390, 1440 and 320 (by rectangle, not `scrollWidth`);
- every text of a hero reads at 6.9:1 or more (worst case: the muted lines of the born panel in light;
  buttons 10.2 and more; body 11.9), measured from the screenshot's pixels behind each text against its
  painted colour;
- the hero's label is an `h2`, and no heading holds a manager's name (tested for every fixture, both
  languages);
- with reduced motion, `document.getAnimations()` is empty after load, no beat class is on the card, and
  the hero still shows and acknowledges.
- One known artefact: in the 320 × 640 run, `returning` in dark reports a button at 1.01:1. The page is
  taller than the viewport, the full-page screenshot paints the fixed bottom bar over the button, and the
  probe reads the bar's pixels. The same page at 390 and the same button in light and in Arabic dark at
  320 read 10.2:1.

**Behaviour in the real page** (`behaviour-results.txt`, 26 checks, all passing): the × acknowledges a
coalesced hero's two keys in one call (`first_rating` and `provisional_cleared`) and an arrival's two
(`card_created`, `first_rating`) in one call, the device cache holds them, the hero folds and the card
stays; « Partager » acknowledges and opens the sheet; two seconds on screen acknowledges and the hero
stays open (nothing before two seconds); with the splash up no hero shows, nothing is acknowledged and no
session flag is set; a second visit in the same tab shows no hero; on the team page only the born panel
appears and its × acknowledges `card_created`; « Inviter des amis » opens the invite sheet; with reduced
motion nothing runs and the button still acknowledges.

## Checks, each run in this worktree

| Command                                                                                                          | Result                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run typecheck`                                                                                              | exit 0                                                                                                                                                                                                |
| `bunx eslint src/components/manager-card/moments docs/product/manager-card-section/wp4`                          | no error, no warning                                                                                                                                                                                  |
| `bun run lint`                                                                                                   | the only errors were formatting of `capture/probe.mjs`, fixed; the 31 warnings are in files this package does not touch                                                                               |
| `bunx prettier --check` on every touched file                                                                    | clean                                                                                                                                                                                                 |
| `bun test src/components/manager-card/moments`                                                                   | 135 pass, 0 fail                                                                                                                                                                                      |
| `bun test src/components/manager-card src/services src/backend/manager-card`                                     | 1164 pass before the last test file was added, 0 fail                                                                                                                                                 |
| the source-scanning guards of plan 8.2 (`ui-kit shell theme i18n feature-flags a11y-source nested-route-outlet`) | 588 pass; the 2 failures are the i18n gate's baseline test (below)                                                                                                                                    |
| `bun scripts/qa/i18n-gate.ts`                                                                                    | W4 back to its baseline; **W3 reads 251 against a committed 252**: `common.close`, unreferenced until now, is read by the hero's ×. The baseline in `scripts/qa/i18n-gate.ts` (WP1/WP6b) goes to 251. |
| `bun run build`, then `bun scripts/qa/manager-card-off-bundle-gate.ts`                                           | build exit 0; "the section's code is in gradins.index-….js, manager-card-….js and no ordinary page imports it"                                                                                        |
| `bun scripts/qa/manager-card-fixture-gate.ts`                                                                    | "675 files in .output, no fixture found"                                                                                                                                                              |

Not run: the Playwright e2e suites (WP6b), the Impeccable detector (WP6b), CPU-throttled timings of G1
(WP6b; the hero adds no data read: it reuses the card read and the shared `["gameweek"]` query).

## Where the plan was not followed, and why

1. **`ShareImageSheet` is not used as it is.** It owns its open state and its trigger button and puts
   the phone's share first; G7 needs a controlled sheet opened from three places and WhatsApp first.
   `ShareCardSheet` has the same behaviours (same helpers, same `pepites.share.*` words) in the plan's
   order. Nothing outside `moments/` was edited.
2. **The hero carries the card.** Plan 5.3's anatomy puts the card between the label row and the lines;
   WP3 hides its stage's copy while the slot is not empty (its own rule), so the hero draws the card.
   The optional `children` keeps the other reading available.
3. **Two seconds in view acknowledges but does not fold the hero.** The plan says the hero collapses after
   acknowledgement; folded after two seconds it would disappear while it is being read. The × and the
   buttons fold it.
4. **`m2.arrival`'s « ({k}/{n}) »** is filled as one isolated figure (`<bdi dir="ltr">1/3</bdi>`), by
   joining the two placeholders before filling; separate isolates would read « 3/2 » in Arabic. The
   same applies to `m3.recap` and `m5.row.forming` (WP3, WP5).
5. **The founder sentence** replaces the dictionary's literal « ·26 » by an isolated, computed mark
   (`·` and the cohort's last two digits), so Arabic keeps it after the name.
6. **The picture's provisional note** reads « Note provisoire · J7 » from the card's `throughGameweekSeq`
   (the latest evaluated journée), as `m6.image.provisional` has one `{gw}`.
7. **The replay's beat starts 340 ms after the sheet opens**, when the sheet's own slide-in is over: one
   motion at a time.

## Open for the next pass

- The born hero on G1 is tall: at 390 × 844 the invitation and « Inviter des amis » are one short scroll
  below the fold (the card is 240 px, the serial, the two quiet lines and the invitation come after it).
- `tick` (a newly counted journée) is G1's: WP3's stage plays it; this package gives no hook for it.
- The 2 W3 baseline note above, and the share picture is only drawn in the browser (no server image).
