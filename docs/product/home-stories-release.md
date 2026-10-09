# Stories release verification — 9 October 2026

Owner authorized deployment and publication after draft PR #386.

## Corrections before release

GitHub's broader checks found that HomeStories needed to be registered in the
feature-flag catalogs and that the three staff RPCs needed to be registered in
the existing MFA completeness checks. The application continued to enforce
those flags and staff permission checks. The new table also needed forced RLS;
this is supplied by forward migration 20261009113132.

The matching operational-script assertions passed (74 tests). TypeScript and
changed-source ESLint passed. A full local unit run was limited by blocked local
server sockets and different timezone data; the GitHub application test and
lint stages passed on the release branch. GitHub CI is the database authority:
the local full-stack image pull failed for lack of Docker storage.

## Production rehearsal

Target: BotolaGO Production V2, tkewgajrljbwgwedqsxn, ACTIVE_HEALTHY.
No other active database client or running cron job; no active production-writing
GitHub workflow. Lovable's agent was idle. The guarded script also acquires the
existing scheduled-job interlock, checks the exact migration baseline and
helper hashes, and locks existing media/audit tables for its short transaction.

`scripts/backend/apply-home-stories.sql` returned `Rehearsal passed; rolled back`.
Immediately before/after:

| Measurement             | Before | After rehearsal |
| ----------------------- | ------ | --------------- |
| Migration records       | 166    | 166             |
| app.home_stories        | absent | absent          |
| Media records           | 85     | 85              |
| Editorial audit records | 696    | 696             |

Existing `news-media-upload` Edge Function is ACTIVE, version 16, JWT verification
on; no redeployment needed. The existing news-media bucket is public.
The publication legal-placeholder gate passed with no exemption.
The release header before publication was 3f9c57fc72566bac9e83ba1b128cfa8ba59a1033.

Complete CI database suite, concurrency checks and database lint passed in
[run 37924600275](https://github.com/mrdata007/botolago-foundation/actions/runs/37924600275).
Its only remaining database gate was type drift. The authoritative generated
artifact (SHA256 4a94640dae5402c64856145f2503446210f028e633626d92b4f4a6c563a91e72)
was verified and committed, adding the new table and four API routine types.
