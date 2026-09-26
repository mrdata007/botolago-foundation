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
| `claude/pepites-frontend`      | The pages in French and Arabic, reveal, email switch, share      |
| `claude/pepites-admin`         | Staff screens, admin lists migration, photo upload function      |

Out of v1, as agreed: compare, player follows, detailed match statistics.

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

| Check                                                                                                                                                                     | Result                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pgTAP, whole suite on a fresh database                                                                                                                                    | 103 files, 3 247 assertions, all pass                                                                                                                                |
| `supabase db lint` (app, api, app_private)                                                                                                                                | no errors                                                                                                                                                            |
| Real-database scripts (editions concurrency, weekly email end to end)                                                                                                     | 9 pass                                                                                                                                                               |
| Unit tests (`bun run test`)                                                                                                                                               | 0 failures (3 791 pass, 12 skipped, measured on the combined tree)                                                                                                   |
| Typecheck, lint, i18n gate, generated types, migrations check, build                                                                                                      | pass                                                                                                                                                                 |
| `tests/e2e/pepites.e2e.ts` (sample data, 9 tests)                                                                                                                         | pass, 4 runs (3 on a reused server, 1 as CI runs it)                                                                                                                 |
| `tests/e2e/pepites.local-stack.e2e.ts` (real local database, 2 tests)                                                                                                     | pass, 3 runs in a row, reseeded before each                                                                                                                          |
| Existing CI browser suites with Pépites off                                                                                                                               | 58 pass, 1 skipped                                                                                                                                                   |
| Upload function unit tests                                                                                                                                                | 5 pass                                                                                                                                                               |
| Visual check at 390 px, French and Arabic (home, ranking, player with photo and with silhouette, matches, method, share sheet and image, admin editor, data desk, photos) | nothing off screen, no browser errors; fixed on the way: Latin names in Arabic lines ("Achraf V."), the score direction ("90 /100"), the detailed position as a word |

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
10. A native review of the Arabic copy, and the brand name in Arabic
    ("Pépites" is kept in Latin script, as in the email).

Follow-ups (not blocking): a server-rendered `og:image` for link previews;
the declared foreign key from confirmations to observations (§13).
