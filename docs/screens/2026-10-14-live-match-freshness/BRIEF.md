# Brief: a live match page that heals itself and says when it is behind

Screen work under AGENTS.md "Screen work". Owner approval: the fix of the
frozen live page (2026-10-14, task "Root-cause and fix ... frozen live page").
Written after inspecting the screen and before any interface change.

## What was seen

On 2026-10-13 the owner had the page of FUS Rabat 1-1 Raja open and, hours
after full time, it still read **EN DIRECT 0–1**. The match page
(`src/routes/matches.$matchId.tsx`) reads `football.getMatchDetailPage` through
one React Query query, refetched every 30 s while the match is live
(`matchRefetchInterval`), never while the tab is hidden
(`refetchIntervalInBackground: false`). Inspection of the code shows three ways
it can stay frozen without telling the reader:

1. **Coming back does not always refetch.** React Query refetches on
   `visibilitychange` and `online`, and only when the data is older than the
   15 s `staleTime`. A page restored from the back/forward cache (`pageshow`
   with `persisted`), a phone that froze the tab's timers, or an app WebView
   resumed without a `visibilitychange` keeps the last read until the next
   30 s tick, and if that tick is lost too, indefinitely.
2. **Nothing on screen says how old the score is.** The header shows the live
   pill and a ticking minute (`useTickingMinute`), so an old read still looks
   alive: the minute keeps moving up to the cap.
3. **"EN DIRECT" never expires.** A match whose last read says `live` keeps the
   live pill forever, even 4 hours after kickoff.

## What must be preserved

- The split header, its score box, the live pill and its minute/stage label
  (`UiLivePill`, `liveClock`), the elapsed bar, the scorers band, the tabs and
  their panels, the compact top bar: same layout, colours, type and spacing
  for a match whose data is fresh.
- The 30 s live cadence, no polling while the tab is hidden, the pre-kickoff
  watch, `rereadTableOnFinish`, the goal moment (`useGoalMoment`, fed only fresh
  events), the error state when the very first read fails.
- One polite live region (the score). The new line must not announce every 30 s.
- Business logic: match status, scores and events are shown as the database
  gives them; nothing here changes a match's status or score.
- FR and AR copy in the dictionaries only; RTL through logical properties and
  `<bdi>` for times, as the rest of the page.

## The improvements

1. **Self-healing reads.** While the match is live (or its last read says so),
   the page refetches the match as soon as the reader comes back: tab visible
   again, page restored from the back/forward cache, window focused, network
   back online. Only when the data is more than 15 s old, so returning does not
   double the normal tick.
2. **A discreet "last updated" line.** Under the header of a live match: "Mis à
   jour à 21:05" / "آخر تحديث 21:05", small and muted, the time in Casablanca
   time like every other time on the page. Not a live region (it changes every
   30 s); the existing sr-only "Mise à jour automatique" stays.
3. **A stale notice.** When the last successful read is more than 2 minutes
   old during a live match (refetches failing, or none happening), the line
   becomes a notice: "Score non actualisé depuis 21:05" with an "Actualiser"
   button that refetches. Announced once (`role="status"`) when it appears.
4. **No live badge on an expired read.** When the kickoff is more than 3 hours
   ago and the last successful read is more than 2 minutes old, the header
   (and the compact top bar) stop claiming the match is live: the pill becomes
   the neutral navy status pill "Score à confirmer" / "النتيجة غير مؤكدة", the
   minute stops ticking and the elapsed bar is hidden. The notice says the score
   may not be final. A fresh read that still says `live` (a long delay, extra
   time) brings the live pill back: only a fresh read is trusted.

## Acceptance criteria

Visual:

- Fresh live read: identical header to today, plus one muted line of meta text
  under it; nothing else moves.
- Stale (> 2 min): the line shows the time of the last read and an "Actualiser"
  button with a visible focus ring and a 44 px tall hit area on touch.
- Expired (> 3 h after kickoff, stale): the neutral pill replaces "EN DIRECT" in
  the header and the compact bar; no ticking minute, no elapsed bar.
- FR and AR at 390 and 1280: no horizontal overflow (measured per CLAUDE.md:
  every visible box against the viewport, not only `scrollWidth`), the line and
  button follow the reading direction (RTL in Arabic), the time stays in `<bdi>`.
- Contrast of the new text and button at least 4.5:1, read from rasterised
  pixels.

Functional:

- Returning to the tab, a `pageshow` from the back/forward cache, `focus` or
  `online` on a live page with data older than 15 s triggers exactly one refetch.
- A successful refetch clears the stale notice and, if still live, restores the
  live pill.
- The freshness rules are pure functions with unit tests (fresh, stale,
  expired, not live, boundary values).
- Existing match page, header and top bar tests still pass.

## Evidence

Before/after screenshots in this folder (`<screen>-<lang>-<width>--<before|after>.png`),
the harness notes and measurements in `README.md`.
