# Screen brief: honest promises (reminders, e-mails, the Fantasy Cup, the store line)

> **Note, 2026-10-07, after review.** The owner decided to keep the Fantasy
> Cup. Item 3 below ("The Cup goes") is reverted: "Ligues & Coupes", the
> Coupes tab, a league's Coupe tab, the hub's Cup card, the cup explainer
> and its keys are back exactly as on `main`, and the documents say so. The
> rest of this brief (reminders and e-mails) stands. The
> `fantasy-leagues__m-ar-light` before/after pair no longer shows a change
> and was removed from `shots/`.

Owner request, 2026-10-07: "go" on the critique plan
(`.impeccable/critique/2026-10-06T20-00-17Z__src-routes.md`, item P1 "Copy
promises features that are switched off", command `/impeccable harden`, with
`clarify` for the wording). This brief was written after inspecting the
screens and before any interface change (AGENTS.md, "Screen work", rule 3).

- Branch: `claude/honest-promises`, from `origin/main` at `1c12b5b`.
- Scope: what the screens promise. No database, RPC or migration change; no
  Fantasy rule, scoring or gameweek change; no token, logo or brand change.

## Facts this rests on (read-only checks by the orchestrator, 2026-10-07)

- Production `app_private.notification_email_settings.mode` is `off` since
  2026-10-04. No notification e-mail is planned or sent, and the in-app inbox
  very probably receives nothing either: its rows are created by the e-mail
  tick (or by push, which is also off).
- Google and Apple sign-in are enabled in production Supabase Auth (public
  `/auth/v1/settings`). The comment beside `OAUTH_PROVIDERS_ENABLED` that says
  "provider is not enabled" is out of date.
- Account deletion: migration 20261006143700 is applied and erasure is on, so
  "sous 7 jours" on `/suppression-compte` is true.
- The Fantasy Cup and public leagues have no backend: there is no cup in the
  database, the client creates only private leagues, and joining accepts only
  private codes (`docs/product/PRODUCT_CONTEXT_2026-10-05.md`, §3).
- No phone build has run, so the app is on neither the App Store nor Google
  Play.

## What exists today (inspected on untouched `main`, port 5302, signed out)

Captured 390×844 and 1440×900, French and Arabic, light, plus phone French
dark (`docs/engineering/tasks/honest-promises/shots/*__before.png`).

- **Reminder bell.** `MatchReminderBell` is drawn by `MatchCard` on every
  `list` / `row` match row of a scheduled match with a confirmed kick-off.
  Measured: 3 bells on Home's "À venir", 3 on the landing page's "Matchs"
  rows (`/jouer`), 2 on a club's Matchs tab. The row reserves `pe-14`
  (56px) for it. Signed out, a tap asks for an account "pour être rappelé
  avant le match"; signed in it saves a match subscription and toasts
  "Vous serez prévenu(e) environ une heure avant le coup d'envoi".
