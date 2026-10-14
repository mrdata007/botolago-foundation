# Visual evidence: SofaScore review list actions

Taken 2026-10-14 for AGENTS.md "Screen work", rule 5. The brief is
`docs/engineering/tasks/sofascore-review-actions/screen-brief.md`. BEFORE is
`origin/main` at `af0f0fac`. AFTER is branch `claude/sofascore-catalog-aliases`.

## Files

Each name is `<scenario>-<lang>-<width>--<before|after>.png`, in `fr` and `ar`,
at 390 (390x844) and 1280 (1280x900). They are rendered at 1x and quantised to
256 colours.

| Scenario               | What it shows                                                                   | Before | After |
| ---------------------- | ------------------------------------------------------------------------------- | ------ | ----- |
| `queue-top`            | the top of the list (unchanged)                                                 | yes    | yes   |
| `entry-already-mapped` | a candidate already linked: was "cannot be chosen", now also "second ID" button | yes    | yes   |
| `entry-no-candidate`   | no candidate: was "no button to create", now search and create                  | yes    | yes   |
| `alias-confirm`        | the "link as second ID" confirmation on an offered candidate                    | –      | yes   |
| `search-panel`         | "find another player": the club squad, each with its SofaScore state            | –      | yes   |
| `search-catalog-alias` | a name search across the catalog, and a second-ID confirmation from it          | –      | yes   |
| `create-panel`         | "create this player", pre-filled from SofaScore                                 | –      | yes   |

The last four are new controls, so they have no before image.

## How the pages were served

- **Page.** `/dev/sofascore-players-sample`, the development-only sample of the
  screen. It uses invented data and an in-memory repository, with no database
  or network access.
- **Server.** One Vite dev server, run from this worktree on 127.0.0.1:4471 and
  shared with nothing else. The before images were taken from it while the
  worktree was still at `origin/main` (`af0f0fac`), before any interface change.
  The after images were taken after the change, on the same port and from the
  same tree. The served module was checked to contain the new
  `sofascore-search-panel` test id.
- **Browser.** Chromium was `/opt/pw-browsers/chromium-1194`, driven by the
  repo's Playwright library, with `reducedMotion: reduce`. The language was set
  through `botolago.language` so the first-launch chooser stays closed.

## Measurements (AFTER, all 28 scenario x language x width combinations)

**Horizontal overflow.** This used the CLAUDE.md method, not `scrollWidth`
alone. Every visible box was checked against the viewport width, except boxes
inside a horizontal scroller. The result was 0 overflowing boxes in all 28.
`scrollWidth` equalled the viewport width (390 or 1280) in all 28 as well.

**Contrast.** Each text node's computed colour and the background it sits on
were rasterised to sRGB through a canvas. That handles `oklch`. Translucent
layers were composited, then the WCAG ratio was computed. The lowest ratio in
every combination was **6.04:1**, for the position badge ("Attaquant" /
"مهاجم"), which is the same badge as before. No new text is below 4.5:1.

**Right-to-left.** In Arabic the panels and buttons mirror. The SofaScore ids,
shirt numbers and dates stay in left-to-right runs (`bdi dir="ltr"`, `⁨…⁩`).
The shirt field is `dir="ltr"`. The SSR tests check that no physical left/right
classes are used.

## Not captured

- Dark mode was not captured. The screen uses only ui-kit tokens and admin
  surfaces, as before.
- The live admin route (`/admin/football/sofascore-players`) needs a staff
  session with a second factor. Its view is the same component, drawn with the
  Supabase repository.
