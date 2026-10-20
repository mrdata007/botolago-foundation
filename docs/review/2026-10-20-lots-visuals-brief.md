# Lots: visual refinement

## Preserve

Keep the real catalog order, names, descriptions, estimated values, merchandise
labels, sponsor attribution and images, image fallback, winning criteria,
verified winners, reporting, pagination and terms navigation. Preserve the
BotolaGO identity, existing stadium/trophy artwork, French/Arabic support,
theme tokens and all prize/Fantasy business rules.

## Improve

The current desktop page is a narrow phone-style column; the centered hero
and oversized tier illustrations push the prize details far down the page.
All information has similar emphasis and card headings do not name the prize.

- Use the existing wide Fantasy canvas, retaining a phone-first single column
  and two prize columns where space allows.
- Give the stadium header a clearer headline and a horizontal desktop layout,
  retaining the free-to-play message and existing trophy artwork.
- Constrain artwork to consistent stages, introduce tier badges, make prize
  names real headings, and distinguish estimated value and winning criteria.
- Improve section spacing and the winners heading using existing UI tokens.

## Acceptance

Capture before/after in French and Arabic at 390 and 1440 px, light/dark.
Verify 320 px, long prize names, catalog/merchandise/sponsor information,
failed-image fallback, empty/error states, winner reporting and terms links.
Measure actual boxes and heading text to detect clipping, including RTL.
Keep imagery crisp and details readable with no invented prizes or winners.
Run existing prize tests, layout browser checks, typecheck, lint and formatting.
Open a separate draft PR; no production writes, merge or deployment.
