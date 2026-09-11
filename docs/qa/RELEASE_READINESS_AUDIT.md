# BotolaGO — Release-readiness audit

Date: 2026-09-11 (UTC). Verdict: **NOT LAUNCHED / RELEASE BLOCKED**.

This report distinguishes observed production failures, local/preview tests, and unverified functionality. A published page returning HTTP 200 is not a successful functional launch.

## 1. Application and source

- Canonical GitHub source: `mrdata007/botolago-foundation`.
- Published web origin tested: `https://botolago.com`; Lovable also reports `https://botolago.lovable.app`.
- Existing stack: React 19, TanStack Start/Router, Vite and Supabase.
- No Flutter/Firebase implementation, `pubspec.yaml`, `ios/` or `android/` project was found in the audited application. This audit does not certify an Android or iOS release.
- The initial audit was saved by Lovable in commit `6c2fd16ba4522a6aaf6423af625c08523abaaf98`. This revision corrects overstatements in that initial report.

## 2. Critical production blocker — inactive backend and recovery access

The browser's `.env.production` points to **BotolaGO Production V2**, project `tkewgajrljbwgwedqsxn`, in `eu-west-3`. This remains the intended production target; it must not be replaced casually with the older Lovable database.

Evidence collected through the connected Supabase management tools:

- `get_project` returned the project with status **INACTIVE**, organization `bfhahpanhnoueripxshw`.
- `restore_project` was attempted and returned `NotFoundException: Project not found`.
- A read-only production database query timed out.
- The current Supabase connection's organization listing contained only **COMET COMPONENTS**, organization `vedhqkxwfrtjprdsisrv`; its project listing did not include BotolaGO.

This indicates an inactive/unreachable production backend and a recovery/access blocker. It is **not proof that the project was deleted or never existed**. The exact reason for the mismatch between project lookup and restoration/listing remains unverified.

Live browser observations on `botolago.com`:

- Requests to `tkewgajrljbwgwedqsxn.supabase.co` failed with `net::ERR_NAME_NOT_RESOLVED`.
- News rendered filters but no articles in the tested session.
- Matches and Fantasy showed loading states while data failed to load.
- These observations establish a broken data connection, not a measured proof of permanently infinite loading.

A second, guarded recovery attempt used the repository's existing `production-admin-activation` environment. Workflow run `34588850936` failed; downloadable job logs were unavailable. No successful restoration was verified. The one-off workflow trigger was removed from the repair branch after the failed attempt; no new recovery schedule was left enabled.

Recovery run evidence: `https://github.com/mrdata007/botolago-foundation/actions/runs/34588850936`.

## 3. Separate Lovable database — do not confuse it with production

Lovable's connected database is project `gjlycjqinblrgynifbes`, which could be queried. Read-only counts reported by the audit:

| Table | Rows |
| --- | ---: |
| app.fixtures | 0 |
| app.players | 0 |
| app.seasons | 0 |
| app.standings | 0 |
| app.teams | 10 |
| app.profiles | 1 |
| public.fixtures | 4 |
| public.players | 64 |
| public.articles | 3 |
| public.gameweeks | 1 |

These counts apply **only to the separate Lovable-connected database**, not to inactive Production V2. They do not demonstrate that production data has been lost. This alternate database contains both older `public.*` tables and newer `app.*`/`api.*` structures, with insufficient newer football data for launch. Do not repoint the public app to it, merge schemas, reset data, or seed fake production fixtures as a shortcut.

After production access is restored, inspect its own migration history, season/player/fixture catalog, permissions, provider mappings and job state before deciding what needs repair or ingestion.

## 4. Verification results

The following commands were executed by the Lovable audit runtime before the later GitHub-only metadata patch:

| Check | Recorded result | Scope / limitation |
| --- | --- | --- |
| `bun run typecheck` | PASS | Source type check, not runtime acceptance |
| `bun run backend:migrations:check` | PASS; 47 migrations | Static validation, not proof production migrations are applied |
| `bun run backend:secrets:check` | PASS | No high-confidence secrets detected in tracked files; not a penetration test |
| `bun run build` | PASS | Application builds; data connection still broken |
| `bun test` | **526 passed, 5 failed; 531 total** | Full suite is NOT green |
| Guest mobile preview | Limited PASS | Tested core French routes and eight corrected Arabic/RTL routes at 390px |
| Missing preview routes | FAIL | `/settings`, `/privacy`, `/terms`, `/notifications` returned 404 |
| Live data browsing | FAIL | Production backend requests failed |
| Signed-in production acceptance | NOT TESTED | No verified test session; backend unavailable |

