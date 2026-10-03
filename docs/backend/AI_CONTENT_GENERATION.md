# AI-written Botola Pro 1 content

Match previews, match recaps, news reports and blogs, written by Claude in
French and Arabic, published automatically, with an email to the owner for
every article. Migration `20261003150000_ai_content_generation.sql`, Edge
Function `ai-content-generate`, logic in `supabase/functions/_shared/ai-content.ts`.

**Ships switched off.** Nothing is written or published until the owner turns it on.

## How it works

Every 30 minutes pg_cron wakes the function. It asks the database what is worth
writing, has Claude write from the supplied facts only, checks the result,
publishes it, then emails the owner.

| Kind            | Written when                           | Facts given to the model                   |
| --------------- | -------------------------------------- | ------------------------------------------ |
| `match_recap`   | A match finished in the last 24h       | Teams, final / half-time / penalty score   |
| `match_preview` | A match kicks off in 2–30h             | Teams, kickoff, each side's last 5 results |
| `news_report`   | 3+ fresh ingested stories (last 12h)   | Headline, excerpt, outlet name             |
| `blog`          | At most every 3 days, 3+ fresh stories | Same stories + last 10 results             |

## Safeguards

- **Daily cap** (default 6 stories, 1–24) and **kill switch**, both enforced inside
  the database at publish time, not only in the function.
- **Facts only.** The prompt forbids anything not supplied. Every score written
  in the text must be one from the facts; otherwise the article is dropped and
  retried next run.
- **No model HTML.** The model returns plain paragraphs; the function escapes
  them and builds the markup. Source links come from the database, https only.
- **Attribution.** News and blog posts list the outlets used, and every article
  carries an "AI-assisted" line.
- **Owner emails.** Sent to the ops-alert address. A failed send is retried on
  later runs (up to 5 attempts), including while paused.

## Owner set-up (once)

1. Supabase → Edge Functions → Secrets: `ANTHROPIC_API_KEY` (required);
   optional `AI_CONTENT_MODEL` (default `claude-sonnet-5-5`). `RESEND_API_KEY`
   and the ops-alert address (`app_private.ops_alert_configure_email`) already
   serve the other email functions and are required too.
2. Deploy the function and apply the migration through the reviewed path
   ([release runbook](RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md)).
3. Switch on, naming the competition's slug (`select slug from app.competitions`):

```sql
select app_private.ai_content_configure(true, '<botola pro 1 slug>', 6);
```

## Pause / inspect

```sql
select app_private.ai_content_configure(false);                       -- stop now
select kind, language, created_at, owner_notified_at
  from app_private.ai_content_articles order by created_at desc limit 20;
```

To take one article down, unpublish it from the admin news screen.

## Not yet covered

- No hero image; articles publish without one.
- Fact checks catch invented scores, not every wrong claim. Review the first
  days of output before leaving it unattended.
- Tests ran without a database: pgTAP and the SQL were not executed here. CI's
  `database-quality` job is the authority for the migration.
