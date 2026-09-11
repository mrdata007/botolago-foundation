# BotolaGO — Release-readiness audit

Date: **11 September 2026**. Release decision: **BLOCKED — no verified functional production launch**.

This revision supersedes the initial audit's claim of five outstanding news-parser test failures. Those failures did not reproduce in the pinned GitHub runtime. The production outage and unverified live journeys remain independent launch blockers.

## 1. Application and source

The canonical source is `mrdata007/botolago-foundation`; the published web interface tested was `https://botolago.com`. The existing application uses React 19, TanStack Start/Router, Vite and Supabase. No Flutter/Firebase implementation, `pubspec.yaml`, `ios/` or `android/` project was found in this audited application. This is not an Android/iOS release certification.

The web interface loads, but its configured production backend is inactive and live browser data requests failed. A working build, HTTP 200 response or populated mock preview does not establish a functional launch.

## 2. Critical blocker: production database recovery and access

The intended production target remains **BotolaGO Production V2**:

| Field | Verified value |
|---|---|
| Project reference | `tkewgajrljbwgwedqsxn` |
| Owning organization | `bfhahpanhnoueripxshw` |
| Region | `eu-west-3` |
| Management lookup status | **INACTIVE** |

Evidence from connected management tools:

- `get_project` returned this project with status INACTIVE.
- Direct `restore_project` returned `NotFoundException: Project not found`.
- A read-only SQL query timed out.
- The current Supabase connection listed only the **COMET COMPONENTS** organization, not BotolaGO's owning organization.

The exact reason for the difference between project lookup and restoration/listing access was not established. This is an inactive/unreachable production backend plus a recovery/access blocker, **not proof that the project or its data was deleted**.

A second, guarded recovery attempt used the repository's existing protected production environment. Workflow run `34588850936` failed; its job logs were unavailable through the connector. No successful restoration was verified. The one-off recovery workflow was removed from the repair branch afterward, leaving no new recovery schedule enabled.

**Immediate owner-side unblock:** reconnect Supabase with an account authorized for organization `bfhahpanhnoueripxshw`, then resume **BotolaGO Production V2** (`tkewgajrljbwgwedqsxn`). Do not paste passwords, service-role keys or access tokens into chat. Restoring connectivity alone does not certify launch; live acceptance remains necessary.

## 3. The separate Lovable database is not production

Lovable could query a different project, `gjlycjqinblrgynifbes`. Read-only counts in its newer schema were: fixtures 0, players 0, seasons 0, standings 0, teams 10 and profiles 1. Its older `public` schema contained fixtures 4, players 64, articles 3 and gameweeks 1.

These counts apply **only to that alternate database**, not unreachable Production V2. They do not demonstrate production data loss. The public app was not repointed to this project. Do not reset, merge or seed production on the assumption that those alternate counts describe it.

## 4. Automated verification

### Pinned GitHub baseline after the article fix

Run `34589270370`, application job `103230566763`, used **Bun 1.3.14** and a frozen lockfile:

| Check | Verified result |
|---|---|
| Automated tests | **535 passed, 0 failed**, across 106 files |
| Article metadata tests | All 5 passed |
| ElBotola tests | All 8 passed, including the 5 that failed in the initial Lovable runtime |
| TypeScript | Passed |
| Migration-file validation | Passed: 47 migrations |
| Tracked-secret scan | Passed: no high-confidence tracked secrets detected |
| Local CI database startup/reset/tests/lint | Passed in the separate database-quality job |
| Authoritative generated database-type drift check | Passed |

The database checks used a **local CI database**, not Production V2. A tracked-secret scan is not a complete security audit.

The initial Lovable audit recorded **526 passes and five ElBotola failures**. Those failures did not reproduce in the pinned GitHub environment. No ElBotola parser code or test assertions were changed. The runtime/environment discrepancy remains unreconciled; do not report it as a confirmed outstanding parser regression or as evidence that live ingestion works.

The first PR lint run stopped on 1,004 formatting errors in the pre-existing generated integration type file and two formatting errors in the added test assertions. Both causes were addressed in source without rewriting generated schema definitions or disabling semantic checks.

### Follow-up verification of the repaired source

Repair head: `4ccd299632e6919db855fee90c571869fc169711`. Workflow run: `34589812799`.

