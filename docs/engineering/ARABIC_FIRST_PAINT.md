# Arabic first paint: an evaluation

Status: **evaluation, nothing changed.** Audit 2026-10-14, finding LOC-05 ("the
Arabic preference is applied only after French page initialization"), Phase C,
lane C3. Written 2026-10-15 against the code of branch
`claude/friendly-turing-ry5fcs`. It decides nothing: routing and server
rendering are the owner's decision (see "What I recommend"). The routing plan
itself is [`LANGUAGE_URLS.md`](LANGUAGE_URLS.md).

## What happens today, step by step

A returning reader whose device says Arabic (`localStorage`
`botolago.language = ar`), opening any page by typing the address or following
a link:

1. **The server answers in French.** `RootShell` in `src/routes/__root.tsx`
   always writes `<html lang="fr" dir="ltr">`, and every page renders its French
   words. The server cannot know the reader's language: it lives in browser
   storage, and no request carries it.
2. **The browser paints that French page.** Nothing about the reader's stored
   choice runs before this first paint. The two inline head scripts that do run
   first (appearance, and whether to show the launch splash) deliberately do
   not touch the language: setting `dir="rtl"` before the French words are
   replaced would show French text laid out right-to-left, which is worse than
   the flash.
3. **The app starts and reads the choice.** `LanguageProvider`
   (`src/i18n/provider.tsx`) renders French on purpose for the first client
   render, so it matches the server HTML and React can keep it (otherwise it
   discards the server markup). Only after mount does an effect read
   `localStorage` and dispatch `restored`.
4. **Arabic is not here yet, so French stays.** The Arabic dictionary is a
   chunk of its own (`dictionary-ar.ts`, about 227 KB of source; kept out of
   the main bundle on purpose, audit 2026-09-24 P1-11, so French readers never
   download it). The state machine (`language-state.ts`) records "Arabic asked
   for, loading" and keeps `lang: fr`. For an ordinary returning reader no
   notice is shown: the download is not news, only a failure or a retry is
   (`languageNotice`).
5. **Everything flips at once.** When the chunk arrives, `lang` becomes `ar` in
   one state change: the words, `<html lang>`, `<html dir>` and `data-lang`
   change in the same frame. There is never Arabic layout with French words,
   or the reverse. If the download fails, the page stays French and a notice
   with Retry appears (this part is complete; the audit itself says not to
   report it as missing).

What this means for sharing and search: the address is the same in both
languages (no `/ar`), so a link shared by an Arabic reader opens in the
recipient's own stored language, or French for a first visit. Articles are the
exception (each language edition has its own address), and they still sit in a
French document until step 5.

## What is observable

Measured in a real Chromium (Playwright, own port, phone viewport 390x844,
English browser locale), development server, stored language `ar`, hard load of
`/`, splash and welcome dialogs skipped. A page script logged the time of each
change on the page's own clock (`performance.now()`, from navigation start).
**This is the Vite development server, which serves the app as hundreds of
unbundled modules: the absolute times are far slower than the production
bundle and must not be quoted as what readers see. The order of events is what
is solid.** No production build was measured (see "Not measured").

| Run (dev server)          | French text on screen | First paint | App hydrated (`data-lang=fr`) | `lang=ar dir=rtl` and Arabic text | French shown for |
| ------------------------- | --------------------- | ----------- | ----------------------------- | --------------------------------- | ---------------- |
| Cold, no throttling       | 198 ms                | 236 ms      | 1,834 ms                      | 2,890 ms (text at 2,940 ms)       | about 2.7 s      |
| Warm cache, no throttling | 450 ms                | 476 ms      | 1,638 ms                      | 2,179 ms (text at 2,209 ms)       | about 1.7 s      |

| Cold, throttled (1.6 Mbit/s, 150 ms, 4x slower CPU) | 2.8 s | 2.8 s | 83.9 s | 88.0 s | about 85 s |
| Warm cache, throttled | 1.3 s | 1.3 s | 15.3 s | 18.7 s | about 17 s |

The throttled rows are the least representative: the development server sends
the app as hundreds of separate modules, which a slow network and a slow CPU
multiply. A production bundle is a small number of files; its time to Arabic
was not measured here and will be far shorter than these. What the throttled
rows do show is that the French first paint stays on screen for as long as the
app takes to start, and that this time grows with the reader's connection:
the French page is the thing a slow-connection Arabic reader sees first, and
for the whole of that wait.

What the numbers show, and what they do not:

- **A French first paint is certain**, then a full switch to Arabic and
  right-to-left in a single step. In every run the French text was painted
  before the page's own code had started.
- **The whole interface changes direction at once**, so the layout-shift score
  of the switch is large. The browser reported a cumulative layout shift of
  between 1.22 and 1.54 in the four runs (1.45 and 1.54
  unthrottled, 1.37 and 1.22 throttled). That figure includes the
  development server's own late-loading styles, so it overstates a production
  load; but a direction flip moves essentially everything, so a real, visible
  jump is expected, not a measurement artefact.
- The wait between "French painted" and "Arabic shown" is the app's start plus
  the Arabic chunk. On the development server the chunk is a second round trip
  after hydration; in a production bundle it can be requested earlier, but it
  is still requested only after the main code has started.
- Not measured: how long this is on a real production build, a real phone, or a
  real mobile network; how many readers it affects (there is no measured
  language split, `PRODUCT.md` says roughly half).

## Options

| Option                                                                                                         | What changes                                                                                            | First paint for an Arabic reader                                                | Cache and search effects                                                                                                                                                                                                                                                                    | Account behaviour                                                                                                                                                                                               | Cost and risk                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Do nothing (today)**                                                                                      | Nothing                                                                                                 | French, then a full flip                                                        | Every page is one cacheable, language-neutral HTML; Arabic search queries find only French pages                                                                                                                                                                                            | A language switch on one device never reaches another; notifications follow the account's own language                                                                                                          | None. The cost is the flash, and no Arabic search presence                                                                                                                                                                             |
| **B. Language in the address (`/ar/...`)**, the plan in `LANGUAGE_URLS.md`                                     | Every public page gets an Arabic URL; the server writes `lang`, `dir` and Arabic words from the address | Arabic from the first byte, no flip, for anyone who arrives on an `/ar` address | Two cacheable variants, each at its own address: no `Vary`, no cache fragmentation. Each language is its own canonical with `hreflang` pairs, so Arabic pages can be indexed                                                                                                                | The device preference becomes only the default for pages with no language in the address (personal, sign-in, admin: single address, `noindex`). The profile language row would navigate instead of only storing | Large: touches every public route, every indexed address, the sitemap, SSR prefetch and the language switcher; needs a preview deployment and a crawler test. Hydration must agree with the address on every route                     |
| **C. A language cookie the server reads**                                                                      | The language switch also writes a cookie; the server reads it and renders in that language              | Arabic from the first byte, but only for a returning reader on the same device  | The same address now returns different HTML by cookie: the page must be `Vary: Cookie` or uncached, which removes the shared cache for public pages; a crawler (no cookie) still sees French only, so no Arabic search gain; a shared link shows the recipient's language, not the sender's | Still device-level, plus one more store to keep equal to browser storage                                                                                                                                        | Medium. Cheaper than B to build, but it gives up caching and search, the two reasons to do this at all, and it leaves "the flash on a first visit" untouched                                                                           |
| **D. A smaller step: a pre-paint script that sets `dir` only**                                                 | An inline head script sets `dir="rtl"` from storage before the first paint                              | Still French words, now laid out right-to-left, then Arabic words               | None                                                                                                                                                                                                                                                                                        | None                                                                                                                                                                                                            | Rejected: it trades a flip for a worse first paint (French in a mirrored layout)                                                                                                                                                       |
| **E. Show a wait notice while Arabic loads** (the register's `جارٍ تحميل العربية…` / `Chargement de l’arabe…`) | A status line during the ordinary download                                                              | Unchanged                                                                       | None                                                                                                                                                                                                                                                                                        | None                                                                                                                                                                                                            | Small, but it announces a delay the reader would otherwise barely notice, and it appears over the French page the reader is about to lose. The copy already exists and is shown where it matters: the first-launch chooser and a retry |

## What I recommend

1. **Do not build C.** It costs public-page caching, leaves crawlers on French,
   and only helps returning readers.
2. **Decide B as a product question, not a fix.** It is the only option that
   gives an Arabic reader a first paint in Arabic, and the only one that also
   opens Arabic search (the audit notes Arabic queries are most of the Moroccan
   football search market). It is a pull request of its own with a preview
   rehearsal, as `LANGUAGE_URLS.md` already says. It needs the owner's choice
   of shape (`/ar` beside unprefixed French, or `/fr` too), which `PRODUCT.md`
   lists as open.
3. **Until then, keep A and do not add anything.** The flip is one clean
   change (words, direction and language together), failure and retry are
   handled, and the French first paint is a known and documented limit
   (`PRODUCT.md`). The fix that would help the flash itself, an earlier request
   for the Arabic chunk once the stored choice is known to be Arabic, belongs
   inside B (the address would say it before any script runs).
4. **No code was changed for this finding.** The register's progress copy
   already exists and is already shown in the two places where a wait is news
   (the first-launch chooser, and the notice's retry); adding it to every
   ordinary Arabic load would be option E, which I do not recommend on its own.

## Not measured

- A production build, a real phone, a real mobile network (the runs above are
  the development server in a desktop browser with emulated throttling).
- The share of Arabic readers, and how many arrive by a shared address.
- Search effects of option B (a preview deployment and Search Console are
  needed; nothing here could call out).
- Option B and C's effect on the cache are reasoning about how such caches
  behave, not a measurement of this site's cache.
