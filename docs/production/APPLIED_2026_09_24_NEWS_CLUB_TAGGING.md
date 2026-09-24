# Production: news club tagging applied (2026-09-24)

Three migrations from PR #194 were applied to Production V2 (`tkewgajrljbwgwedqsxn`)
on 2026-09-24, between 15:36 and 15:43 UTC, by Claude Code at the owner's request:

| Version          | File                                          | What it does                                                        |
| ---------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| `20260924180000` | `20260924180000_news_story_team_tagging.sql`  | the club alias list, the headline matcher, the re-tagging trigger   |
| `20260924180100` | `20260924180100_news_feed_filters_first.sql`  | the club news feed applies its filters before the publication check |
| `20260924180200` | `20260924180200_news_story_team_backfill.sql` | tags the stories that already existed                               |

These files are now applied and must not be edited. A change to them is a new
migration.

## How

The route `CLAUDE.md` allows besides the promoter: guarded scripts, each run whole.

- [`apply-20260924180000-news-club-tagging.sql`](../../scripts/backend/apply-20260924180000-news-club-tagging.sql)
  applies the first two migrations in one transaction.
- [`apply-20260924180200-news-club-tagging-backfill.sql`](../../scripts/backend/apply-20260924180200-news-club-tagging-backfill.sql)
  applies the third in a transaction of its own.

The split is deliberate. Adding `tagged_by` locks `app.story_teams` against every
reader until its transaction ends, and every news card reads that table. Alone,
the first transaction holds that lock for a fraction of a second (0.13 s for the
whole script locally). With the backfill inside, it would have held it for the
whole backfill.

Each script:

1. refuses to run twice, out of order, or on a database missing what it builds
   on. The first also requires `api.news_feed` to hash to the version the fix
   replaces, and all 21 clubs of the alias list to exist;
2. bounds its lock timeout (5 s) and statement timeout (60 s, then 300 s);
3. records its migration files in `supabase_migrations.schema_migrations`, each
   whole as `statements[1]`;
4. runs them from that record, once its sha256 matches the repository file, so
   the SQL that ran is the SQL recorded;
5. checks the result before it can commit.

Both scripts ship ending in `rollback;`. Each was run like that first as a
rehearsal. Production was then re-read to confirm nothing had stayed, and the
script was run again with `commit;`.

The scripts were sent through the Supabase SQL API. That API turns `\uXXXX` in a
request into the character it names. Four lines of the tagging migration use
such escapes in regular expressions (`'[ً-ٰٟـ]'` and
`'[ء-ي]'`).

- **First attempt:** those escapes arrived as characters, and the sha256 check
  stopped the rehearsal before anything ran. Production was re-read afterwards:
  unchanged, and no session was left open.
