# Applied, 2026-10-05: first 7 Maghreb Fès – Zemamra Sofascore links

Production (`tkewgajrljbwgwedqsxn`). Follows
`HANDOFF_2026_10_04_MAS_ZEMAMRA_FIRST_SEVEN.md` (on branch
`claude/inspiring-ptolemy-nqgvcm`).

## Who did what

- **The owner entered all 7 links by hand** in the admin screen
  (`/admin/football/player-mappings`), between about 04:40 and 04:44 UTC on 2026-10-05.
- **Claude did not write to production.** Its sign-in as the owner was refused twice by the session's
  permission system, so the owner ran the steps instead. Claude only read production, before and after.

## What changed

- Proposal for Sofascore 884821 (Youssef Anouar), created by mistake: **cancelled**.
- Sofascore **544156** (A. Tahiri): proposal created, approved, executed.
- Position cases 544156, 1096751, 1140961, 1525325, 1919299: acknowledged, approved, executed.
- Shirt cases 919340, 1182110: approved, executed.
- All 7 are self-approved (allowed by `football_mapping_settings`).

## Checked afterwards (read-only SQL, 2026-10-05)

- 7 new Sofascore mappings, each active and manually corrected, each pointing at the planned app player:
  544156, 1096751, 1140961, 1525325, 1919299, 919340, 1182110.
- 884821 has no mapping; its proposal is `cancelled`.
- Sofascore mappings: **198** (was 191). Flashscore: **42** (unchanged). Executed proposals: **240** (was 233).
- No other proposal is open.

## Not done

- **Step 7 of the hand-off (local replay of the 7 GW1 matches) was not run.** Expected result, unverified:
  Sofascore unresolved 22 → 15, Flashscore 24, still not ingestion-ready.
- Not checked: that the owner's notes and reasons carry the exact texts from the step 2 page.

These links change no points: GW1 is finalized.
