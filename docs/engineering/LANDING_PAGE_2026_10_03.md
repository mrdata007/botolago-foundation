# Landing page — 2026-10-03

What a new visitor sees, why, and how to tell whether it works.

## Where it lives

- **`/jouer`**: the landing page as its own address, the link to share in a
  post, a bio or a message. Shown to everyone; its button adapts to the reader.
- **`/`**: a first visit **without an account** (`status === "anonymous"`,
  never welcomed on this device) gets the same page in Home's place, after the
  splash. It replaces the old welcome dialog (three buttons, two of which did
  the same thing). The server still renders Home, so crawlers and every
  returning reader get Home's content. Signed-in readers, device guests and
  anyone already welcomed always get Home. Leaving the landing page by any
  link counts as the welcome.

## The story

1. Promise: "Vous connaissez la Botola. À vous de jouer." (the app's `vous`
   voice is kept; the brief's `tu` would clash with every other screen).
2. The product: the real pitch, plates and shirts from the builder holding a
   **labelled demonstration** XI — positions and shirt numbers, generic
   colours, no player, club, price or points. Tapping a shirt moves the
   captain's armband (×2), announced to screen readers.
3. Three steps tied to what the builder enforces (`SQUAD_RULES`) and an
   extract of the v1 scoring (midfielder goal 5, assist 3, defender clean
   sheet 4).
4. Reasons to come back: Botola Pro players only, private leagues by code,
   transfers and captain before every deadline.
5. Prizes: rendered **only when `api.fantasy_prizes` lists open prizes**, by
   their database names, with the "100 % gratuit" line and a link to
   `/prizes` and its rules. No amounts on this page.
6. FAQ (native `<details>`): free, joining mid-season, scoring, account,
   deadline; links to `/fantasy/rules` and `/fantasy/help`.
7. The same invitation again; a phone gets a sticky button once the hero's
   has scrolled away (there is no bottom navigation on this page to cover).

Guest access stays: "Voir les matchs" leads to `/matches` without an account.

## The primary action (`landingCta`)

| State                                                         | Button                | Goes to           |
| ------------------------------------------------------------- | --------------------- | ----------------- |
| Session or season still loading                               | placeholder, no label | —                 |
| Visitor (no account)                                          | Créer mon équipe      | `/fantasy/create` |
| Signed in, no team                                            | Créer mon équipe      | `/fantasy/create` |
| Signed in, has a team                                         | Voir mon équipe       | `/fantasy/team`   |
| Season closed, no gameweek, or this gameweek's entries closed | Découvrir le jeu      | `/fantasy`        |

A visitor goes to the builder, not to a sign-up form: the builder already lets
them compose first, keeps the draft on the device, and asks for a free account
on "Enregistrer" with `next=/fantasy/create`; registration, e-mail
verification and profile setup carry `next` back to the builder. The join
deadline under the button is the backend's enrolment gameweek
(`joinTarget`), shown only while it is ahead (`joinDeadlineToShow`).

## Measurement

Seline, names only (no properties, no identifiers), production on
botolago.com only, as before.

| Step                 | Event                                                 | Fires when                                                                                           |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Landing seen         | `landing_view` (+ the `/jouer` page view)             | the page is shown to a visitor without an account (anonymous or device guest), once per mount        |
| Primary action       | `landing_cta_header` / `_hero` / `_final` / `_sticky` | a visitor without an account taps "Créer mon équipe" (not "Voir mon équipe", not a signed-in reader) |
| Sign-up started      | `signup_submitted`                                    | the server accepted the registration                                                                 |
| Sign-up completed    | `signup_verified`                                     | the e-mail code was accepted, or a `type=signup` e-mail link was verified                            |
| Onboarding completed | `profile_setup_complete`                              | a new account's first profile setup is saved (not a later edit from the profile page)                |
| First squad saved    | `fantasy_team_created`                                | `saveTeam` returned ok on `/fantasy/create`                                                          |

Funnel to watch: `landing_view` → any `landing_cta_*` → `signup_submitted` →
`signup_verified` → `profile_setup_complete` → `fantasy_team_created`.

Known limits: a confirmation link using the PKCE `code` flow cannot be told
apart from a sign-in, so `signup_verified` undercounts those;
`profile_setup_complete` covers every new account. Seline events are not tied
to a person, so the funnel is a ratio of counts, not a per-user path.
Everything above is a hypothesis until there is post-release data.

## Verified locally (2026-10-03)

- Mock dev server: first visit at `/` shows the landing page; the language
  chooser opens over it; returning to `/` shows Home; hero CTA → builder;
  register `?next=/fantasy/create` → code → profile setup → back to the
  builder; a signed-in manager gets "Voir mon équipe", no "Se connecter", and
  Home at `/`.
- FR and AR at 320, 390, 768 and 1440: no horizontal overflow, no console
  errors, RTL mirrored, one H1, focus visible, no running animation under
  reduced motion, no tap target under 44px.
- Production build against the stub backend (`tests/e2e/built-output-*`),
  390×844, 4× CPU, throttled network, 5 runs each, medians. Local lab
  measurements, not production Core Web Vitals:

  | Page                         | `main` LCP / CLS | branch LCP / CLS |
  | ---------------------------- | ---------------- | ---------------- |
  | `/` first visit, splash      | 5980 ms / 0.310  | 2088 ms / 0.006  |
  | `/` first visit, no splash   | 5896 ms / 0.315  | 2188 ms / 0.006  |
  | `/` returning visitor (Home) | 2064 ms / 0.266  | 2072 ms / 0.257  |
  | `/jouer`                     | —                | 2044 ms / 0.062  |

  Script on `/` (gzip, every chunk the page loads): first visit 433 → 448 KB
  (+15 KB: `LandingPage` 5.8, `JerseyVisual` 2.0, the prize client and its
  schemas about 3, icons and helpers); returning visitor 433 → 435 KB (+2 KB, the
  new French copy in the dictionary chunk).

## Loading

The landing page is its own chunk on `/` (`lazy`), so signed-in and returning
readers do not download it. A first visit without an account starts the
download as soon as the session resolves, while the splash plays; until it
arrives the screen is the hero's dark ground (Home as the fallback measured
CLS 0.10 — it kept loading and moving underneath). A chunk that fails to load
falls back to Home. `/jouer` imports the page directly; the route is already
its own chunk.

## Not verified

- **A visitor saving a squad and being asked for an account**: mock mode saves
  without an account, and the stub backend has no players. The code path is
  unchanged from before; it needs the staging journey
  (`tests/e2e/fantasy.journey.e2e.ts` with `E2E_FANTASY_*`).
- **A first team saved against a real backend**, and therefore
  `fantasy_team_created` firing in production.
- The closed-entries and no-team states were checked by unit tests
  (`landing-cta.test.ts`), not in a browser.

## Gaps found, not changed here

- **Production entries are closed right now**: on 2026-10-03 the live hub is
  on Journée 1 (provisional, deadline 24 Sept) with no enrolment gameweek, so
  nobody can create a team; the landing page says "inscriptions fermées" and
  offers "Découvrir le jeu" until the backend opens one.
- `OAUTH_PROVIDERS_ENABLED` is `true` while its own note says Google and Apple
  were not enabled in production Supabase; the landing page does not mention
  them, but the sign-in pages still show the buttons. Verify before promoting.
- `fantasy.rules.scoring_desc` says a goalkeeper's goal is 6 points; the v1
  ruleset says 10. The prize terms' tie-break differs from `/fantasy/rules`.
