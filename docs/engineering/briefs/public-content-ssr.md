# Public content in server HTML — approved Step 2

The owner approved the targeted SSR repair on 12 October 2026 after the live
SEO audit. TanStack Start already renders the site: keep that stack and extend
its route loaders, rather than migrating frameworks.

## Preserve

Keep BotolaGO's existing layouts, tokens, French/Arabic copy and RTL behavior,
filters, pagination, tabs, login/MFA/account isolation, Fantasy rules and all
user data. No database writes, migrations, publishing, merge or deployment.
Personal team, rank and league reads remain scoped to the signed-in account.

## Inspection and improvements

The live audit and route/component inspection found data loading only after
mount on the Fantasy player directory, top players, difficulty and rankings;
club detail renders identity but not fixtures/statistics; the Pépites ranking
loader and component construct different query keys (`followed` is omitted
in the loader). Help answers are removed from the DOM when collapsed.
Missing Fantasy players answer 200. Existing rendering and hydration utilities
already solve these problems on the standings and other public routes.

Reuse bounded per-request prefetch and hydration for public records, align
server and component query keys, make help answers available in native HTML,
and distinguish genuinely missing entities (404) from unavailable reads (503).
The Pépites revelation is deliberately a noindex interactive replay of its
public edition, so its client-only presentation should remain so.

## Acceptance criteria

- Raw HTML contains player names/prices, public ranking rows, difficulty cells,
  club fixtures/statistics, and squad rows when the squad URL tab is selected.
- No personalized records are added to the SSR payload. Account/MFA guards and
  account-switch cache isolation remain unchanged.
- The first hydrated render matches the server. Existing filtering, pagination,
  recruitment, club tabs and help interactions still work.
- Missing players return 404; temporary public-data failures return 503 with
  Retry-After, not an indexable empty/loading page.
- Relevant existing tests, typecheck, focused SSR/hydration tests, and local
  browser checks at mobile/desktop widths in French and Arabic/RTL pass.
- Record before/after screenshots and distinguish mock/stub measurements from
  live-site evidence. No ranking or Core Web Vitals claim without measurement.

Deliver in small commits and a draft PR for review, with verification steps.
Subsequent URL/language/schema/content work remains a later step.
