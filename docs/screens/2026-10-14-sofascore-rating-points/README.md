# Visual evidence: PR #459 (SofaScore) and PR #461 (rating points)

Taken 2026-10-14 for AGENTS.md "Screen work", rule 5. BEFORE is `origin/main`
at `e40938e7`. AFTER is `claude/fantasy-rating-points` at `5d0e888f`, which
holds PR #459's branch plus PR #461.

## Files

Each name is `<screen>-<lang>-<width>--<before|after>.png`. Every screen has
8 files: `fr` and `ar`, at 390 (390x844) and 1280 (1280x900), before and
after. That makes 88 PNGs and about 1.5 MB. They are rendered at 1x and
quantised to 256 colours. Tall pages are cropped to the changed region.

| Screen               | Route                          | What changed                                                                           | Region captured            |
| -------------------- | ------------------------------ | -------------------------------------------------------------------------------------- | -------------------------- |
| `rules-scoring`      | `/fantasy/rules`               | #461: the rating rule sentence, "until GW4", then the old table                        | scoring card, first 560 px |
| `points-provisional` | `/fantasy/points` (GW13)       | #459: provisional-points note (`fantasy.scoring.closedProvisional`)                    | viewport                   |
| `points-list`        | `/fantasy/points`, "Liste" tab | #461: event label `fantasy.points.event.rating` ("Note SofaScore" / "تقييم SofaScore") | viewport at the list       |
| `landing-step3`      | `/jouer`                       | #461: step 3 text and the three example rows                                           | step 3 item                |
| `landing-faq-points` | `/jouer`                       | #461: "Comment marque-t-on des points ?", opened                                       | that FAQ item              |
| `home-live`          | `/`                            | #459: live strip and match cards: `90+3′`, `45+′`, `120+′`, stage label                | viewport                   |
| `match-90plus3`      | `/matches/…0001`               | #459: score header pill `90+3′` (second half, minute 90, 3 added)                      | top 330 / 380 px           |
| `match-45plus`       | `/matches/…0002`               | #459: `45+′` (first half, minute 45, nothing added)                                    | top 330 / 380 px           |
| `match-120plus`      | `/matches/…0003`               | #459: `120+′` (extra time, minute 120)                                                 | top 330 / 380 px           |
| `match-stage-label`  | `/matches/…0004`               | #459: no minute, so the stage shows ("1re mi-temps" / "الشوط الأول")                   | top 330 / 380 px           |
| `match-compact-bar`  | `/matches/…0001`, scrolled     | #459: compact top bar pill `90+3′`                                                     | top 140 px                 |

The before images show the old state for the same data:

- the pills read `90′`, `45′`, `120′`, or just "EN DIRECT" / "مباشر" with no stage;
- the rules card has the category table with no rating sentence;
- the points list shows the raw key `fantasy.points.event.rating`, which does not exist on `main`;
- there is no provisional note;
- the landing page shows the old goal, assist and clean-sheet copy.

Not captured: **Fantasy onboarding step 2** (`fantasy.onboarding.step2_body`).
`src/components/fantasy/FantasyOnboarding.tsx` is not mounted by any route or
component, either on this branch or on `origin/main`. No screen in the app
shows it, so only its dictionary text changed.

## How the pages were served

- **Servers.** Two Vite dev servers ran in mock data mode, with no `.env`:
  - AFTER ran from this worktree on 127.0.0.1:4391;
  - BEFORE ran from a detached `origin/main` worktree in a scratch directory on 127.0.0.1:4392.

  Neither server was shared or reused. Each was confirmed to serve its own
  tree: the `botolago-release` meta tag read `5d0e888f…` and `e40938e7…`, and
  `/src/lib/live-minute.ts` answered 200 and 404 respectively.

- **Browser.** Chromium was `/opt/pw-browsers/chromium-1194`, driven by the
  repo's Playwright 1.61 library, with `reducedMotion: reduce`.
