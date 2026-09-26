# Pépites v1 — test report and launch requirements

Date: 2026-09-26. Everything below ran on a local Supabase stack and local
development servers. Nothing was applied to production or staging, nothing
was deployed, no email was sent, and no paid plan was touched.

## What is built

| Branch (stacked in this order) | What                                                             |
| ------------------------------ | ---------------------------------------------------------------- |
| `claude/pepites-editions`      | Editions, week lock, tick, publication, cron (mode `off`)        |
| `claude/pepites-weekly-email`  | Opt-in weekly email, unsubscribe topic, 24 h retry safety, quota |
| `claude/pepites-api`           | Access by mode, version pointer, public reads, admin functions   |
| `claude/pepites-photo-job`     | Photo derivatives and deletions (storage job)                    |
| `claude/pepites-frontend`      | The pages in French and Arabic after the Figma, reveal, share    |
| `claude/pepites-admin`         | Staff screens (Figma A1/A2), admin lists, photo upload function  |

Out of v1, as agreed: compare, player follows, detailed match statistics.

## Design: the Figma file "BotolaGO — Pépites (UI)"

The screens follow the Figma file (pages Mobile · FR, Mobile · AR,
Components, Share images, Admin), in French and Arabic:

| Figma frame                                       | Where                                      |
| ------------------------------------------------- | ------------------------------------------ |
| 01 Accueil                                        | `/pepites`                                 |
| 02 Classement complet                             | `/pepites/classement`                      |
| 03 Joueur — Aperçu, 04 — Matchs                   | `/pepites/joueur/…`, `?onglet=matchs`      |
| 06 Révélation du lundi                            | `/pepites/revelation` (new)                |
| 07 Story 9:16, feed Top 10 1080×1350              | the share buttons (player page, Top 10)    |
| S1 chargement, S2 avant la 1re édition, S3 erreur | every page                                 |
| A1 Sélection hebdo, A2 Data desk                  | `/admin/pepites`, `/admin/pepites/donnees` |

Not built, on purpose: 05 Comparer, S4 (sign-in sheet to follow a player),
the "Suivre" and "+ Fantasy" buttons and the "Stats" tab (all out of v1),
and the "Percée" card on the player page: the data has no minutes by half
season. The desktop frames (D1, D2) are not drawn separately: on a wide
screen the pages keep the mobile column, centred.

Two things the Figma decided that the owner should confirm:

- **The Arabic name is "جواهر"** (and "أفضل 10"), as the Arabic frames write
  it; the pages, the share images and the navigation use it. The weekly
  email (`claude/pepites-weekly-email`) still says "Pépites" and "توب 10" in
  Arabic: change it too, or keep the Latin name in the email.
- **Both editor's lines are required.** The staff screen now refuses to
  schedule a Top 10 until each player has a French and an Arabic line (A1
  marks them "obligatoire"). The database does not check it yet; a
  `reasons_missing` problem in the editions functions would make it the
  database's rule too.

## Gate A conditions

1. **The delayed reveal keeps polling, with an e2e test.** Done. The page
   re-reads the pointer on open and on focus, polls during countdown (at the
   reveal time, then every 5 s) and delay (every 30 s), and swaps to the new
   edition without a reload. Tested in the browser on sample data (countdown
   → delayed → published, French and Arabic) and on the real local database
   (a visitor arrives while the edition is late, staff publish, the open
   page shows week 7; the document is the same one).
2. **Complete email integration.** Done (`claude/pepites-weekly-email`);
   the opt-in switch is on the Top 10 page, off until the reader turns it on.
3. **Retry safety inside Resend's 24 h window.** Done (same branch).
4. **Attribute protection.** Done (earlier PR).
5. **Email capacity.** Done in code (quota, account-email reserve,
   deferral); the plan itself is an owner decision (below).

## Results

