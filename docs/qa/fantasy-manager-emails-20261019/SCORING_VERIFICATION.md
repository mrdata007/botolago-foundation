# Fantasy scoring verification — 19 October 2026

Production V2: `tkewgajrljbwgwedqsxn`. Latest direct verification: **14:35 Dubai / 10:35 UTC**. This follow-up made no production database writes, deployments, migrations, prize changes, identity links or forced finalizations. It verified the existing release and observed its natural recovery. The separate email review website contains only fictional examples.

## Refined task and professional judgment

> Verify that GW1–3's approved API-rating revisions are visible to managers. For GW4 onward, verify the end-to-end path from real SofaScore player IDs and ratings through persisted input, automatic scoring, published totals and the explicit awaiting-ratings state. Recover available ratings without inventing points, matching new identities, overwriting historical seals or bypassing finalization guards. Prove correctness independently against raw provider responses, SQL arithmetic, worker logs and the deployed release. Distinguish provisional publication from final results and provider delays from system failures. Complete the approved Score reveal email journey with editable-selection and before-deadline reminders, preserving branding, both languages and existing delivery safeguards. Do not enable live mail while creating templates.

The central overlooked risk is confusing three different events: a match ending, a rating becoming available, and a gameweek becoming final. They need different customer states. A fourth risk is that historical raw rows can remain sealed/final under the previous rules while their customer-visible API-rating revision is provisional. Reading only `fantasy_gameweeks.status` would incorrectly authorize a final-score email. Existing prizes and historical seals must remain protected.

Another weak assumption is that every appearance will eventually receive an API rating. The present API omits ratings for some participants even in old fixtures. More polling can recover late data, but cannot guarantee data the provider never publishes. Under the owner's explicit decision to wait for actual ratings, no estimated 5 points, invented zero, short-appearance exemption or alternative-provider substitution is authorized. Existing legacy selections lacking API IDs remain unresolved; new purchases are protected against adding more. This report does not claim all gameweeks are finalized or the entire launch is ready.

## Primary evidence and method

1. Read the actual production publications, source points, per-fixture poll timestamps, active rating events, results, scheduler flags and worker logs through read-only SQL. Confirm the live website's HTTP 200 response and release header `19cfafb24171f300a5b85ebd2f5d66d4dfbc4eb2`.
2. Run the repository's reviewed, read-only, all-fixture SofaScore audit twice from exact main `5f8f1957e40bf9ece47d9f36e6bed1d21383bb16`. Each run made 30 requests and had two fetch/payload failures; neither is reported as a passing whole-run audit. The first run's logs show 15-second timeouts on Difaâ and Wydad. Preserve failure evidence rather than replacing a failure with a zero-rating result.
3. Reconcile the **newest successful response per fixture across the two runs**, covering all 30 finished fixtures. This is a capture window, not an atomic provider snapshot: **13:46:10–14:29:14 Dubai**. Compute a sorted canonical fingerprint of every API player ID, two-decimal rating or null, and appearance flag. Independently compute the same fingerprint from current production `fantasy_api_rating_points` using SQL `string_agg`, explicit C collation and fixed decimal formatting. Compare every fixture: **30/30 match; zero mismatches; 919 actual ratings**. The digest is only a deterministic equality check on non-secret sports data, not a cryptographic authenticity claim.
4. Independently verify points use the real rating rounded half up. Verify the published historical player events and each manager total, including captain points, transfer hits and Bench Boost. A first simplified total check flagged three GW1 teams; inspection showed their legitimate Bench Boost points, and the corrected rule-aware independent calculation found zero mismatches. No score was changed to fit the check.
5. For GW4, join all active point events back through existing API player identities to the raw per-fixture ratings. **245 active rating events, zero missing identities, zero non-rating events and zero point mismatches**. The API's 248 ratings and the ledger's 245 events are different populations; do not assert equal counts. All seven manager-result components reconcile and none has a forced final score.
6. Observe natural scheduled recovery rather than manually invoking the scorer: Wydad's **29 ratings** were persisted at **14:03:04 Dubai**. The **14:10** worker completed successfully in **1.920 seconds**, and the current GW4 calculation is **25**. Further scheduled passes at 14:20 and 14:30 were successful. Latest 14:30 run took 1.862 seconds; no held worker lease remained.

