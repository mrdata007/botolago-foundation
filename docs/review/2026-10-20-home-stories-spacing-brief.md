# Home stories: remove excess top spacing

Preserve the story circles, captions, scrolling, viewer, header, deadline and
live-match strips, gameweek content, empty-feed layout and French/Arabic layout.

Inspection found the populated-home padding override still targets `main`.
`AppShell` now puts that padding on its inner `UiScreen` div, so the override
misses the 16 px phone / 24 px desktop padding. Target that content container
when stories are present and no deadline banner needs its normal padding.
Keep the rail's existing 20 px breathing room.

Acceptance: measure before/after on the full home page in French and Arabic at
390 and 1440 px; without a deadline strip the populated rail has 20 px above
its first circle instead of 36/44 px. The deadline and empty-feed combinations
retain their layout, the gameweek band stays correctly placed, and the viewer
still opens. Run existing home structure tests, typecheck and relevant browser
checks. Save screenshots and open a draft PR; do not merge or deploy.
