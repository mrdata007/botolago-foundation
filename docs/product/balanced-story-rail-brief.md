# Balanced home story rail

Owner clarifies that the home-page circles need equal space above and below. Preserve compact circles/code labels, horizontal rail behavior, full viewer headlines, bilingual/RTL behavior and the existing header, deadline and gameweek sections.

Current section padding is asymmetric. More importantly, UiScreen adds 16/24px before it, and the following GameweekBand still has its original -16px top margin on phones; that margin consumes the rail's bottom spacing. Use symmetric vertical padding, remove the page's initial padding only when stories are present and no deadline strip already cancels it, and remove the following band's negative margin when stories precede it. Keep empty-feed and deadline-strip layouts intact.

Acceptance: circle-and-caption groups are centered within the visible band, with equal gaps to the preceding header/strip and following gameweek band in French/Arabic phone and desktop layouts. Capture before/after context, preserve short-label fit and viewer navigation, check empty-feed/deadline layouts, run relevant checks and final CI, then publish under the continuing owner authorization.
