# Club names and aliases on club pages (SEO brief 3.1)

## Preserve

- The club hero: colour band, stripes, crest disc, the name as the page's `<h1>`, the follow control and season picker, the key-numbers card.
- Titles and the meta description of club pages.
- Club identity and routing (`/clubs/<uuid>`); no data or database change.

## Improvements

- One discreet line under the club name in the hero: "Aussi appelé : RSB, RS Berkane, Nahdat Berkane · نهضة بركان" (Arabic: "يُعرف أيضًا بـ"), in the server HTML.
- Latin aliases are tagged `lang="fr"` in Arabic pages, and the Arabic name `lang="ar" dir="rtl"` inside French text.
- The same names in the club's `SportsTeam` JSON-LD `alternateName`.
- A small data module keyed by a stable club key, resolved from the club's name, short name and slug (the way `kits.ts` does), never by UUID. Only clubs the live `/clubs` page lists.

## Acceptance

- View-source of a club page carries the line and the alias names without JavaScript.
- FR and AR (RTL) at 390px and desktop: the line wraps, never overflows, and reads at 4.5:1 on the club band (measured).
- No line for a club without aliases; a name already shown as the title is not repeated.
- Tests: every entry resolves to exactly one live club, no duplicates across or within entries, JSON-LD includes the aliases.
