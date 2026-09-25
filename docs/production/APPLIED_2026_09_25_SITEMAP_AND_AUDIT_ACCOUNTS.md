# Production: sitemap answers again; audit accounts deleted (2026-09-25)

Two writes to Production V2 (`tkewgajrljbwgwedqsxn`) on 2026-09-25, by Claude
Code at the owner's request (re-check audit
`docs/audits/2026-09-25-LAUNCH_READINESS_RECHECK.md`, owner actions 1 and 5).

## 1. Migration `20260925100000_news_sitemap_set_based_again` (PR #203)

**Before.** `/sitemap.xml` answered 503 on every request from about 07:00 UTC.
`api.news_sitemap_entries` took 8,424 ms against the 3 s limit visitors' calls
get. In the 07:00 UTC hour, 15 of the 16 API errors were this call.

**Why.** `20260924200600` was written before `20260924163000`'s set-based
rewrite and renumbered after it (3e778ac), so it put the older per-article
version back. The audit's guess, the article-revisions join, was not it: 236
rows, about 20 ms.

**How.** [`apply-20260925100000-news-sitemap.sql`](../../scripts/backend/apply-20260925100000-news-sitemap.sql),
run whole:

| When (UTC) | What                                                                                                                                                   | Result                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| ~07:52     | Rehearsal (first version of the script)                                                                                                                | passed, rolled back; re-read: no history row, old function                                |
| ~07:59     | Rehearsal (with the News write hold added on review)                                                                                                   | passed, rolled back; re-read: no history row, old function, no lock left                  |
| 08:04      | Checked first: no workflow touching production running (only PR #202's CI, on its own local database), no other database session, no article scheduled | —                                                                                         |
| ~08:04     | Apply (`commit;`)                                                                                                                                      | "Applied"; the postflight passed: set-based, callable by visitors, under 2 s, same answer |

**After**, re-read:

- History row `20260925100000 news_sitemap_set_based_again`; its recorded text's
  sha256 is the repository file's (`cc3916bb…`).
- Function md5 `189f5f7b118288532e97d7a6f2829a17` (was `66e94c91…`); `anon` may
  still execute it; no lock left on the News tables.
- `https://botolago.com/sitemap.xml`: 200, 2.7 MB, 15,701 `<loc>` entries,
  2.1–3.0 s end to end, three fetches.

The migration file is now applied and must not be edited. A change is a new
migration.

## 2. The two audit test accounts

`alisarhane73+audit20260924@gmail.com` (`158af604-…`) and
`compak2026+audit20260924@gmail.com` (`594731c6-…`), created by the
2026-09-24 audit.

- **Checked first:** each held one identity, a profile and a preferences row
  (the second also 3 sessions). Neither had a Fantasy team, league, prediction,
  notification, saved article, staff or editorial role, or stored file, so no
  restricting foreign key and no job's table was involved.
- **Dry run:** the delete inside a `DO` block ending in a deliberate `raise`:
  2 deleted, users 28 → 26, nothing left in profiles, preferences, identities
  or sessions. Re-read: both still there, 28 users.
- **Delete:** the same guarded block without the `raise`. It deletes by id
  **and** e-mail and stops unless exactly 2 match.
- **After:** 26 users, 26 profiles, no row left for either id.

Deleting an account cannot be undone.
