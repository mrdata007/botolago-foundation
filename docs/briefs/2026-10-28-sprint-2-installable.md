# Sprint 2: Arabic first, installable, deep links, image descriptions (screen brief)

Owner-approved work of 2026-10-28, from the dmwebsoft technical audit
(27 Oct 2026) and the owner's Sprint 1 & 2 plan. Branch `sprint-2-installable`,
made from the finished Sprint 1 branch. No database write, no migration, no
Edge Function, no deploy. Items: FE-H1, FE-H2, ST-2, FE-M4, FE-L1.

## What must be preserved

- Every screen reads and looks the same in French and Arabic, phone and
  desktop, LTR and RTL: no copy, colour, spacing, type face or component change
  beyond what is listed below.
- The first-launch language chooser still opens on a first visit, over the
  page, and nothing is decided for the reader without it; the menu switcher
  still changes the language at any time.
- The choice stays recorded on the phone (`botolago.language`), as before.
- Brand identity, Fantasy rules, scoring, deadlines, prizes, auth, BotolaGO+
  and every other business rule.
- Login, sign-up and live data work exactly as before: nothing that carries a
  user's data or live match data is ever cached by the browser for later.
- The phone app (Capacitor shell) keeps opening the live site as it does; no
  web-only machinery runs inside it.
- Search engines get the same French pages as before (they send no language
  cookie).

## Improvements

- FE-H1: the server draws the page in the reader's language, from a language
  cookie (written by the switcher and the chooser, and from the stored choice
  on the next visit), else the browser's preferred language, else French. An
  Arabic reader's first HTML is already Arabic and right to left; the page no
  longer flips from French after loading. The chooser's preselected answer is
  the page's language, so confirming keeps the page as it is.
- FE-H2: a web app manifest and a service worker make the site installable;
  a new deploy replaces the old files; with no network a page that was not
  saved shows an offline page in French and Arabic instead of a browser error.
- ST-2: the files that let the phone app open botolago.com links
  (`/.well-known/assetlinks.json`, `/.well-known/apple-app-site-association`),
  the native wiring, and the in-app handling of an opened link. The store
  identifiers are the owner's to give: placeholders until then.
- FE-M4: pictures that carry meaning (player photos, club crests, article
  photos) are described for screen readers in French and Arabic; decorative
  ones stay silent.
- FE-L1: a page's code starts loading when the reader's finger touches its
  link, so the tap lands on a ready page.

## Acceptance criteria

Visual

- With the Arabic cookie, the first HTML has `lang="ar" dir="rtl"` and Arabic
  text; at 375 px the Arabic home page's layout shift is under 0.1 (it was
  0.90). French pages are unchanged.
- The offline page is legible in light and dark, French and Arabic, at 375 px,
  with no horizontal overflow.
- Before and after screenshots of the home page in French and Arabic.

Functional

- First visit with an Arabic browser: Arabic page, chooser open with Arabic
  preselected; choosing French switches and is remembered after a reload.
- Lighthouse reports the site installable; a second visit loads the hashed
  files from the service worker's cache; with the network off, a page never
  opened shows the offline page.
- No request to Supabase (REST, Auth, Realtime, Storage, Edge Functions) is
  answered from the service worker's cache.
- Inside the phone app the service worker is not registered.
- Both `.well-known` files are served with `application/json`, without a
  redirect.
- Lighthouse accessibility reports no image-alt issue on the home page.
- The existing unit tests, lint, typecheck, production build and the CI
  browser suites pass; French and Arabic smoke checks at 375 px, light and
  dark.
