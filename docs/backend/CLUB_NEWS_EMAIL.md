# Club news email

Built 2026-10-30 from the owner's request: every reader gets the news about
their favourite club by email. It ships **switched off**.

## What the reader gets

One email a day, at 19:00 Morocco time, listing every article about their
favourite club published since 19:00 the day before. On a day with no article
about the club, no email is sent.

- The newest article leads, with its photo, summary and a "Read the article"
  link. The others follow as smaller rows with a thumbnail when they have a
  photo.
- At most 8 articles are listed. When there are more, the email says how many
  and links to the club page. This keeps the email well under Gmail's 102 KB
  limit; the preview is about 11 KB.
- The club's crest is shown next to its name. The button opens the club page
  (`/clubs/{team id}`), and each article opens `/news/{edition id}`.
- French or Arabic follows the account's language, and Arabic reads right to
  left. When an article exists only in the other language, it is still
  listed, with a "En arabe" / "بالفرنسية" tag, and its title keeps its own
  direction.
- No AI wording, in line with the public editorial rule: the email shows the
  articles' own titles and summaries and adds nothing about how they were
  written.

**Why one email a day, not one per article:** the free Resend plan allows 90
notification emails a day for everyone combined. A busy club can have five or
more articles a day, so one email per article would use up the day's
allowance in a few hours and crowd out the match emails.

## Who receives it

Everything the other emails need (email notifications on, a confirmed
address, an account that is not deleted), plus:

- a **favourite club** (`app.user_preferences.favorite_team_id`). Followed
  clubs do not count, so a reader gets one club email a day at most;
- the **"Actualités importantes" / "أخبار هامة"** switch on
  (`breaking_news`). It is on by default and is already on the onboarding and
  Profile screens, so no new screen was needed.

Both are checked again just before sending. A reader who switches News off,
or changes favourite club, after the email was queued does not get it. The
footer says why the reader receives the email and how to stop it. The
unsubscribe link works like the match emails' link: it turns off all product
email.

## How it works

Migrations `20261030120000_club_news_email_type.sql` (the new type,
`club_news_digest`) and `20261030120100_club_news_email.sql`:

- `app_private.notification_email_plan_club_news(now)` runs inside the
  existing `notification-email-tick` (every 5 minutes) and adds no cron job.
  Between 19:00 and 22:00 Morocco time it plans one moment per club that had
  articles in the window and has at least one fan. The de-duplication key is
  `email:club_news_digest:<date>:<team id>`.
- `app_private.notification_email_club_news_payload(team, from, to)` builds
  the list. An article is counted once, when its first public French or
  Arabic edition went out, so a translation published the next day does not
  send it again. Only editions with visibility `public` that
  `app_private.news_is_public` allows are included.
- The fan-out, claim, staleness and tick functions are patched in place, as
  `20261019111217` did. Each patch checks that its anchor appears exactly
  once and stops the migration otherwise.
- Order when the quota is short: after the kick-off, deadline, match-day and
  Fantasy emails, and before Prospects. An email still unsent four hours
  after 19:00 is cancelled, never sent late at night.
- Images: the Edge Function hands the renderer `SUPABASE_URL`, and Storage
  paths become public Storage addresses (`football-media` for crests,
  `news-media` for article photos). Without it the email is sent without
  photos. Only https images are used.

Design: `supabase/functions/_shared/notification-email-render.ts`
(`clubNewsDigest`, `articlesHtml`) inside the shared branded layout
(`notification-email-club.ts`): the navy band with the BotolaGO wordmark, the
white card, and the mint-to-cyan button. Every colour comes from
`notification-email-brand.ts`.

## Switching it on (owner)

These steps are production writes. They follow `CLAUDE.md` (owner
authorisation for that operation) and `AGENTS.md` (nothing else writing at the
same time).

1. **Done 2026-10-30 08:3x UTC:** migration `20261030120000` (the new type)
   was applied to production and recorded under its own version. Its source
   SHA-256 matches the file (`f8fdce78…`).
2. **Database:** paste `scripts/backend/apply-20261030120100-club-news-email.sql`
   into the Supabase SQL editor and run it once. The last query must show
   `true` everywhere and the SHA-256 written at the top of the script.
3. **Email function:** merge this branch to `main`, then in GitHub → Actions →
   "Fantasy email automation deploy" → Run workflow, give the merged `main`
   commit and type `DEPLOY_FANTASY_EMAIL_AUTOMATION`. It deploys only
   `notification-email-dispatch`, from that commit, after its tests pass.
4. **Switch on.** Production email is in `live` mode with no test accounts,
   so this sends to every eligible reader from the next 19:00:
   ```sql
   update app_private.notification_email_settings
   set enabled_types = array_append(enabled_types, 'club_news_digest')
   where id and not ('club_news_digest' = any(enabled_types));
   ```
5. To switch it off again:
   ```sql
   update app_private.notification_email_settings
   set enabled_types = array_remove(enabled_types, 'club_news_digest') where id;
   ```

To see what it did:

```sql
select summary -> 'plan' -> 'clubNews' from app_private.notification_email_runs
order by started_at desc limit 5;
```

## Known limits

- Many articles have no hero photo. Those show a thin navy bar instead of a
  photo (when leading) or no thumbnail (in the list).
- Some crests are stored as `.webp`, which classic Outlook for Windows does
  not show. The crest is decorative, so nothing is lost but the picture.
- Untested in real inboxes (Gmail, Outlook, Apple Mail). It was checked in a
  browser at desktop and phone widths, in French and Arabic. Send a test in
  `test` mode before going live.
- The database planner, fan-out and claim changes have no pgTAP test yet, and
  the migrations have not been run against a database. CI's
  `database-quality` job will be the first to apply them.

## Previews

`bun scripts/backend/notification-email-previews.ts <output-dir>` writes
`club_news_digest.fr.html` and `club_news_digest.ar.html` with the other
emails.
