# Remove the generic AI look: before and after

One image per screen. Each holds eight columns at 390px phone width, scaled
down: French light, French dark, Arabic light, Arabic dark, each as
**before | after**. Long pages are cut at 2,600px.

Captured on 2026-10-30 from the development server in mock data mode
(`VITE_*_DATA_MODE=mock`), Chromium, reduced motion, signed out unless the
name says otherwise (`-signed-in`, `-owner`, `fantasy-leagues*`,
`fantasy-points`, `saved`: the demo account). The "before" side is the
branch's base, `a02f56d`.

The demo data has leagues, players, rankings, points and standings, so the
empty states of those screens never appear on the real pages.
`empty-gallery.jpg` is a temporary development page (not committed) that
renders each of those empty blocks with the exact props of its screen, before
and after, plus the Home Fantasy alert rows with demo players (after only; in
the demo data the alerts' players are not among the players Home loads, so
the real Home shows the rows without a name, as the old boxes did).
