# Fantasy recovery receipt — 20 October 2026

Verified production project: `tkewgajrljbwgwedqsxn`.

## Completed production work

- Manager email automation is live, using Score reveal and the approved opening,
  24-hour deadline and points-ready types. Consent/current-score checks and the
  original activation cutoff remain enforced. The 02:25 UTC cron succeeded,
  live and idle, with no eligible mail; this does not claim inbox delivery.
- PR #537 merged as `65ce4a995d9326966edecbcceccb030b20673d55`. Required CI
  `39356618917` passed application and database checks on the exact feature head
  `84edde9fe6742a01e5580316f13aba9f76c01bd8`.
- Exact-source migrations `20261019194059` and `20261020015540` are applied.
  Each production operation was rehearsed and separately verified rolled back
  before apply. Eighteen SQL assertions also passed on live staging, including
  release-reason enforcement; all synthetic fixtures were rolled back.
- The 21 reviewed compatibility IDs are repaired, covering 48 owned slots in
  seven teams. All 21 retain the existing restriction on new purchases while
  disputed catalog attributes remain under review. No sale, compensation,
  free transfer, bio/position/club rewrite or numeric rating was invented.
- Eight independently compared full-row fingerprints were unchanged: teams,
  109 membership records, 27 lineups, 405 lineup-player rows, four transfers,
  20 original historical results, three sealed snapshots and 740 catalog rows.

## Visible points

At **02:21:04 UTC / 06:21:04 Dubai**, GW1–3 were republished as audited historical
rating revisions. Independent SQL rating arithmetic and every one of the 20
actual owner/team points reads agreed with the new calculations. The original
competition seals and scores remain intact. Historical revision metadata stays
provisional; this receipt does not describe it as new competition finalization.

| GW | Publication / plan | Scoring inputs | Remaining uncertainty |
| --- | --- | --- | --- |
| 1 | 10 / 13 | Complete | None |
| 2 | 11 / 14 | Complete | None |
| 3 | 12 / 15 | Provisional | One fixture's participation/rating gap |

The first rehearsal found that the old private staging helper reuses a version
derived only from sealed snapshots and collides with an existing recovery plan.
That attempt rolled back. The guarded owner operation retained every staging
and publisher check and allocated the next version over existing plans too.
No old plan was changed or deleted. A new rehearsal then passed three revisions
and 20 customer reads; a separate read proved rollback before identical apply.
The generic staging helper remains unchanged; repeated historical revisions
must use the reviewed monotonic allocator rather than reuse an existing version.

Executed operational SQL SHA-256:
`8cd0434bf6c1fca3386b58e15a521e21ac3ca62d3c8c05d6be07e2196b9d2b97`.

The normal ten-minute worker recalculated GW4 at **02:20 UTC**, calculation 30.
All seven persisted team scores and their starting/bench/captain/transfer
components matched a fresh calculation. GW4 remains provisional with one
pending fixture. No final score was forced.

## Direct provider evidence and remaining gates

Read-only audit `39354972502`, captured 01:43:50 UTC, fetched all 30 completed
fixtures separately: zero failed requests, 919 real numeric ratings. Every
normalized payload exactly matched the latest production source. The cache is
not the remaining rating blocker. Nineteen short-appearance settlements all
passed their private evidence validator; ratings remain null, points zero.

- **GW3:** event `17256972`, API player `919712` (Yahya Jabrane) has no lineup
  minutes or rating. Provider incident `127078308` records him entering at 79.
  This contradicts the old unused observation and prevents a DNP or short-
  appearance assumption. Actual data reconciliation remains required.
- **GW4:** event `17256970`, player `1418569`, has four minutes and no rating.
  The provider earlier reported one minute, so its stable four-minute evidence
  window cannot close before **09:01:09 UTC / 13:01:09 Dubai on 20 October**.
  Settlement also needs the next successful poll; scoring follows normally.
- **Upcoming fixture refresh:** the hourly season job is invoked, but recent
  calls return HTTP 502 `invalid_provider_payload` after one API request and
  zero writes. The last successful season-wide run was 18 October 19:10 UTC.
  This is a real calendar freshness failure. A bounded, read-only diagnostic
  will capture the raw next/last-match responses and the disputed GW3 payloads.

All eight maintenance switches were restored and independently verified. Email
dispatch v17 and lifecycle worker v2 are active. Existing security warning
counts remain 1 extension / 63 anonymous definers / 249 authenticated definers;
the new private, forced-RLS audit table adds the expected no-policy INFO item.
No remaining gate was relabeled healthy and issue #516 is not falsely closed.
This receipt does not declare the entire launch ready.
