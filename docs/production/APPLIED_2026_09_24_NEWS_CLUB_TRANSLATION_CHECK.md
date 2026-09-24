# Production: news club tags checked against the original article (2026-09-24)

Two migrations from PR #196 were applied to Production V2 (`tkewgajrljbwgwedqsxn`)
on 2026-09-24, between 19:32 and 19:40 UTC, by Claude Code at the owner's request:

| Version          | File                                                   | What it does                                                                                                                                   |
| ---------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260924190000` | `20260924190000_news_story_team_translation_check.sql` | a translated headline adds a club only if the original article names it; four Arabic spellings join the alias list; editing an article re-tags |
| `20260924190100` | `20260924190100_news_story_team_retag.sql`             | tags every existing story again under that rule                                                                                                |

These files are now applied and must not be edited. A change to them is a new
migration.

## Why

The first tagging ([APPLIED_2026_09_24_NEWS_CLUB_TAGGING.md](APPLIED_2026_09_24_NEWS_CLUB_TAGGING.md))
took a story's clubs from every edition's headline. Some French editions are
machine translations of the Arabic original, and a few turned one club's name
into another's: "اتحاد تواركة" (UTS Rabat) became "IR Tanger" or "Union Yacoub
El Mansour", for instance. The story then showed on the wrong club's page.

In production, 64 story–club links came from a translation's headline alone.
Each was judged by hand against the original article: 53 right, 11 wrong. The
new rule keeps a translation's club only when the original article's title or
text names it. That drops the 11 wrong ones. The four new Arabic spellings
(two for UTS Rabat, two for Amal Tiznit) let the original confirm 9 of the 10
right ones the rule would otherwise lose. The tenth, a FUS Rabat story whose
original says only "الفتح", is a known loss: that name alone is not safe to
match.

## How

The route `CLAUDE.md` allows besides the promoter: guarded scripts, each run whole.

- [`apply-20260924190000-news-club-translation-check.sql`](../../scripts/backend/apply-20260924190000-news-club-translation-check.sql)
  applies the rule in one transaction. Replacing the trigger makes writers of
  `app.article_editions` wait until that transaction ends (readers never wait),
  so it does no bulk work.
- [`apply-20260924190100-news-club-retag.sql`](../../scripts/backend/apply-20260924190100-news-club-retag.sql)
  re-tags the existing stories in a transaction of its own. It only adds and
  removes `app.story_teams` rows, so readers are never blocked.

Each script:

1. refuses to run twice or out of order. The first also requires the tagger's
   three functions to hash to the versions it replaces, and the four new
   spellings to be absent;
2. bounds its lock timeout (5 s) and statement timeout (60 s, then 300 s);
3. records its migration file in `supabase_migrations.schema_migrations`, whole
   as `statements[1]`;
4. runs it from that record, once its sha256 matches the repository file;
5. checks the result before it can commit. The second checks all 64 judged
   links one by one: the 11 wrong ones gone, the right ones kept except the
   known loss, and all 64 stories present.

Both scripts ship ending in `rollback;`. Each was run like that first as a
rehearsal. Production was then re-read to confirm nothing had stayed, and the
script was run again with `commit;`.

The scripts contain no backslash, so the Supabase SQL API's rewriting of
`\uXXXX` (see the first record) cannot touch them. A test keeps it that way.

| Time (UTC) | Step                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------- |
| 19:31:54   | baseline read                                                                                 |
| 19:32:56   | first script, rehearsal: passed                                                               |
| 19:33:05   | re-read: no history row, no new function, 164 aliases, links unchanged                        |
| 19:34:07   | first script, committed (about 2 s)                                                           |
| 19:34:19   | checked: history row, 168 aliases, new function, trigger watches the text, links unchanged    |
| 19:35:21   | second script, rehearsal: passed                                                              |
| 19:38:38   | re-read: no history row, links unchanged (fingerprint `020e3be7…`); baseline for the write    |
| 19:39:43   | second script, committed (about 14 s): "Applied. 11099 stories tagged with 16102 club links." |
| 19:40:18   | checked (below)                                                                               |

## Before starting

Nothing else was writing to production:

- **Claude sessions:** one other session was working, on its own local
  database (a product and search audit). Production showed no other client
  session at any read except one short query at 19:33:05, gone by 19:33:12.
- **GitHub Actions:** nothing in progress. The fantasy orchestrator's hourly
  run had ended at 19:07.
- **pg_cron:**
  - `news-publish-due-editions` (every minute) had nothing to publish: no
    edition was due within the hour.
  - `notification-email-tick` runs with email mode `off`, so it writes nothing.
  - `football-live-refresh` is switched on for the evening's match. It runs at
    :00, :15, :30 and :45, and writes match data, not news. It took under
    0.1 s at 19:30. Both writes ran between that run and the next.
- **News data:** the last change to stories and news editions was at 12:57:54
  UTC. It was the same after.

## Baseline and result

| Read at                             | Before (19:31 / 19:38 UTC)                               | After (19:40–19:43 UTC)                                  |
| ----------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| migration history rows              | 90                                                       | 92: the two versions above                               |
| stories / news editions             | 14,302 / 15,798                                          | 14,302 / 15,798                                          |
| club aliases / stop phrases / clubs | 164 / 15 / 21                                            | 168 / 15 / 21                                            |
| `app.story_teams`                   | 16,097 links on 11,092 stories (fingerprint `020e3be7…`) | 16,102 links on 11,099 stories (fingerprint `93e325ad…`) |
| `editor` links                      | 0                                                        | 0                                                        |

The first script changed no link: the fingerprint was the same before and after
it. All the changes below are the second script's.

| Club              | Before | After | Change                                        |
| ----------------- | -----: | ----: | --------------------------------------------- |
| UTS Rabat         |    399 |   406 | 7 mistranslations removed, 14 new links added |
| Amal Tiznit       |     12 |    15 | 3 new links added                             |
| Kawkab Marrakech  |    143 |   141 | 2 mistranslations removed                     |
| FUS Rabat         |    274 |   273 | the known loss                                |
| Ittihad Tanger    |    870 |   869 | 1 mistranslation removed                      |
| Yacoub El Mansour |    103 |   102 | 1 mistranslation removed                      |
| the other 15      |        |       | unchanged                                     |

Exactly 12 links were removed: the 11 judged wrong and the known loss. A
read-only check at 19:43 confirmed it from the other side. In the 1,496 stories
that have an edition in the original language and one in another, 55 club
links now come from a translation's headline alone. 43 of them are kept (the
original article names the club). The 12 dropped are exactly those listed
above. No tagged link lacks a headline naming its club.

The 17 new links come from the new spellings in the original Arabic headlines
(14 for UTS Rabat, 3 for Amal Tiznit). Each one read at 19:41 names the club.

## The club news feed, from outside

Anonymous `POST /rest/v1/rpc/news_feed`, one request at a time, a page of 20,
at about 19:45 UTC. The times include the network.

| Club, language      | Result                 | The removed stories               |
| ------------------- | ---------------------- | --------------------------------- |
| Kawkab, French      | 200, 20 stories, 1.2 s | neither of Kawkab's 2 on the page |
| Kawkab, Arabic      | 200, 20 stories, 0.7 s | neither on the page               |
| UTS Rabat, French   | 200, 20 stories, 0.8 s | two present, rightly: see below   |
| UTS Rabat, Arabic   | 200, 20 stories, 0.5 s | one present, rightly              |
| Amal Tiznit, Arabic | 200, 15 stories, 2.9 s | n/a (all 15 of its links)         |
| Wydad, Arabic       | 200, 20 stories, 0.4 s | n/a                               |

The two stories on the UTS Rabat page are the ones whose French headline named
Ittihad Tanger and Union Yacoub El Mansour. Their Arabic originals name UTS
Rabat, so they belong there. They no longer show under the wrong clubs.

## Evidence before production

- **Local rehearsal:** on a production-like local database the scripts'
  rehearsals left nothing behind; out of order was refused; the committed runs
  applied (0.1 s and about 6 s); second runs were refused; the recorded
  `statements[1]` hashed to the files.
- **Tests:** a new pgTAP file
  (`supabase/tests/database/news_story_team_translation_check.test.sql`) covers
  the rule. The full re-tag gives the same result as re-tagging each story
  alone. That was also checked on a local copy of 15,771 real stories, and on
  3,000 random ones.
- **CI:** `database-quality` and `application-quality` passed on PR #196's
  commit `94fa659`, the scripts as applied.

[`apply-news-club-tagging-scripts.test.ts`](../../scripts/backend/apply-news-club-tagging-scripts.test.ts)
keeps the scripts carrying these exact files, and keeps them shipping as
rehearsals. It also pins the files to the hashes production recorded.

## Check it yourself

```sql
select version, name, encode(sha256(convert_to(statements[1], 'UTF8')), 'hex') as file_sha256
from supabase_migrations.schema_migrations
where version in ('20260924190000', '20260924190100')
order by version;
-- expect two rows:
--   20260924190000  news_story_team_translation_check  7d7270bfbcad007af84ea4204e0b92fee5af87e884990b85000de77a2aefb760
--   20260924190100  news_story_team_retag              52306c742524d60ac145e93a4102cc39534fb776f2fa8395b3aa6bbf14bc4440

select count(*) as links, count(distinct story_id) as stories, count(*) filter (where tagged_by = 'editor') as editor_links
from app.story_teams;
-- 16,102 / 11,099 / 0 on 2026-09-24; from then on, every new or edited edition re-tags its story
```

## What the live site shows differently

The tags are read at once by what is already deployed.

- **Club pages and the news club filter:** the 11 mistranslated stories no
  longer appear under the wrong club; UTS Rabat and Amal Tiznit gain 17
  stories.
- **News cards:** the crest shown on a one-club story follows the same tags.

## Not covered

- **The club page changes of PR #196** (aligned tiles on `/clubs`, the season
  wording for promoted and relegated clubs): they go out when the PR is merged
  and published.
- **Changing the alias list again:** to re-tag every story afterwards, run
  `select * from app_private.news_retag_all_story_teams();` once. That is a
  production write in its own right.