The local preview defaults to mock data where development data-mode variables are absent. Populated preview screens do not establish that live football/news/fantasy data works.

Mobile observations: no horizontal overflow on the tested screens, and the corrected language test used `botolago.language=ar`, with `lang=ar` and `dir=rtl`. This is not comprehensive accessibility certification or an every-button audit.

### Failing news ingestion tests

All five recorded failures are in `supabase/functions/_shared/elbotola.test.ts`:

1. Fetching robots/homepage and persisting Arabic link metadata.
2. Ignoring non-allowlisted or credential-bearing image URLs.
3. Retrying a transient homepage failure.
4. Quarantining malformed metadata while preserving valid links.
5. Rejecting malformed article metadata while preserving valid items.

The observed failure was `invalid_provider_payload` from `parseElbotolaHomepage`. The exact root cause has **not** been established; the audit does not prove the external publisher changed its markup. The five tests remain unresolved. No assertions, origin/image allowlists, timestamp checks, syndication gates or provider safeguards were removed to obtain a false pass. Live ingestion was not verified.

## 5. Repair completed on a separate branch

Branch: `fix/release-readiness-2026-09-11`.

- `src/lib/article-meta.ts`: public article canonical and OpenGraph URLs now use `https://botolago.com`, rather than the incorrect `https://www.botolago.app`.
- Public sharing origin is explicitly separated from authentication redirect configuration. Supabase target and authentication/OAuth redirect settings were not changed.
- `src/lib/article-meta.test.ts`: updated the existing production-origin expectation and added checks for matching OpenGraph URLs, URL-like identifiers, Arabic identifiers and missing article metadata.

The metadata implementation committed as blob `5b6412b426e9ce09ff992b09ede7845270d21d68` was copied locally and verified byte-for-byte by its Git blob SHA. Five focused checks using Node 22.16.0 with TypeScript stripping all passed (5 passed, 0 failed). These are focused checks of the actual patched function, **not a rerun of the full Bun application suite**, and do not resolve the five ingestion failures.

The application patch is staged on the branch, not promoted as a public production release. The documentation update itself does not change app functionality.

Lovable completed the initial audit but rejected the subsequent repair request because the workspace had no credits. No credit purchase or plan upgrade was made. GitHub was used for the bounded metadata repair instead.

## 6. Remaining launch gates

| Gate | Status / acceptance requirement |
| --- | --- |
| Production recovery | BLOCKED: restore authorized access to the correct BotolaGO organization and resume Production V2; verify healthy status and API requests |
| Real current-season catalog | UNKNOWN in production: verify its own teams, eligible players, fixtures, deadlines and provider coverage |
| News ingestion | FAILING TESTS: diagnose five failures; validate authorized ingestion, freshness and article details |
| Account lifecycle | NOT VERIFIED: signup, confirmation, login/logout, password-reset delivery and profile persistence |
| Fantasy lifecycle | NOT VERIFIED: create/save/reload squad, captain/bench, budget and club constraints, transfers, deadlines, points and leagues |
| Access control | NOT VERIFIED on production: user isolation, privileged operations, anonymous data boundaries and storage policies |
| Missing routes / policies | OPEN: restore intended settings/notifications routes and complete linked Terms/Privacy with verified operator details; do not publish invented legal information |
| Full regression | NOT GREEN: require full suite, production build and authenticated browser acceptance after fixes |
| Release / rollback | NOT PERFORMED: record approved commit, publish, check live requests/journeys, and retain a rollback target |
| Native distribution | NOT PRESENT in audited app: Flutter/Firebase and store builds require a separate implementation/release track |

## 7. Immediate owner-side unblock

Use a Supabase connection/account that has access to organization `bfhahpanhnoueripxshw` and **BotolaGO Production V2** (`tkewgajrljbwgwedqsxn`), then resume that project through its authorized dashboard. Do not paste service-role keys, access tokens or passwords into chat.

Once the backend is reachable, the remaining gates still need to pass. Restoring the database alone is not a launch certification.

## 8. Explicit non-actions and limitations

No production schema or business-data changes, provider activation, real user creation, notification sends, new paid services, or public release were performed. No fake data was substituted for production. Article detail, match detail, authenticated fantasy operations, email delivery, load/performance, and a full production security assessment remain unverified. The audit is substantial but not an exhaustive every-screen/every-button certification.