| Check | Last observed result at this report cutoff |
|---|---|
| TypeScript | PASS |
| Automated tests | PASS; exact 535/0 count independently recorded in the preceding pinned run |
| Migration validation | PASS |
| Tracked-secret scan | PASS |
| Application lint | PASS; existing non-fatal warnings remain |
| Production build | PASS |
| Automated anonymous browser acceptance | In progress; **no pass claimed** |
| Latest local database rerun | Database tests in progress; preceding pinned run passed the full database-quality job |
| Authenticated production acceptance | **NOT VERIFIED** |

Do not equate a passing test suite or build with a successful public launch. The broader Phase 6.5 functional-acceptance workflow was skipped, not passed.

## 5. Browser evidence and scope limitations

Core French guest preview routes and a corrected set of eight Arabic routes were tested at a 390px width. Tested Arabic screens used `lang=ar` and `dir=rtl`; no horizontal overflow was observed on the tested screens. This is limited mobile preview coverage, not exhaustive accessibility or every-button certification.

The development preview can default to mock data when data-mode variables are absent. Its populated screens are not proof of a usable production football catalog.

On the public origin, requests to `tkewgajrljbwgwedqsxn.supabase.co` failed with `net::ERR_NAME_NOT_RESOLVED`. News rendered filters without articles; Matches and Fantasy displayed loading states in the tested session. This establishes a broken data connection, not a timed proof of permanently infinite loading.

The tested preview URLs `/terms`, `/privacy`, `/settings` and `/notifications` returned 404. Related controls may exist elsewhere; these specific destinations did not work as tested. Valid linked Terms/Privacy still need verified operator details. Do not publish placeholders as approved policies or invent a legal entity, contact, minimum age or governing law.

Real signup, confirmation, login/logout, password-reset delivery, profile persistence, squad save/reload, transfers, deadlines, live points and league participation remain **uncertified**. Article/match details, notification delivery, user-data isolation, load/performance and a complete production security assessment also remain unverified.

## 6. Repairs saved in draft PR #126 — not deployed

Branch: `fix/release-readiness-2026-09-11`. Three changed files:

| File | Change |
|---|---|
| `src/lib/article-meta.ts` | Correct article canonical/OpenGraph origin to `https://botolago.com`; keep sharing origin separate from authentication redirect configuration |
| `src/lib/article-meta.test.ts` | Regression checks for matching origins, encoded URL-like/Arabic identifiers and safe missing-article metadata |
| `eslint.config.js` | Formatting-only exception for the exact generator-owned `src/integrations/supabase/types.ts` file; semantic ESLint and TypeScript checks remain active |

The separate authoritative `src/backend/generated` schema-type drift gate was not changed. No generated database definitions, security assertions, provider allowlists, syndication gates, fantasy rules, Supabase target or OAuth settings were altered.

Five local Node checks also passed against the actual patched metadata function, verified byte-identical to Git blob `5b6412b426e9ce09ff992b09ede7845270d21d68`. These are supplementary to the GitHub results.

Lovable completed the original audit but rejected the subsequent repair request because the workspace had no credits. No credit purchase, subscription upgrade or new paid service was made. The bounded source repairs were made through GitHub. The PR remains draft and unmerged; no application repair was promoted as a public release.

## 7. Remaining release gates

| Priority | Required outcome |
|---|---|
| 1 | Restore authorized access to the correct production project; resume and verify healthy status plus real API responses |
| 2 | Inspect Production V2's own migration state, current-season teams/players/fixtures/deadlines, provider coverage and ingestion jobs; do not assume missing data or reset it |
| 3 | Verify authorized, fresh news ingestion, article details and match data against the restored backend |
| 4 | Complete real account lifecycle and fantasy create/save/reload/transfer/scoring/league acceptance using isolated test accounts |
| 5 | Resolve broken destinations and publish linked Terms/Privacy using verified operator details |
| 6 | Complete production security/data-isolation and browser regression checks; approve a release commit, publish, live-smoke-test and retain rollback capability |

No production business data or schema was changed. No provider activation, real-user notification, app-store submission or public application release was performed. The readiness audit and source repairs are completed work, but the requested functional launch is **incomplete**.

## 8. Evidence locations

- Repair PR: `https://github.com/mrdata007/botolago-foundation/pull/126`
- Pinned baseline CI: `https://github.com/mrdata007/botolago-foundation/actions/runs/34589270370`
- Repaired-head CI: `https://github.com/mrdata007/botolago-foundation/actions/runs/34589812799`
- Failed guarded recovery: `https://github.com/mrdata007/botolago-foundation/actions/runs/34588850936`
