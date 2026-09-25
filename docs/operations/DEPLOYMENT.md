# Deploying BotolaGO

A merge to `main` is not a deployment. BotolaGO has four parts that go live
separately, and on 2026-09-24 the audit found a login fix merged days earlier
still missing from the live site, with nothing to show it.

| Part | Where it runs | How it goes live | Who |
| --- | --- | --- | --- |
| Website (pages, JavaScript) | Lovable hosting, `botolago.com` | GitHub `main` syncs into the Lovable project by itself; **Publish** in Lovable puts it live | owner, by hand |
| Database (tables, functions, pg_cron jobs) | Supabase project `tkewgajrljbwgwedqsxn` | a reviewed migration script run in the Supabase SQL editor (`docs/backend/RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md`, or a guarded `scripts/backend/apply-*.sql`) | owner |
| Edge Functions | Supabase | `supabase functions deploy <name> --project-ref tkewgajrljbwgwedqsxn` | owner or a gated workflow |
| GitHub Actions (orchestrator, imports, watchdog) | GitHub | run from `main` as soon as it is merged | automatic |

Publishing the website does not change the database, and applying a migration
does not change the website.

## Which version is live?

Every page response carries the commit it was built from:

```sh
curl -sI https://botolago.com/ | grep -i x-botolago-release
git rev-parse origin/main
```

The same value is in the page source as `<meta name="botolago-release">`. A
live site that shows no header was published before the header existed.

The **Production watchdog** (every 30 minutes, `docs/operations/ALERTS.md`)
compares the two: `release_drift` warns once `main` has held unpublished changes
for 24 hours and opens an `ops-alert` issue after 72 hours.

## Releasing

1. **Merge the pull request** on GitHub. Lovable picks it up within a minute.
2. **Database first**, when the release has migrations. Run the guarded
   script its pull request names (rehearsal, then apply). A website that calls
   a database function production does not have yet shows errors until the
   script runs, so this order matters. A release without migrations skips
   this step.
3. **Publish the website**
   1. Open <https://lovable.dev/projects/9f9face2-4733-42fd-aa13-174fbe9f6c87>.
   2. Click **Publish** (top right).
   3. Click **Update** in the box that opens. Wait until it says the site is
      published.
4. **Check it** (two minutes):
   - `curl -sI https://botolago.com/ | grep -i x-botolago-release` shows the
     commit you merged.
   - Open <https://botolago.com/auth/login?next=https://example.com>, then
     view the page source and search for `auth/register?next=`: it must not
     contain `example.com`.
   - Next day, the watchdog run page shows `release_drift ok`.

To undo a bad publish, publish again from the previous version in Lovable's
history. For a database change, add a new corrective migration; applied
migrations are never edited.

## Why the live site fell behind

Publishing needs the owner's click in Lovable and nothing reminded anyone:
the Lovable project showed the latest `main` (`d257de7`) as synced on
2026-09-24, while the published login page still passed
`next=https://attacker.invalid` through unchanged, so it predated even the
first redirect check of 21 September. The release header and the
`release_drift` check above make that gap visible within a day.
