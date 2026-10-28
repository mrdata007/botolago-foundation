# Readable club URLs (SEO pass 1, Bug 2, clubs only)

No screen changes: no markup, copy, layout or style is touched. Only the
address a club link points at changes.

## What was checked first

Production's `football_team_catalog` (read-only, 27 Oct 2026) returns 21 clubs
whose `slug` is the provider slug plus the first twelve hex digits of the id
(`rsb-berkane-7b2e23bc450f`), with accents dropped instead of folded
(`maghreb-f-s-…`, `olympique-dche-ra-…`) and one stale one
(`cr-khemis-zemamra-…` for RCA Zemamra; WCA's is `wydad-casablanca-…`). Not
usable as an address, so the slug is derived in code from the French short
name, with no migration: `src/lib/club-slug.ts`.

## Preserved

- Every club page's content, tabs, search params (`?tab`, `?season`).
- Old `/clubs/<uuid>` addresses keep working: they answer a 301 to the slug.
- Mock and Fantasy data paths: `Club.slug` (provider slug) is untouched; the
  new `Club.pathSlug` is separate. A club with no Latin name (an
  Arabic-language response) links by id and is redirected.
- Matches, news and players URLs.

## Changes

- `/clubs/rsb-berkane` is the canonical address: `<link rel=canonical>`,
  `og:url`, `SportsTeam` and breadcrumb JSON-LD, the clubs sitemap, and the
  club `url` in match JSON-LD.
- Internal club links pass the slug.

## Acceptance

- `/clubs/<uuid>` answers 301 with `Location: /clubs/<slug>` (query kept).
- `/clubs/<slug>` answers 200 with the slug canonical; an unknown slug is 404.
- Slugs of the 21 live clubs are readable and unique (unit test).
- Club pages render the same in French and Arabic (RTL), at 390 px and desktop.
