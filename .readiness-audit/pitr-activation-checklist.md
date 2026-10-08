# Supabase PITR activation — Production V2

Owner-only. **Paid**: these steps change billing and restart the database.
Nothing here has been run.

Prices are from Supabase's documentation as read on 2026-10-08:
[PITR usage](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery),
[Backups](https://supabase.com/docs/guides/platform/backups) and
[Compute and disk](https://supabase.com/docs/guides/platform/compute-and-disk).
Confirm them on the dashboard's confirmation screen, which shows the live price.

## Where production stands (read-only, 2026-10-08 ~05:55 UTC)

- **Plan:** organization on Pro since 2026-09-18 (ledger). Daily backups are kept 7 days.
- **PITR:** last reported **off** (`pitrEnabled false`, ledger, run 35375519576). Never shown on since.
- **Compute:** **Micro profile** (`max_connections` 60, `shared_buffers` 256 MB). **PITR requires at least Small compute.**
- **Postgres:** 17.6.1.147, above the 15.8.1.079 that physical backups require.

## Cost

| Item                                    | Hourly         | Monthly (approx.)                    | Notes                                                                                                                |
| --------------------------------------- | -------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| PITR, 7-day window                      | $0.137         | ~$100                                | Billed hourly in arrears; part-hours count as whole hours. **Not covered by the Spend Cap.**                         |
| PITR, 14 / 28 days                      | $0.274 / $0.55 | ~$200 / ~$400                        | 7 days is enough for the RPO target.                                                                                 |
| Compute Micro → **Small** (the minimum) | +$0.0072       | +~$5 (Small ~$15 against Micro ~$10) | Restart, usually under 2 minutes.                                                                                    |
| Compute → Medium / Large instead        | —              | ~$60 / ~$110                         | Only if the capacity test (`capacity-test-plan.md`) shows Small is not enough. Decide both together to restart once. |

**Minimum added cost: about $105 a month** (PITR 7 days plus Small compute).

## Checklist

### A. Before (free, read-only)

1. Dashboard → Project Settings → **Compute and Disk**: note the current size. The database reading says Micro.
2. Dashboard → Database → **Backups**: note the newest daily backup, as evidence the daily backups exist today.
3. Record the read-only Management API state. It needs your personal access token in `SUPABASE_ACCESS_TOKEN` and prints no secret:

   ```sh
   curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
     https://api.supabase.com/v1/projects/tkewgajrljbwgwedqsxn/database/backups \
   | jq '{pitr_enabled, walg_enabled, completed: ([.backups[]? | select(.status=="COMPLETED")] | length), physical_backup_data}'
   ```

4. Choose a quiet window (no live match, not :23) for the restart in B.1.

### B. Enable — **WRITE, paid**

1. Compute and Disk → **Small** (or the size the capacity test picks) → confirm. Wait for `ACTIVE_HEALTHY`, usually under 2 minutes of downtime.
   - Check: `show max_connections;` reads **90** for Small (60 is Micro).
2. Project Settings → **Add-ons** → Point in time recovery → **7 days** → confirm.

### C. Verify (free, read-only)

1. Re-run A.3. You want `"pitr_enabled": true` and `"walg_enabled": true`, plus `physical_backup_data.earliest_physical_backup_date_unix` and `latest_…_unix` both set.
2. Ten minutes later, re-run it. `latest_physical_backup_date_unix` must have moved forward, to within a few minutes of now while the database is active. WAL is archived every 2 minutes, and not at all while the database is idle.
3. Dashboard → Database → Backups → **Point in time**: the date picker offers a window that ends a few minutes ago.
4. Once PR #379 is merged: run **Phase 7E-A Production V2 read-only preflight** (Actions, confirmation `RUN_PHASE7E_A_PRODUCTION_PREFLIGHT`). It must print `Management API preflight: PASS`. Before PITR it prints `FAIL (point-in-time recovery DISABLED)`.
5. **Watch one thing.** Supabase says that with PITR on, "we will no longer take Daily Backups". The promoter also requires at least one `COMPLETED` row in the backups list. If C.1 shows `completed: 0` once the old daily backups age out (7 days), the promoter will refuse with `backup readiness insufficient`. Bring that to review as a decision about what counts as a completed backup under PITR. **Do not weaken the guard on the spot.**

### D. Rollback

- **Disable PITR:** Add-ons → Point in time recovery → none. Billing stops from that hour.
  - The point-in-time window is gone.
  - New backups stay physical and cannot be downloaded (take `supabase db dump` copies if a downloadable copy matters).
  - The P1-03 gate fails again and P1-04 returns to UNVERIFIED.
- **Compute back to Micro:** Compute and Disk → Micro, with another short restart. **Only possible after PITR is off**, because Small is PITR's minimum.
- Nothing in the application depends on PITR. Disabling it changes recovery, not behaviour.

## What PITR gives, and what it does not

- **RPO:** Supabase states a worst case of **2 minutes**, which meets the ≤ 5 minute target **as configuration**. P1-04 stays UNVERIFIED until the rehearsal (`restore-rehearsal.md`) measures it.
- **RTO:** an in-place restore takes the project offline for a time that grows with database size, and Supabase gives no estimate. P1-05 needs the rehearsal's measured time.
- **Not covered:** Storage objects (avatars, news media, player photos) are not in database backups. Custom role passwords are not kept either. Storage needs its own copy policy, a gap outside this PR.
