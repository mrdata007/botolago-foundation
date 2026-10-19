# Desktop layout refinement

## Preserve

Keep BotolaGO's existing colours, typography, components, mobile section order,
French/Arabic parity, navigation destinations and feature flags. Keep every
Fantasy, match, scoring, authentication and data-loading rule unchanged. Reading
pages retain their current content widths.

## Improvements

The home grid currently switches to 340px / fluid / 340px at 1024px: after
gutters and gaps its central gameweek card has only 264px. Keep the two-column
layout through small laptops, and use flexible side columns with a larger centre
from 1280px. Contain each tablet column's children so long labels cannot enlarge
its track. Align desktop section starts without altering the phone order.

The shared header currently constrains most pages to 672px while showing desktop
navigation, the wordmark and actions in that space. Give the header the existing
desktop canvas from 1024px on every page, make navigation spacing responsive,
and retain compact search where an inline field would crowd the links. Preserve
the header height and sticky offsets.

## Acceptance criteria

- At 1024px home retains a full-width gameweek area and two supporting columns;
  from 1280px its centre is at least 400px wide and the three tracks fit inside
  the existing 1320px canvas.
- At 768, 1024, 1280 and 1440px, the shared header's visible links and actions
  fit inside the viewport without overlap in French and Arabic.
- At 390px the existing single-column order and bottom navigation remain; Arabic
  uses RTL and French LTR. Existing light/dark tokens continue to apply.
- Record before/after screenshots and bounding-box measurements using local
  fixture data, including actual element containment rather than scroll width
  alone. Run relevant shell/home tests, type checking and browser regressions.
- Open a draft PR. Do not merge or deploy: AGENTS.md requires owner review.