| Check                                                                                                                                                                                           | Result                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pgTAP, whole suite on a fresh database                                                                                                                                                          | 103 files, 3 247 assertions, all pass                                                                                                                                                                                                                          |
| `supabase db lint` (app, api, app_private)                                                                                                                                                      | no errors                                                                                                                                                                                                                                                      |
| Real-database scripts (editions concurrency, weekly email end to end)                                                                                                                           | 9 pass                                                                                                                                                                                                                                                         |
| Unit tests (`bun run test`)                                                                                                                                                                     | 0 failures (3 813 pass, 12 skipped, on the combined tree after the redesign)                                                                                                                                                                                   |
| Typecheck, lint, i18n gate, generated types, migrations check, secrets check, build                                                                                                             | pass                                                                                                                                                                                                                                                           |
| `tests/e2e/pepites.e2e.ts` (sample data, 13 tests, including the reveal story and the 1080×1920 story card)                                                                                     | pass in 3 full runs, each on a freshly started server; in a fourth, the first test timed out waiting for the server's very first page, before any Pépites check                                                                                                |
| `tests/e2e/pepites.local-stack.e2e.ts` (real local database, 2 tests)                                                                                                                           | pass in 9 of 10 runs, reseeded before each, the last on the redesigned staff screens; the failed run's log was not kept, and the 7 runs after it passed                                                                                                        |
| Existing CI browser suites with Pépites off                                                                                                                                                     | 58 pass, 1 skipped                                                                                                                                                                                                                                             |
| Production bundle smoke test                                                                                                                                                                    | 3 pass                                                                                                                                                                                                                                                         |
| Upload function unit tests                                                                                                                                                                      | 5 pass                                                                                                                                                                                                                                                         |
| Visual check at 390 px, French and Arabic, against the Figma frames (home, ranking, player with photo and with the club shirt, matches, reveal, method, share images, staff screens at 1440 px) | nothing off screen, no browser errors; fixed on the way: Arabic labels falling back to a monospace face, the score on the wrong side in Arabic, the ring mirrored, gradients drawn flat in the share images, Arabic text in the pictures not set right to left |

The local preview runs the real ranking engine on a fictional season: 128
players ranked as of round 6, the same counts on every reseed.

Found and fixed while testing: the admin nationality correction used a
column name instead of the attribute name and always failed
(`claude/pepites-api`, fixed in place: the migration is unapplied outside
local databases); player photos were addressed wrongly and would never have
shown; the method and week pages trusted a server copy instead of re-checking
whether Pépites is open.

## Not verified here

- Anything on production or staging.
- **Resized photos.** The local stack has no image-resizing service (the
  image could not be downloaded here), so the page falls back to the
  silhouette locally; the screenshots and the local-stack test serve the
  original file instead. Production's resizing is the one the rest of the
  site already uses.
- **The photo upload function end to end.** Unit-tested; the local Edge
  Functions were not running. The rest of the photo pipeline (release,
  approval, the photo job, publication) ran for real locally.
- The phone's native share sheet (headless browser); the image, download and
  WhatsApp link were checked.
- The load target of §7 (Monday 20:00 peak), and the versioned JSON cache
  routes it may need (the pages read the RPCs directly today).
- Arabic copy by a native editor.

## Remaining launch requirements (owner)

1. Review, then merge the stacked branches in order.
2. Production migrations through `RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md`,
   dry-run first, one writer at a time: `20260926060000` to
   `20260926140000`.
3. Deploy the Edge Functions: `notification-email-dispatch` and
   `notification-email-unsubscribe` (changed), `player-photo-upload` (new).
4. Data: the provider-B choice for attributes (open item, §12); check date
   of birth coverage on production; set the competition
   (`pepites_configure`); activate the 2025-26 final ranking
   (`pepites_activate_season_final`); let the first weekly run happen.
5. Photos: CNDP coverage of the release process (open item), and the first
   approved releases.
6. Email: approve the opt-in wording (open item) and decide the Resend plan
   for the expected number of subscribers.
7. Staff: grant `pepites.edit` / `pepites.publish` roles; try mode `staff`
   in production first.
8. Launch: `PEPITES_ENABLED` and `PEPITES_PROMOTED` to `true` in code, then
   mode `public`.
9. The load test, and the versioned JSON routes if it fails.
10. A native review of the Arabic copy, and the Arabic name: "جواهر" in
    the pages (the Figma's), "Pépites" in the weekly email; one of the two
    should change.
11. Confirm that both editor's lines are required (the staff screen
    enforces it; the database does not yet).

Follow-ups (not blocking): a server-rendered `og:image` for link previews;
the declared foreign key from confirmations to observations (§13).
