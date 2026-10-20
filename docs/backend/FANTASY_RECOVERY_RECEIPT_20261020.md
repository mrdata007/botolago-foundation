# Fantasy recovery receipt — 20 October 2026

Updated at **09:13 UTC / 13:13 Dubai**. Earlier measurements below retain their original timestamps.

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

| GW  | Publication / plan | Scoring inputs | Remaining uncertainty |
| --- | ------------------ | -------------- | --------------------- |
| 1   | 10 / 13            | Complete       | None                  |
| 2   | 11 / 14            | Complete       | None                  |
| 3   | 14 / 17            | Complete       | None                  |

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

At **08:50:31 UTC / 12:50:31 Dubai**, GW3 was republished after fresh primary
API lineups and the full match timeline confirmed Yahya Jabrane (919712) was
unused. The actual substitute was Yassine Jabrane (2265493), entering at 79.
The older stored incident naming Yahya was stale. All nine positive-minute
substitute appearances agree with the fresh native-ID timeline. Source 66
changes only Yahya's uncertainty; every rating and minute remains unchanged.
All seven owner/team points responses and independent SQL arithmetic matched;
GW1–3 now have zero pending fixtures and players. Historical revisions retain
provisional metadata without rewriting the original competition seals.

PR #539 merged as `b6b825a2ac956e4e1f912ea5b2cb9034b415c1de`. Both required jobs
in CI `39394179044` passed exact final head
`5d6fbbf345030fefb4f4c951d1557be2f2d8ef96`. Focused tests: 119 passed,
454 assertions; TypeScript/lint passed. Final source compiled on staging v29
with its automation off. Production deployment `39396045417` succeeded:
`football-live-refresh` v30 ACTIVE. No migration or website deployment needed.

## GW4 recovered through the normal automatic worker

The four-minute appearance (event 17256970, player 1418569) reached the reviewed
24-hour stable evidence gate at **09:01:09 UTC / 13:01:09 Dubai**. A genuine
successful API check in audit `39398216122`, batch completed 09:07:27 UTC,
confirmed the same four minutes, no rating and no uncertain participation.
The wider audit attempted all 30 fixtures (31 requests); two unrelated reads
failed. Do not describe that whole audit as successful. The target request
succeeded, and SQL independently verified its entire normalized payload exactly
equal source 63 before any write. Previously verified data was retained.

The guarded operation used the existing recorder and private policy validator.
It passed the real production path with deliberate rollback; a separate read
confirmed rollback before identical apply. The existing source's ratings and
minutes were unchanged, its readiness became true, one immutable four-minute
settlement was added, and GW4 input version advanced 30→31. The API rating
stays null; Fantasy contribution is zero under the approved policy. All
original results, prior source/check evidence, historical publications, manager
state and seals were preserved during this operation. Automation was restored
to the exact original baseline, including the email activation cutoff.

At **09:10:25 UTC / 13:10:25 Dubai**, the normal scheduled lifecycle worker
finalized GW4 with calculation version 31. Seven persisted final scores and
every starting/bench/captain/transfer component matched a fresh independent
calculation. Seven authenticated manager points reads returned `pointsState:
final` and the correct final total. All pending fixtures and players are zero.
Seven targeted points-ready events were created. At 09:12 UTC all production
health checks were green; email delivery processing is verified separately.

Executed operational SQL SHA-256:

- GW3 source: `de5c67de2468556ea6104239a158e7108cd8f9974b6e37402a84197af28caf5b`.
- GW3 publication: `aa8cd6a4067efdb694ec8da9098f1ffa8dc621d7552db0f4ea3d568bc17e55ec`.
- GW4 approved check: `9c24f5f866147163eef2d7ec9f8b6949f10c5482db6e1b225b92683ec304ba8c`.

## Calendar evidence and scope limit

Primary diagnostic `39394241123`, captured 08:33 UTC, returned 17 valid upcoming
fixtures and 30 completed fixtures, zero malformed entries. Production's season
refresh recovered. The earlier HTTP-200/404 upcoming response is retained as a
regression case: endpoints now fail independently and partial freshness is
reported explicitly. No empty future schedule was invented. Upcoming GW5/6
fixtures still require canonical calendar admission; current live refresh
updates mapped fixtures only. This recovery did not create a GW5/6 calendar or
claim the entire app launch ready.

All eight maintenance switches were restored and independently verified. Email
dispatch v17 and lifecycle worker v2 are active. Existing security warning
counts remain 1 extension / 63 anonymous definers / 249 authenticated definers;
the new private, forced-RLS audit table adds the expected no-policy INFO item.
The database health checks are now green on verified scoring evidence.
External watchdog and email-delivery results must be read separately.
This receipt does not declare the entire launch ready.
