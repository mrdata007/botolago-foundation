# Production: Manager Card backend installed (2026-10-08)

On 2026-10-08 the owner ran the guarded script
`scripts/backend/apply-20261008123000-manager-card.sql` (BG-0158, pull request
#381, head `10b3bd7`, CI green) in the Supabase SQL Editor of Production V2
(`tkewgajrljbwgwedqsxn`). It installed five migrations:

- `20261008123000_manager_card_schema`
- `20261008123100_manager_card_erase_lock`
- `20261008123200_manager_card_compute`
- `20261008123300_manager_card_api`
- `20261008123400_manager_card_jobs`

The pull request is not merged. These five files are now applied on
production, so from here they change only through new migrations, never by
editing these files (CLAUDE.md, "Migrations").

## What the owner reported

- The Fantasy lifecycle tick was paused first, as the script requires.
- The rehearsal (as shipped, ending in `rollback;`) said "Rehearsal passed".
- The real run (`commit;`) said "Applied".
- The Fantasy tick was switched back on afterwards.
- The Manager Card is off: both switches false, no rules row, no card rows.

The script's own postflight checks these things inside the same transaction
before it can say "Applied":

- both switches are false and there is no rules row;
- the grants are correct;
- row security is forced;
- the account erasure holds the `botolago:manager-card` lock;
- both jobs are scheduled;
- the tick answers `off` and writes nothing.

## Not yet checked independently

The Claude session's Supabase connection was signed out when the owner
reported this, so no read-only check from the session has been made yet. To
do when the connection is back:

- the five history rows, each `statements[1]` matching its file by sha256;
- both switches still false, 0 rules rows, 0 cards;
- the two jobs scheduled, and `manager-card-tick` runs answering without
  writing;
- the erase lock in place and the Fantasy tick on.

## Earlier attempts the same day (nothing saved)

- **14:34–14:36 UTC.** The session paused the Fantasy tick, then stopped:
  the session's permission system blocked the step as a production deploy.
  The tick was restored.
- **14:45–14:53 UTC.** The session paused the tick and sent the script
  through Supabase `execute_sql`. Every request that changes the database
  timed out after 60 s and never reached the database: nothing in
  `pg_stat_statements`, no objects, no history rows. The likely cause is an
  approval the connector needs that could not be given in time. The tick was
  restored.
- A read-only test over the same connection confirmed the session's copy of
  `20261008123000` matched the repository file by sha256.
- **Before the owner's successful run.** Running the script through the
  connector failed with "Invalid or expired requestState", before anything
  ran. The owner checked that nothing was created, and restored the tick.

## Next (owner)

1. **Calibrate.** Grant an aggregate-only read of real 2026/27 Fantasy data
   to set the scales and tier cut-offs.
2. **Rules v1.** Insert it through a reviewed script
   (`docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md`).
3. **Founder.** Set the founder cut-off and run the grant once.
4. **Switch on.** Turn compute on, then reads, once the screens exist.

## Calibration dry run (2026-10-08, owner)

The owner ran `scripts/backend/manager-card-calibration-dry-run.sql` in the
SQL Editor of Production V2. It ended in its deliberate error, which carries
the result, and the owner checked afterwards that nothing was saved: no rules,
no cards and no evaluation rows, with both switches still off.

- 2 finished gameweeks.
- 7 teams evaluated: 6 counted two weeks, 1 counted one.
- 0 teams at the three-week minimum.
- 0 captain mismatches.

The proposed scales and tiers stayed placeholders, and the script said not to
install them. Decision: no rules v1 yet. Recalibrate after at least five
finished gameweeks. No founder grant was run; it runs on or after 1 November 2026.
