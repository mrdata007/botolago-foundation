# Quick Audit remediation (2026-10-26)

Source: "BotolaGO — Quick Audit" by Nimesh Dobariya (external review of the
live public pages, no code access). This brief turns its findings into
work packages and records, before any interface change, what must be
preserved, what changes, and how each change is accepted.

Code only. No database writes, no migrations applied, no Edge Function
deployed, nothing published in Lovable. Anything that needs an account,
a store listing or a backend change is listed under "Not in this change".

## What must be preserved

- BotolaGO's identity: the dark UI, the five-tab bottom navigation, the
  brand, the tone.
- Every business rule: Fantasy rules and scoring, the gameweek lifecycle,
  predictions, Curva, Plus, prizes.
- Existing SEO wins: per-route titles, descriptions and canonicals,
  Organization/WebSite JSON-LD, the sitemap, CLS 0, the skip link, real 404
  status, the security headers, year-long caching of fingerprinted assets.
- Personal pages stay uncached (`private, no-store`) and `noindex`.
- French URLs do not move.

## Work packages and acceptance criteria

### A. Edge caching and release tag
- Public, anonymous HTML gets `Cache-Control: public, max-age=0,
  s-maxage=60, stale-while-revalidate=300` (or similar short TTL). Personal
  routes keep `private, no-store`. A response that varies by cookie/session
  is never marked public.
- `x-botolago-release` carries a real commit id on Lovable/Cloudflare builds
  when the build environment exposes one, instead of `unknown`.
- Accepted when: unit tests cover the header choice per path, and the
  existing release-header test still passes.

### B. One first visit
- The server and the browser show the same homepage to a logged-out
  visitor: the live-scores Home. The Fantasy pitch no longer replaces the
  page; it becomes an inline, dismissible card on Home.
- The full-screen language picker no longer blocks content. The first
  language comes from the browser/device language (Arabic → `ar`, else
  `fr`); a one-tap switch stays reachable in the header.
- Pinch-zoom is allowed again (no `maximum-scale=1`); the iOS input-focus
  zoom is prevented by 16px inputs instead.
- The 404 page gets its own title.
- Accepted when: Home renders the same main content on server and after
  hydration for an anonymous visitor; no modal appears on first load; the
  viewport meta has no `maximum-scale`; French and Arabic (RTL) both render.

### C. Arabic articles that are really Arabic
- An Arabic article URL renders the Arabic edition on the server, with
  `lang="ar" dir="rtl"`, a self-referencing canonical, reciprocal hreflang
  and an `x-default`, whatever the reader's interface language.
- "Read in Arabic" / "Read in French" shows the other edition.
- Readable slugs are used in canonicals where the edition has one; old
  id URLs redirect permanently to the slug URL.
- Accepted when: unit tests on the head builder and the resolver; an Arabic
  URL never returns a French canonical.

### D. Matches, sharing and SEO gaps
- The Matches tab opens on the nearest matchday (live or next, else the
  latest results) instead of an empty day.
- Article, match and club pages have their own share image where one is
  available (article hero, match/club crest card); fallback stays the
  generic image.
- `/curva` gets a canonical and an `<h1>`.
- A per-route SEO checklist test fails the build when a public route loses
  its title, description, canonical or H1.

### E. Speed of the first screen
- Less JavaScript preloaded on first view: Fantasy, Curva, Plus and
  animation code load only when used.
- No duplicate client fetches right after load (server data reused from the
  hydrated cache, including for Arabic readers; `match_votes` once;
  `fantasy_prizes` only when shown).
- Homepage images carry width/height; the hero is preloaded.
- A performance budget script fails when the first-view bundle grows past
  its budget.
- Accepted when: before/after numbers from the production build (file
  count and gzipped bytes of the first-view preloads) are recorded.

### F. Installable and offline-friendly
- Web app manifest, `theme-color`, icons; a service worker that caches the
  app shell and the latest fixtures/standings for weak signal, never
  caches personal or authenticated data, and is not registered inside the
  native Capacitor shell.
- Accepted when: manifest validates, the worker only serves cached data
  when the network fails, and a unit test covers its routing rules.

### G. Auto-written match reports
- Guardrails in the generation step: one canonical name per club (the name
  given in the facts; aliases rejected), no sentences about missing data
  ("score à la mi-temps indisponible" and the like).
- Accepted when: unit tests on the validation reject the audit's examples.
  Not deployed here.

## Not in this change

- Web push notifications (need VAPID keys and backend work); native push
  already exists.
- App store release pipeline and smart app banner (no store listing yet).
- Error monitoring with source maps (needs an account choice).
- Full `/ar/...` URLs for every page (planned in
  `docs/engineering/LANGUAGE_URLS.md`; articles are covered here).
- Supabase access review (RLS, elevated functions, vote rate limits) and
  data/logo licensing: to check with backend access.
- A human review queue for generated reports (needs a migration).
