# French and Arabic URLs: plan

Status: **plan, not built.** Audit 2026-09-24, P1-6. Written with the
2026-09-24 launch fixes; the routing change itself is held back because it
touches every public route and every indexed URL, and it deserves its own
reviewed pull request and a rehearsal on a preview deployment.

## Where it stands

- The server renders every page in French: `<html lang="fr" dir="ltr">` in
  `src/routes/__root.tsx`, French titles and descriptions. The reader's
  language lives in `localStorage` (`src/i18n/provider.tsx`) and is applied
  after the page starts, so an Arabic reader sees a French first paint.
- There are no Arabic URLs. `/ar` and `/fr` answer 404. Search engines can
  index French only, although Arabic queries ("ترتيب البطولة", "مباريات
  البطولة") make up most of the Moroccan football search market.
- Articles are the exception: each language edition has its own URL
  (`/news/<edition id>`), and the page declares `hreflang` for the pair and
  `x-default` for the French edition (`buildArticleHead`). They still sit in
  a French document.

## Target

| Page | French (unchanged) | Arabic (new) |
| --- | --- | --- |
| Home | `/` | `/ar` |
| Matches, standings | `/matches`, `/matches/standings` | `/ar/matches`, `/ar/matches/standings` |
| Match | `/matches/<id>` | `/ar/matches/<id>` |
| Clubs, club | `/clubs`, `/clubs/<id>` | `/ar/clubs`, `/ar/clubs/<id>` |
| News | `/news` | `/ar/news` |
| Article | `/news/<fr edition id>` | `/news/<ar edition id>` (already its own URL) |
| Fantasy (public pages) | `/fantasy`, `/fantasy/rules` | `/ar/fantasy`, `/ar/fantasy/rules` |

French stays unprefixed, so no indexed URL moves and no redirect is needed.
`/fr/...` answers a 301 to the unprefixed URL. Personal, auth and admin pages
stay single-URL (they are `noindex`) and keep reading the stored language.

Every public page then declares:

```html
<html lang="ar-MA" dir="rtl">               <!-- or lang="fr-MA" dir="ltr" -->
<link rel="canonical" href="https://botolago.com/ar/matches">
<link rel="alternate" hreflang="fr-MA" href="https://botolago.com/matches">
<link rel="alternate" hreflang="ar-MA" href="https://botolago.com/ar/matches">
<link rel="alternate" hreflang="x-default" href="https://botolago.com/matches">
```

Each language version is its own canonical; neither points its canonical at
the other.

## Steps

1. **Language from the URL.** A pathless layout route with an optional
   `{-$lang}` segment (TanStack Router optional path params) wraps the public
   routes. The layout validates `lang` (`ar` or absent), and `I18nProvider`
   takes its initial language from it, so the server and the first browser
   render agree. Storage is only the default for unprefixed personal pages.
2. **`<html lang dir>` on the server** from the matched route, in
   `RootDocument`. The page is right-to-left from the first byte: no French
   first paint, no layout flip.
3. **Heads in both languages.** Every public `head()` takes its title and
   description from the dictionary for the route's language, and declares
   the alternates above. A shared `alternateLinks(path)` builds them.
4. **Links stay in their language.** A `LocalizedLink` (or a `lang` search
   default) keeps `/ar/...` pages linking to `/ar/...`. The language
   switcher navigates to the other language's URL instead of only changing
   storage.
5. **Loaders fetch the route's language.** The SSR prefetch
   (`src/lib/ssr-prefetch.ts`) and the detail loaders use `lang` instead of
   the fixed `"fr"`.
6. **Sitemap.** Every public URL in both languages, each `<url>` with its
   `xhtml:link` pair; split into a sitemap index (static pages, matches,
   clubs, news by month) since the news alone is ~15,700 URLs.
7. **Tests.** Route tests for `lang`/`dir`/canonical/alternates on every
   public route in both languages; a crawler test that follows only HTML
   links from `/ar` and never lands on a French page; the i18n gate for the
   new keys; Playwright at 360, 390 and 430 px in RTL.
8. **Rollout.** A preview deployment first; check with the URL Inspection
   tool that `/ar` renders RTL with Arabic content and that
   `/matches` → `/ar/matches` alternates validate. Then submit the new
   sitemap in Google Search Console and Bing Webmaster Tools.

## Risks

- Hydration: the server and the first browser render must pick the same
  language for every route, or React discards the server HTML. Step 1 makes
  the URL the single source.
- Duplicate content if a page renders both languages under one URL: every
  public page must have exactly one language per URL.
- Anything that assumes `lang` is only in storage (analytics, e-mail links)
  needs the URL too.