- **Retry:** on those four lines the backslash itself was sent escaped
  (`\`), so the database received the committed bytes. The sha256 checks
  passed, and the recorded `statements[1]` hash to the files (below).

Someone pasting the scripts into the SQL editor is not affected.

## Before starting

Nothing else was writing to production:

- **Claude sessions:** no other session was running.
- **GitHub Actions:** the only run in progress was this PR's CI, which uses its
  own database.
- **pg_cron:**
  - `news-publish-due-editions` (every minute) had nothing to publish: no edition
    was due within the hour.
  - `notification-email-tick` and `football-live-refresh` are switched off (email
    mode `off`, `football_live_refresh_enabled` false).
- **Database sessions:** no other client session was active.
- **Fantasy orchestrator:** it runs at :12 past each hour. The writes ran between
  :36 and :43.
- **News data:** the last change to news editions was at 12:57:54 UTC. It was the
  same after the apply.

Before writing anything, production was compared with the local database the
scripts were rehearsed on. The two matched on:

- the definition hash of `api.news_feed`;
- the 5 news and search functions the migrations build on;
- the 4 existing triggers on `app.story_teams` and `app.article_editions`.

## Baseline and result

| Read at                          | Before (15:36 UTC)                | After (15:42 UTC)                                        |
| -------------------------------- | --------------------------------- | -------------------------------------------------------- |
| migration history rows           | 87                                | 90: the three versions above                             |
| stories / news editions          | 14,302 / 15,798                   | 14,302 / 15,798                                          |
| `app.story_teams`                | 23 rows (fingerprint `79d2922e…`) | 16,097 rows on 11,092 stories; the 23 original rows kept |
| stories naming exactly one club  | n/a                               | 6,640                                                    |
| search documents refreshed       | n/a                               | 12,323                                                   |
| `api.news_feed` definition (md5) | `f822661c…` (20260924170000)      | `c393e148…`, the same as a local build of the repository |

The tagged counts are exactly the read-only preview's (11,092 stories, 16,097
links, 6,640 with one club). Links per club go from 3,558 for Raja and 3,184 for
Wydad down to 12 for Amal Tiznit and 11 for Widad Témara. Every link is a
`headline` row, and no `editor` row exists.

The rest of the first transaction's checks:

- 164 club aliases for 21 clubs, and 15 stop phrases;
- the alias table has forced row security, and no API role can read it;
- `tagged_by` defaults to `'editor'`;
- the trigger exists;
- the tagger's functions are not executable by any API role;
- visitors can still run `api.news_feed`;
- the matcher finds Wydad and Raja in a derby headline.

Postgres re-analysed `app.story_teams` by itself at 15:42:47 UTC.

## The club news feed, from outside

Anonymous `POST /rest/v1/rpc/news_feed` with a page of 3, timed from a cloud
container. The times include the network.

| Club, language       | Before                       | After                 |
| -------------------- | ---------------------------- | --------------------- |
| Wydad, Arabic        | HTTP 500 `57014` after 4.0 s | 200, 3 stories, 1.3 s |
| Wydad, French        | 200, 0 stories, 2.9 s        | 200, 3 stories, 0.8 s |
| Widad Témara, Arabic | HTTP 500 `57014` after 3.7 s | 200, 3 stories, 0.3 s |
| Widad Témara, French | 200, 0 stories, 1.6 s        | 200, 3 stories, 0.5 s |
| all clubs, Arabic    | 200, 3 stories, 0.5 s        | 200, 3 stories, 0.4 s |

Inside the database, a page of 20 Wydad stories in Arabic took 94 ms (read-only
`EXPLAIN ANALYZE`, afterwards).

## Evidence before production

- **Local rehearsal.** The scripts were rehearsed on a local database holding
  main's 87 migrations, the 21 clubs, and 15,769 published stories. There:
  - the rehearsals left nothing behind;
  - a changed character, and running the scripts out of order, were both refused;
  - the committed runs applied (0.13 s and 17 s);
  - second runs were refused;
  - the recorded `statements[1]` hashed to the files.
- **All 90 migrations locally:** database tests passed 1,706/1,706, and
  `bun test` passed 2,588/2,588.
- **CI:** `database-quality` and `application-quality` passed on the commit that
  added the scripts (`7719e91`).

[`apply-news-club-tagging-scripts.test.ts`](../../scripts/backend/apply-news-club-tagging-scripts.test.ts)
keeps the scripts carrying these exact files, and keeps them shipping as
rehearsals. It also pins the files to the hashes production recorded.

## Check it yourself

```sql
select version, name, encode(sha256(convert_to(statements[1], 'UTF8')), 'hex') as file_sha256
from supabase_migrations.schema_migrations
where version in ('20260924180000', '20260924180100', '20260924180200')
order by version;
-- expect three rows:
--   20260924180000  news_story_team_tagging   9951d07eae04d9a5151e6fb99f6cfd96d2277432413fa882c345f97a220f3abd
--   20260924180100  news_feed_filters_first   97d34f464834ee0e34a05e7ec207b731d7703a477d23ec06cb3d06c7a48f35f8
--   20260924180200  news_story_team_backfill  33da33e73de411f87b060cf53494447766f09f81920fe6ce1d03ea21b7443b22

select count(*) as links, count(distinct story_id) as stories, count(*) filter (where tagged_by = 'editor') as editor_links
from app.story_teams;
-- 16,097 / 11,092 / 0 on 2026-09-24; from then on, every new or retitled edition tags its story
```

## What the live site shows differently

The tags are read at once by what is already deployed. No code change is needed.

- **News page club filter:** it calls `api.news_feed` with the club, and now
  lists the club's stories instead of timing out or showing none.
- **News cards:** a story that names exactly one club shows that club's crest
  (6,640 stories).
- **Article page, related articles, club filter row and search:** they read the
  same tags.

Tags send no notification. `followed_team_article` events have an audience rule,
but nothing in the database, the edge functions or the app creates them.

## Not covered

- **Club pages:** the frontend of PR #194 was not deployed by this. It goes out
  when the PR is merged and published.
- **Changing the alias list:** to re-tag every story afterwards, run
  `select * from app_private.news_retag_all_story_teams();` once. That is a
  production write in its own right.
