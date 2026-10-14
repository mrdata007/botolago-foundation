# Visual evidence: live match page freshness

Taken 2026-10-14 for AGENTS.md "Screen work", rule 5. The brief is
[`BRIEF.md`](BRIEF.md), committed before any interface change. BEFORE is
`814f430b` (origin/main plus the backend fix and the brief, no interface
change). AFTER is this branch with the freshness change.

## Files

`<scenario>-<lang>-<width>--<before|after>.png`: `fr` and `ar`, at 390
(390x844) and 1280 (1280x900), the top 460 / 520 px of the match page, 1x,
quantised to 256 colours. 32 PNGs.

| Scenario       | What the harness did                                                                                                                      | Before                                               | After                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `live-fresh`   | live match (0–1, 25′) just read                                                                                                           | live header                                          | same header, plus "Mis à jour à HH:MM" / "آخر تحديث على الساعة HH:MM"                                  |
| `live-stale`   | network down (match read fails), 3 minutes on, 31 s of timers run (the 30 s refetch and its retry fail)                                   | the whole page replaced by "Une erreur est survenue" | header kept, notice "Score non actualisé depuis HH:MM." with "Actualiser"                              |
| `live-expired` | as above, 4 hours on                                                                                                                      | error page                                           | neutral pill "Score à confirmer" / "النتيجة بانتظار التأكيد", notice "… n'est peut-être pas définitif" |
| `live-frozen`  | the owner's case: 4 hours on, only 16 s of timers run (no refetch due: timers frozen by the phone, or a page from the back/forward cache) | "EN DIRECT 0–1" with the minute still ticking        | neutral pill and the expired notice                                                                    |

Returning to the page (tab shown, `pageshow`, focus, `online`) refetches a live
read older than 15 s; that is covered by unit tests (`watchReturns`,
`shouldRefetchOnReturn`), not by a screenshot.

## How the pages were served

- Two Vite dev servers in mock data mode (no `.env`; `vite dev` does not read
  `.env.production`), each from its own worktree, on 127.0.0.1:4481 (before)
  and 127.0.0.1:4482 (after), neither shared. Each served its own tree:
  `/src/lib/match-freshness.ts` answered 404 on 4481 and 200 on 4482.
- Every request not to the page's own dev server was aborted by the harness (no
  production call).
- Chromium `/opt/pw-browsers/chromium-1194`, Playwright 1.61, `reducedMotion:
reduce`, timezone Africa/Casablanca, Playwright's fake clock (installed before
  the page loads; `setSystemTime` moves the clock without firing timers,
  `runFor` fires them).
- Data stubs, harness only (a Vite plugin in a scratch config, identical for
  both trees, no product file edited): mock match m1 reads 0–1 at 25′, and a
  browser flag makes the mock `getMatchDetail` throw ("network down").

## Measurements (AFTER)

**Horizontal overflow**, CLAUDE.md method (document `scrollWidth` and every
visible box against the viewport): 0 boxes outside the viewport in all 16
scenario x language x width combinations; `scrollWidth` = `clientWidth`
(390/390, 1280/1280). The note is never truncated. In Arabic the note's
`direction` is `rtl` and the button sits at the inline end (left); the time is
in a `<bdi>`.

**Hit area.** "Actualiser" / "تحديث" is 44 px tall (114 / 90 px wide).

**Contrast**, read from rasterised 2x crops (most common colour vs the
strongest text colour, sRGB, WCAG formula), light and dark, FR and AR:

| Element                     | Light                     | Dark                      |
| --------------------------- | ------------------------- | ------------------------- |
| fresh line (muted on page)  | #4e5661 on #f5f7f9 6.92:1 | #a9b2be on #050b18 9.18:1 |
| stale / expired notice text | #060d1a on #fff5e5 18.0:1 | #f0f6fc on #2f3032 12.1:1 |
| "Actualiser" button label   | #0c3164 on #fff5e5 11.9:1 | #9bdbfd on #2f3032 8.77:1 |
| "Score à confirmer" pill    | #ffffff on #0c3164 12.8:1 | #f0f6fc on #142c55 12.7:1 |

Not changed, seen in the 1280 captures: the Pronostics card in the desktop
column reads its own data and still shows its own live badge for the match.