Audit source runs: [39232378020](https://github.com/mrdata007/botolago-foundation/actions/runs/39232378020), artifact 12177787001; [39237616212](https://github.com/mrdata007/botolago-foundation/actions/runs/39237616212), artifact 12180156352. Previous complete zero-fetch-failure audit: [39222363676](https://github.com/mrdata007/botolago-foundation/actions/runs/39222363676). Existing release validation: [39224333395](https://github.com/mrdata007/botolago-foundation/actions/runs/39224333395), including 6,848 database tests. No new database test run is claimed for this read-only follow-up.

## Measured result

| Gameweek | Available real ratings | Publication and completeness |
| --- | --- | --- |
| GW1 | 211 / 219 appearing participants | Rating revision published 13:07:26 Dubai; provisional |
| GW2 | 212 / 218 | Rating revision published 13:07:26 Dubai; provisional |
| GW3 | 248 / 251 | Rating revision published 13:07:26 Dubai; provisional |
| GW4 | 248 / 251 | Automatically scored and visible provisionally; calculation 25 |

Counts cover assigned, finished fixtures. Postponed fixtures and legacy identity gaps are separate readiness conditions, so this table is not a full finalization checklist.

Remaining GW4 ratings: **Difaâ El Jadida–Moghreb Tétouan 30/32** and **Widad Témara–Kawkab Marrakech 31/32**. Wydad Casablanca–Amal Tiznit is now **29/29** and ready. Missing ratings are still pending, not fabricated zeroes. All three historical publication records remain present and incomplete; their original sealed results are preserved.

## Why the user experience now recovers

The deployed fix removed the former two-hour post-match stop for native-rating recovery. The existing serialized fetcher continues with bounded polls: five minutes for recent fixtures, thirty minutes for fixtures less than two days old, two hours for older ones. Scoring runs every ten minutes after ingestion. These are configured intervals, **not a guarantee of complete points within ten minutes of full time**: queueing, provider failures, rate limits and incomplete API coverage can add delay. The newly observed Wydad recovery is evidence the path works; it is not proof that the provider will rate every participant.

Available scores are published provisionally while only the affected rating cells show the awaiting-ratings loop. Server-confirmed pending signals are distinct from fetch errors and uncomputed results; reduced-motion users get a static indicator. The existing watchdog continues to surface unresolved coverage, and issue #516 remains open while actual finality is blocked. Never suppress that warning to claim a clean launch.

The objective success criteria are: every available provider rating persists accurately; active rating events agree arithmetically; customer-visible totals reconcile; pending cells do not masquerade as zero; late data enters scheduled scoring without manual recovery; no duplicate events or held lease; and final notifications/prizes remain behind true visible-result completeness. Current observations satisfy publication and automatic recovery. Complete finalization remains conditional on actual missing ratings and legacy identity resolution under the owner's existing rules.

## Email outcome and remaining activation work

Score reveal is recorded as the selected direction. The selection-opening and before-deadline reminders are created in French and Arabic, with exact trusted deadlines, the existing Morocco clock, direct `/fantasy/team` CTAs and stale-selection guards. See [FANTASY_MANAGER_EMAIL_JOURNEY.md](../../backend/FANTASY_MANAGER_EMAIL_JOURNEY.md). The public [review page](https://botolago-email-design-review-e4lqut.v2.appdeploy.ai/) displays the three selected moments using fictional data.

Renderer tests: 86 passing, 782 assertions. Twelve browser layout checks passed. Production email mode is still **off** and no email was sent. The new templates are not live delivery automation: opening-event planning, trusted claim/send integration, real inbox-client checks and provider-capacity validation remain prerequisites. Existing quota reserves, opt-ins, unsubscribe and deduplication rules still apply.