- **Pépites.** `/pepites` shows a "Le Top 10 par e-mail" card ("Un e-mail
  par semaine avec le nouveau Top 10…", "Se connecter pour l'activer"); signed
  in it is a switch whose toast says "Vous recevrez le Top 10 chaque
  semaine". The follow sheet on a player page says "…recevoir le Top 10 du
  lundi…".
- **`/notifications`.** Signed out: "Vos rappels de match et alertes Fantasy
  arrivent ici." Signed in, empty: "Vos rappels de match, alertes Fantasy et
  actualités de vos clubs apparaîtront ici."
- **Sign-up step 3 (`/auth/profile-setup`).** Three category boxes ("Alertes
  match", "Actualités importantes", "Rappels Fantasy") and "Recevoir par
  e-mail", saved on "Terminer". Profile's "Notifications n/3" row opens this
  step. (Signed in only: read from source, not rendered.)
- **Fantasy hub, signed in.** A "Notifications" block: "Recevez par e-mail un
  rappel avant chaque date limite et le bilan de chaque journée…" with two
  switches. (Source only.)
- **Admin Pépites.** "Publier maintenant" asks for confirmation with "Tous les
  lecteurs le verront tout de suite, et l'e-mail part aux abonnés."
- **Fantasy leagues.** The page is titled "Ligues & Coupes" (Arabic
  "الدوريات والكؤوس") in its header and page title, with a Ligues | Coupes tab
  pair; the Coupes tab explains a cup that does not exist. A league page has a
  Coupe tab whose pill invents a rolling start ("La coupe démarre à la
  Journée {gw+1}") above the same explainer and its tiebreaks. The signed-in
  hub's "Mes ligues" ends with a "Coupes" card ("Vous n'êtes pas encore
  qualifié pour la coupe"). Rankings links to the page as "Ligues & Coupes".
- **Prize terms** (`src/content/legal/prize-terms.ts`, version 1.2 in force
  since 6 October 2026) describe the organiser as "éditeur de l'application
  sur l'App Store et sur Google Play".

## What must be preserved

- Everything above comes back exactly as it is today when e-mail goes live:
  one switch, flipped in one place, restores every bell, card, switch, toast
  and sentence. Nothing is deleted from the reminder, Pépites e-mail or
  notification-settings code paths.
- Stored settings stay stored: the profile's three categories and the e-mail
  channel are neither changed nor written by these screens while the switch
  is off ("Terminer" saves the categories exactly as loaded).
- Match rows keep their anatomy (club edges, time column, stacked teams,
  scores); without the bell they take the space back rather than leaving a
  hole.
- Leagues: private leagues, joining, creating, invite codes, the general
  ranking row, the league standings and the league's Pronostics tab are
  unchanged. Head-to-head stays the disabled "later" option it is.
- Account-deletion copy, Google and Apple buttons, and every Fantasy rule,
  score and deadline stay as they are.
- BotolaGO's identity: kit primitives and tokens only, French and Arabic with
  right-to-left layout, light and dark.

## Improvements being made

1. **One switch for "notification e-mail is really being sent".**
   `NOTIFICATION_EMAIL_LIVE` in `src/lib/feature-flags.ts` (pattern:
   `DARK_MODE_ENABLED`), `false` today, with a comment telling the owner to
   turn it on when the notification e-mail mode goes `live`, and that step
   added to "Switching it on" in `docs/backend/EMAIL_NOTIFICATIONS.md`. No
   database or RPC change.
2. **While it is off, nothing promises a reminder or an e-mail:**
   - no reminder bell on any match row (Home, `/matches`, clubs, landing);
     the row's reserved end padding goes with it;
   - no Pépites weekly e-mail card (and so no toast); the follow sheet drops
     "recevoir le Top 10 du lundi";
   - `/notifications` says plainly that match reminders and Fantasy alerts
     are not sent yet, signed in and signed out;
   - sign-up step 3 shows that sentence instead of the four boxes; Profile's
     row reads "Notifications — Pas encore actives" and opens nothing;
   - the Fantasy hub's e-mail reminder block (and its loading placeholder) is
     not drawn;
   - the admin "Publier maintenant" prompt no longer says an e-mail goes out.
3. **The Cup goes.** "Ligues & Coupes" becomes "Ligues" in both languages
   (header, page title, Rankings link); the Coupes tab on `/fantasy/leagues`,
   the Coupe tab and its invented date on a league page, and the hub's Cup
   card are removed, with the cup explainer and its keys.
4. **The OAuth comment** is corrected (providers enabled; checked
   2026-10-07). The flag and buttons are unchanged.
5. **Prize terms:** checked against how legal documents are versioned; the
   result is recorded in the Validation section (edit only if safe).

## Acceptance criteria (visual and functional)

Visual:

- Home, `/jouer`, a club's Matchs tab: no bell; the club edge at the end of
  each row is the row's last element, and team names are not cut, at 390 and
  1440, French and Arabic (the bell's side mirrors in Arabic, so the freed
  space is on the left there).
- `/pepites`: the page goes from "Voir le classement complet" straight to the
  method note; no empty card or gap.
- `/notifications`, signed out: the same card, with the new sentence.
- `/fantasy/leagues`: header "Ligues" / "الدوريات"; no tab strip.
- No horizontal overflow introduced (measured with element rects, not
  `scrollWidth`, since `overflow-x: clip` is set); dark mode shows no new
  surface or colour.

Functional:

- With the switch off: the conditions above hold in render tests (React
  server render) for the hub block, the Pépites card, the bell and the
  notification copy; with it on (tests can render that state), the same
  components render exactly today's markup.
- `bun run typecheck`, `bun run lint`, the i18n gate (no change to its W1–W4
  counts) and the full `bun run test` pass. The two Pépites e2e checks of the
  e-mail switch and the Fantasy journey's "Ligues & Coupes" heading are made
  switch-aware / updated rather than deleted.

## Validation (2026-10-07)

Measured on this branch's dev server (`vite dev --mode production`, port 5302,
production data read with the public key, signed out, nothing submitted),
Chromium, reduced motion. Variants: 390×844 and 1440×900, French and Arabic,
light, plus 390 French dark.

### Checks run

- `bun run typecheck`: passes (no output from `tsc --noEmit`).
- `bun run lint`: 0 errors, 31 warnings, none in a file this branch changes.
- `bun scripts/qa/i18n-gate.ts`: pass; W1 7, W2 7, W3 252, W4 64, each at its
  baseline (the ten Cup keys are deleted from both dictionaries, every new key
  is called literally).
- `bun test src/components/fantasy src/components/common src/components/pepites
src/i18n src/routes src/lib/feature-flags.test.ts
src/lib/notification-email-live.test.tsx`: 1041 pass, 0 fail.
- `bun run test` (whole suite): 6021 pass, 17 skip, 1 fail. The failure is
  `src/backend/news/editorial-session.test.ts`, "Morocco's Ramadan clock
  change is followed": it expects `(GMT)` and this runtime's `Intl` prints
  `(GMT+0)`. It fails the same way run alone; nothing under `src/backend` or
  `src/lib/morocco-time.ts` differs from `origin/main`, and the machine runs
  Bun 1.4.2 where the repository pins 1.3.14. Not caused by this change.
- New `src/lib/notification-email-live.test.tsx` (19 tests): the switch is one
  constant whose comment lists the eight gated files and each reads it through
  `useNotificationEmailLive()`; no shipped file renders the context provider;
  `MatchCard` rendered (React server render) with the switch on shows the bell
  and keeps `pe-14`, with it off shows no bell on any variant and no `pe-14`;
  each other gated file still holds today's branch for the "on" state.
  Mutation check: with the `remindersLive &&` guard removed the "not live"
  test fails (18 pass, 1 fail); restored.
- `FantasyHubPersonal.test.tsx` now runs every visitor case twice, live and
  not live: the owner sees "Notifications" and its two switches only when
  live, the reserved placeholder for the block likewise, and no "coupe" in
  either state.
- `impeccable detect --json` over the eleven changed `.tsx` files: 0 findings.
- Playwright e2e: not run (they need the mock dev server and sign in with a
  test account). The three affected checks were updated to read the switch
  (`pepites.e2e.ts`, `pepites.local-stack.e2e.ts`) or the new title
  (`fantasy.journey.e2e.ts`).

### What was measured

- Reminder bells (buttons with the bell's accessible name), per page and
  variant: before Home 3, `/jouer` 3, a club's Matchs tab 2 (in the four
  variants whose list had loaded); after 0 everywhere.
- Match rows on Home and `/jouer`, 390 and 1440, French and Arabic, from
  element rects: after, the team column's `padding-inline-end` is 4px (56px
  with the bell), no row lies outside the viewport, and no team name is
  clipped (`scrollWidth` against `clientWidth`).
- The switch was set to `true` on the local server only for one run, then put
  back to `false` (never committed): the bells came back (3 per page, 56px
  padding), the Pépites card came back with its text, and `/notifications`
  showed today's sentences. The restoration works in a browser as well as in
  the tests.
- `/pepites`: the e-mail card is present before and absent after in all five
  variants; the page goes from "Voir le classement complet" to the method
  note. The follow sheet reads "Créez un compte gratuit pour suivre ses matchs
  et l'ajouter à votre équipe Fantasy." / "أنشئ حسابًا مجانيًا لتتابع مبارياته
  وتضيفه إلى فريقك في فانتازي."
- `/notifications` (signed out): "Les rappels de match et les alertes Fantasy
  ne sont pas encore envoyés." / "لم يبدأ بعد إرسال تذكيرات المباريات وتنبيهات
  فانتازي." in all five variants, right to left in Arabic.
- `/fantasy/leagues`: header "Ligues" / "الدوريات" (signed out the page shows
  its sign-in gate, as before).
- Horizontal overflow (element rects; `html, body` clip overflow): the only
  elements outside the viewport are Home's carousel slides, `/jouer`'s
  horizontal rail and `/matches`' date strip, the same sets before and after.
- Home logs a hydration-mismatch warning before and after; it is not from
  this change. Dark mode: no new colour or surface; the inbox card reads as
  before with the new sentence.

Evidence in `shots/` (before and after, same frame): `home__m-fr-light`,
`jouer__m-ar-light`, `club-matchs__m-ar-light` (bells gone, rows take the
space back, Arabic mirrored), `pepites__m-fr-light` (no e-mail card),
`notifications__m-fr-dark` (the new sentence, dark), and
`fantasy-leagues__m-ar-light` (the title).

### Not verified, and why

- Signed-in screens could not be rendered (no sign-in in this lane): sign-up
  step 3, Profile's notifications row, the Fantasy hub's e-mail block and Cup
  card, the signed-in inbox, a league page's tabs and the admin prompt. The
  hub is covered by server-render tests in both states; the others by source
  tests and typecheck.
- Real phones, WebKit/Safari and the phone app. Step 3's push box only
  renders inside the app and is unchanged.

### Prize terms: not edited

`src/content/legal/prize-terms.ts` section 1 says the organiser is
"éditeur de l'application sur l'App Store et sur Google Play" (Arabic: "ناشر
التطبيق على App Store وGoogle Play"). No phone build has run, so the app is
on neither store. The document is versioned by hand ("Version 1.2 — en
vigueur au 6 octobre 2026"), was written the day before for the store
submission (Apple guideline 5.3.2: the developer must be the contest's
sponsor), and binds every Fantasy prize entrant through section 7 of the
General Terms. Rewording how the organiser is identified changes the legal
meaning of a rule in force, needs a version 1.3 with a new date, and is the
owner's call, so it is left as it is and reported.

### Account deletion: checked, unchanged

The confirmation e-mail on `/suppression-compte` is sent by the
`account-deletion-worker` straight through Resend, not through the
notification e-mail pipeline, so `mode = off` does not stop it. It does need
the `RESEND_API_KEY` secret; without it accounts are still erased and the
e-mail is recorded as `not_configured`. Whether that secret is set in
production is not recorded anywhere this lane could read.