- **Data stubs.** These lived only in the test harness. A Vite plugin loaded
  through a scratch `--config` wrapper rewrote mock modules at transform time,
  identically for both trees. No product file was edited:
  - `fantasy-runtime.ts` mock `getRules()` also returns
    `ratingScoring: { fromGameweek: 5, noRatingPoints: 5 }`, as
    `api.fantasy_rules` does while the rule is on;
  - `mocks/fantasy-data.ts`: each GW13 starter has one `rating` event worth
    6–8. The results are provisional, and GW13 carries
    `authoritative.closedProvisional: true`;
  - `mocks/data.ts` and `backend/football/mock-repository.ts`: matches m1–m4
    are live as follows:

    | Match | Period        | Minute | Added |
    | ----- | ------------- | ------ | ----- |
    | m1    | `second_half` | 90     | 3     |
    | m2    | `first_half`  | 45     | –     |
    | m3    | `extra_time`  | 120    | –     |
    | m4    | `first_half`  | none   | –     |

- **Compact bar.** The mock match page is too short at 1280x900 to scroll the
  score header away. For `match-compact-bar`, the harness padded the bottom of
  the bar's container (inline style, both trees) before scrolling.

## Measurements (AFTER, all 44 screen x language x width combinations)

**Horizontal overflow.** This used the CLAUDE.md method. `scrollWidth` alone
misses overflow under `html, body { overflow-x: clip }`, so every visible box
was also checked against the viewport. Boxes inside an `overflow-x`
rail/carousel or a clipping ancestor were excluded, as were `aria-hidden` and
`inert` boxes.

| Check                                              | Result                                         |
| -------------------------------------------------- | ---------------------------------------------- |
| `documentElement.scrollWidth`                      | equal to `clientWidth` (390 / 1280) everywhere |
| Boxes past the viewport edge                       | **0** on every screen, FR and AR, 390 and 1280 |
| New text elements with `scrollWidth > clientWidth` | **0**                                          |

One AR note at 390 (`points-provisional`) has `scrollHeight` 51 against
`clientHeight` 49. That is Arabic glyph ink 2 px below the line box on a
paragraph with `overflow: visible`, so nothing is clipped, and the
screenshot shows both lines whole.

**Text contrast.** This was read from rasterised sRGB pixels in 2x element
crops, not from CSS `oklch` values. The background is the most frequent pixel
in the crop, and the text is the pixel colour (at least 0.25% of the crop)
that contrasts most with it. Ratios follow WCAG 2.x.

| New text                                                                             | FR / AR            | Text on background     | Ratio       |
| ------------------------------------------------------------------------------------ | ------------------ | ---------------------- | ----------- |
| Rules: rating sentence and "Jusqu'à la journée 4…"                                   | both, 390 and 1280 | `#4e5661` on `#ffffff` | **7.43:1**  |
| Points: provisional note                                                             | both               | `#4e5661` on `#f5f7f9` | **6.92:1**  |
| Points list: "Note SofaScore" / "تقييم SofaScore"                                    | both               | `#4e5661` on `#ffffff` | **7.43:1**  |
| Landing: step 3 text and FAQ answer                                                  | both               | `#4e5661` on `#f5f7f9` | **6.92:1**  |
| Landing: three example rows                                                          | both               | `#060d1a` on `#e5e8ec` | **15.82:1** |
| Live pill (`90+3′`, `45+′`, `120+′`, stage label): cards, strip, header, compact bar | both               | `#ffffff` on `#0c3164` | **12.81:1** |

Every value is above 4.5:1. Two crops gave other values. Neither is a
product problem:

- The sixth "Note SofaScore" row at FR 390 sits under the dev-only "MODE
  DÉMO" badge (`#001c49` on `#fdb500`, 9.34:1).
- One `45+′` at AR 1280 is in an off-screen slide of the home hero carousel,
  where the crop shows the card behind it.

Right-to-left: in Arabic the clock renders left-to-right inside its `<bdi>`
(`direction: ltr; unicode-bidi: isolate`). A 4x crop confirmed `120+′`, `45+′`
and `90+3′` read in the right order beside "مباشر".

**Visual problems found:** none in the changed screens. There was no
overflow, no clipped Arabic text and no contrast below 4.5:1.

Two things shown in these screenshots are not caused by these pull requests:

- The desktop live strip cuts its third pill at the rail edge. This is
  identical before and after.
- The mock-mode points header says "PROVISOIRE" or "DÉFINITIF" from the mock
  breakdown statuses. These were set to provisional for GW13 here, so the
  header agrees with the note.
