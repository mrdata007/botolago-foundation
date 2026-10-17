# Applied 2026-10-04: reconciled provider observations (roadmap step 1)

Production: BotolaGO Production V2 (`tkewgajrljbwgwedqsxn`).
Owner decision 2026-10-04: "apply the step 1 migration to production", then "go ahead and apply it once green".

## What was applied

Migration `20261003180000_reconciled_provider_observations`, merged in
[PR #335](https://github.com/mrdata007/botolago-foundation/pull/335) (merge `279b4e8e`, head `121fabfc`, CI green),
through the guarded script
[`scripts/backend/apply-20261003180000-reconciled-provider-observations.sql`](../../scripts/backend/apply-20261003180000-reconciled-provider-observations.sql),
byte for byte as on `main` (file sha256 `faad26b4…`; migration sha256 `d00dec46…`, checked by the script).

It adds:

- the observation source `provider-reconciled`;
- `app_private.football_provider_fixture_links` (RLS forced, no API access);
- `api.service_record_reconciled_fantasy_observation`, which only the service role can call;
- `api.service_record_fantasy_observation`, which now accepts the new source, but only inside that wrapper.

Nothing was scored, finalized or published.

Before production, the three Codex findings on PR #335 were fixed:

- an unused substitute no longer blocks a match;
- a link that another run made at the same moment is refused;
- links are kept only when an observation is saved.

## Sequence (UTC)

| Time | Step |
| --- | --- |
| ~10:07 | Nothing running: no GitHub workflow runs in progress or queued, no pg_cron run, no other active database client. Orchestrator workflow disabled. |
| ~10:08 | Paused. The Fantasy tick was on before and is now off. Live refresh was on and is now off; email mode was `off` and stays `off`. Pépites was `public` and is now `off`. |
| ~10:09 | Rehearsal (`rollback;`): "Rehearsal passed". Re-read afterwards: recorder md5 still `0e4852a0…`, no table, no wrapper, migration not recorded, source check unchanged. The rollback held. |
| ~10:10 | Real run (`commit;`): "Applied". All preflight and postflight checks passed. |
| ~10:10 | Restored. The tick is on and live refresh is on (email mode `off`, as before). Pépites is `public` again, with the same competition, `auto_publish` false and the same times. Orchestrator workflow re-enabled (`active`). |

## Independent check after commit

| Check | Result |
| --- | --- |
| recorder md5 | `d5c60fc1a8b42f23e91c0db5e321a26d` (reviewed) |
| wrapper md5 | `06104038065b147d0573bbc68f23cfe0` (reviewed) |
| source check | `sportsmonks`, `reviewed-correction`, `provider-reconciled` |
| links table | RLS forced; 0 rows |
| reconciled observations | 0 |
| `authenticated` can call the wrapper | no |
| `schema_migrations` row `20261003180000` | present |

## Not done here

No reconciled match has been recorded. Recording one is a separate step, run through
`scripts/backend/reconciled-scoring-ingestion.ts`, dry run first; see
[`RECONCILED_SCORING_INGESTION.md`](../backend/RECONCILED_SCORING_INGESTION.md).
