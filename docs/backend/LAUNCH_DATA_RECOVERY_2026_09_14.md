# BotolaGO launch-data recovery — 2026-09-14

## Decision

Production connectivity, Arabic news and the first current-season fixtures are
restored. **BotolaGO is not launch-ready: Fantasy registration remains closed.**
This report separates observed production results from pending implementation
and release gates; a merged PR does not establish deployed database behavior.

## Verified production state

| Area | Observed result | Release implication |
| --- | --- | --- |
| Supabase | Production V2 `tkewgajrljbwgwedqsxn` is healthy and publicly readable through the app APIs. | The payment-related backend outage is resolved. |
| Arabic news | 10 fresh ElBotola stories; 6 remote hero images; live Arabic feed checked after hydration. | Arabic news recovery is verified. |
| News deduplication | A second manual run skipped the same 10 stories with zero rejections. | Repeated imports did not duplicate the recovered stories. |
| Current Football season | 8 fixtures and 16 clubs for 2026/27 recovered. | This is a partial calendar, not a full-season import. |
| Current squads | Zero rosters imported by the guarded recovery attempt. | The complete 16-club roster prerequisite remains unmet. |
| Player profiles | 26 position fields filled from provider profile evidence. | Position repairs do not establish current-season squad membership. |
| Fantasy | Zero Fantasy seasons; activation readiness remains false and registration remains closed. | No fabricated catalog, gameweek or deadline was substituted. |

## Merged recovery changes

The session verified the following pull requests as merged:
[PR 128](https://github.com/mrdata007/botolago-foundation/pull/128),
[PR 129](https://github.com/mrdata007/botolago-foundation/pull/129),
[PR 130](https://github.com/mrdata007/botolago-foundation/pull/130),
[PR 131](https://github.com/mrdata007/botolago-foundation/pull/131),
[PR 132](https://github.com/mrdata007/botolago-foundation/pull/132), and
[PR 133](https://github.com/mrdata007/botolago-foundation/pull/133).

The deployed availability UI replaces repeated generic Fantasy errors with
French/Arabic season or gameweek notices, preserves news/match access, and
does not offer team creation while unavailable. Activation is checked again
automatically; this UI treatment does not satisfy any missing data gate.

## Arabic news evidence and recurrence

- [Manual canary 34885083942](https://github.com/mrdata007/botolago-foundation/actions/runs/34885083942):
  10 stories inserted; database ingestion run `dd743763-0bc7-446e-9811-c2ca2c06d377`.
- [Manual dedupe run 34885893350](https://github.com/mrdata007/botolago-foundation/actions/runs/34885893350):
  10 skipped, zero rejections; database ingestion run `13f317cd-b6d1-40eb-9bd9-7b63acdee985`.
- Canary proof was saved as `ELBOTOLA_CANARY_VERIFIED_RUN_ID=34885083942`.
- Automatic approval review rejected enabling the recurring news refresh.
  `ELBOTOLA_SCHEDULE_ENABLED` remains unset; no recurring-refresh success is claimed.
- Fresh Arabic news was verified after language hydration. A transient French
  SSR render did not reproduce a persistent language-selection failure.
- French GNews licensing approval remains absent; this recovery does not
  authorize or activate a French GNews feed.

See [ElBotola recovery runbook](ELBOTOLA_RECOVERY_RUNBOOK.md) for the guarded
canary, retained proof and separately controlled recurrence procedure.

## Current-season fixture and roster evidence

[Recovery run 34886077938](https://github.com/mrdata007/botolago-foundation/actions/runs/34886077938)
failed at roster completeness **after** the 8 fixtures and 16 clubs succeeded.
Its overall failed status must not be reported as an entirely successful recovery.
The roster phase requires a complete 16-club set before writing memberships;
that guard prevented a partial or misleading current roster import.

[Read-only roster audit 34887672427](https://github.com/mrdata007/botolago-foundation/actions/runs/34887672427)
used 51 provider GET requests. Tiznit returned 0 squad members and Temara 1;
the checked alternative roster endpoints were empty. These results explain
the blocked roster import rather than proving that historical players can be
used as current-season squad members. The 26 profile-position repairs are
separate from the zero imported current rosters.

All eight imported kickoff values were the provider's raw
`2026-09-24T00:00:00Z`. They are **unconfirmed kickoff times** and must not be
treated as verified match schedules or used to invent Fantasy deadlines.

## Remaining launch gates

1. Obtain complete, current, position-qualified rosters for all 16 clubs,
   including Tiznit and Temara, with verified provider membership evidence.
2. Verify complete season metadata, the full calendar and actual kickoff
   times; the 8 recovered fixtures alone do not meet the activation profile.
3. Verify production coverage for live/finished match lineups, events and
   player statistics required by the scoring rules; implementation alone is
   not evidence of sufficient provider coverage.
4. Pass the unchanged five-runner, 2,500-user capacity gate and soak on the
   selected production tier. The existing [capacity report](FANTASY_CAPACITY_REPORT.md)
   documents that this gate has not passed.
5. Complete trusted worker/migration verification, then separately review
   the catalog preview, stage the real catalog and open registration under
   the [activation runbook](FANTASY_CATALOG_ACTIVATION_RUNBOOK.md).
6. Resolve French GNews licensing before activating that source. Enable
   recurring Arabic refresh only through an authorized operation after the
   previously rejected enablement action is resolved.

## PR 134 — pending final release evidence

[PR 134](https://github.com/mrdata007/botolago-foundation/pull/134) contains the
pending trusted Fantasy pipeline work. **At this report's checkpoint, its DDL
has not been applied to production.** Worker code and tests are not a live
scoring/finalization certification and do not change the blocked launch verdict.

- Final reviewed commit and merge outcome: **PENDING — root agent to record.**
- Exact CI run/check links and outcomes: **PENDING — root agent to record.**
- Production migration versions, apply evidence and verification: **PENDING.**
- Any worker execution, provider coverage or activation change: **PENDING;
  do not infer execution or approval from code being present.**
