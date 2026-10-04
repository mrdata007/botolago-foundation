# Hand-off, 2026-10-04: finish the first 7 Maghreb Fès – Zemamra links as the owner

For the next Claude session. The owner decided to let Claude enter these links with the owner's
own admin login. Read this whole page before doing anything.

## The authorisation, and its limits

- **Who:** the owner, 2026-10-04: "I will give you the admin login and we get this over with".
- **Where the login comes from:** environment variables `BOTOLAGO_ADMIN_EMAIL` and
  `BOTOLAGO_ADMIN_PASSWORD`. Never ask for them in chat, and never print or log them.
- **Two-factor:** ask the owner for the current 6-digit code at the moment you sign in, and use it
  immediately. Never ask for the authenticator setup key.
- **What it covers:** exactly the actions in "What to do" below. The owner authorised these 7 links
  and nothing else. The next decisions (birth dates, missing players, memberships and so on) need
  their own yes.
- **How:** only through the same `api.admin_football_mapping_*` calls the admin screen makes,
  signed in as the owner. Never write mapping rows with SQL; the MCP SQL access is for reading.
- **Every reason or note you enter starts with** `Entered by Claude on the owner's instruction.`

## State at 2026-10-04 ~12:20 UTC (read-only check)

- **Already in production:** 233 mappings (191 Sofascore and 42 Flashscore). There were 240
  proposals; 233 executed.
- **Self-approval is allowed** (`football_mapping_settings.allow_self_approval = true`), and all
  233 earlier proposals were self-approved.
- **The owner created 7 proposals at about 12:06–12:09 UTC.** They all expire on 2026-10-07. Nothing
  was approved or executed.

| Sofascore id | Proposal app player | Status | Correct? |
| --- | --- | --- | --- |
| 884821 (Youssef Anouar) | `92a22fef-8a28-4dd9-b9b2-05e848b0b9d0` (Y. Anouar) | position_disagreement | **No. Not in the batch: cancel.** |
| 1096751 | `18a56065-bd3c-42a4-a36e-314123f145d1` | position_disagreement | yes |
| 1140961 | `9be4bcf8-4e0d-4e76-a630-3c120e1c903d` | position_disagreement | yes |
| 1525325 | `50a8ea2c-9559-46d5-8cf3-0da879aabb0b` | position_disagreement | yes |
| 1919299 | `508e12ad-306c-45e2-b71d-45c0ba6f0f2b` | position_disagreement | yes |
| 919340 | `924c59cd-afdb-4c05-a49a-58a985b79d70` | pending | yes |
| 1182110 | `8711cce0-3af4-49a9-9035-fabe7dd528bc` | pending | yes |
| **544156 (Anas Tahiri)** | none | candidate `3feaa436-2e95-499d-920d-104131cfd948` still `unmapped` | **missing: create** |

- **The 7 intended links** are in
  [`MAS_ZEMAMRA_IDENTITY_STEP_2_START_2026-10-03.md`](MAS_ZEMAMRA_IDENTITY_STEP_2_START_2026-10-03.md).
  The Tahiri link is: candidate `3feaa436-…` to app player `cdda738e-7b3b-4de7-922c-3cff32f55f8e`
  (A. Tahiri). It is a position case.
- **Before signing in, re-read all of this from production.** Stop and tell the owner if anything
  differs.

## Signing in (the same calls the app makes)

1. **Publishable key:** `mcp__Supabase__get_publishable_keys` for project `tkewgajrljbwgwedqsxn`.
   The URL is `https://tkewgajrljbwgwedqsxn.supabase.co`.
2. **Password:** `POST /auth/v1/token?grant_type=password` with the email and password from the
   environment.
3. **Second factor:** find the verified TOTP factor (`GET /auth/v1/user` lists the factors). Then:
   - `POST /auth/v1/factors/<id>/challenge`;
   - ask the owner for the code;
   - `POST /auth/v1/factors/<id>/verify` with `challenge_id` and `code`.

   The token you get back is the aal2 session that the staff functions require.
4. **Database calls:** `POST /rest/v1/rpc/<function>`, with:
   - `apikey: <publishable key>`;
   - `Authorization: Bearer <aal2 token>`;
   - `Content-Profile: api`.

   Keep the token in a shell variable only; never write it to a file in the repository.

Function arguments, from `src/backend/football/identity/mapping-repository.ts`. Use a fresh
`gen_random_uuid`-style idempotency key per call, and reuse it only to retry that same call.

- `admin_football_mapping_cancel(p_proposal_id, p_reason, p_idempotency_key)`
- `admin_football_mapping_propose(p_items, p_reason, p_idempotency_key)`, where an item is:
  - `{"kind":"map","sofascoreCandidateId":…,"flashscoreCandidateId":null,`
  - `"appPlayerId":…,"basis":"manual","evidenceRefs":[]}`
- `admin_football_mapping_add_position_note(p_proposal_id, p_note, p_idempotency_key)`
- `admin_football_mapping_get_proposal(p_proposal_id)`, to read the current fingerprint.
- `admin_football_mapping_decide(p_proposal_id, p_decision 'approve', p_decision_reason, p_fingerprint, p_position_acknowledged, p_idempotency_key)`
- `admin_football_mapping_execute(p_proposal_id, p_idempotency_key)`

## What to do, in order

1. **Cancel the Youssef Anouar proposal** (Sofascore 884821), with this reason: `Entered by Claude on the
   owner's instruction. Created by mistake in place of Sofascore 544156 (Anas Tahiri); not part of
   the reviewed batch.`
2. **Propose Tahiri:** Sofascore candidate `3feaa436-2e95-499d-920d-104131cfd948` to app player
   `cdda738e-7b3b-4de7-922c-3cff32f55f8e`, basis `manual`. Reason:
   `Entered by Claude on the owner's instruction. MAS–Zemamra step 2 batch (docs/production/MAS_ZEMAMRA_IDENTITY_STEP_2_START_2026-10-03.md).`
3. **The 5 position cases** are 544156, 1096751, 1140961, 1525325 and 1919299. For each one, add
   the position note, prefixed as above. The exact text is in the step 2 page:
   - 1096751 has the extra SportsMonks birth-date sentence;
   - **the owner has already seen that flag.**

   Then read the proposal for its fingerprint, and approve with `p_position_acknowledged = true`.
4. **The 2 shirt cases,** 919340 and 1182110: approve, with the shirt reason from the step 2 page
   (prefixed) as the decision reason.
5. **Execute all 7.**
6. **Verify (read-only SQL):**
   - 7 new Sofascore mappings, each active and reviewed, each pointing at the planned app player;
   - the Anouar proposal cancelled;
   - Sofascore mappings at 198 in total;
   - nothing else changed.
7. **Re-run the local check** (no database) for the 7 GW1 matches:
   ```
   bun scripts/backend/reconciled-scoring-ingestion.ts --plan plan.json \
     --mappings rows.json --captured-at <now> --mode local --out report.json
   ```
   - `rows.json`: the output of `scripts/backend/football-reviewed-mapping-snapshot.sql`, read from
     production.
   - `plan.json`: the 7 GW1 provider pairs from `tests/fixtures/providers/matches.json`, with each
     app fixture id and the home and away team ids, read from production (`app.fixtures` joined to
     the round 1 gameweek).

   Expected for Maghreb Fès – Zemamra: Sofascore unresolved goes from 22 to 15, and Flashscore
   stays at 24. Still not ingestion-ready.
8. **Record it** in a short `docs/production/APPLIED_2026_10_0X_MAS_ZEMAMRA_FIRST_SEVEN.md`, and
   report to the owner in plain words.

If any call refuses, stop. Do not retry with different inputs and do not work around a guard. Tell
the owner what refused and why.

## Context the owner should hear again

- **These links change no points.** GW1 is finalized, and production refuses new match data for a
  finalized gameweek.
- **They are permanent,** and they cover the same players in every future match.
- **Recommended next direction (not yet agreed):** after these 7, stop grinding Fès – Zemamra.
  Instead:
  - confirm players club by club for upcoming gameweeks;
  - add the step that downloads new matches, because the ingestion tool only reads committed
    payloads today.

  The first real use of reconciled scoring would then be a match that earns points.

## Other state to know

- **Step 1 is on production.** Migration `20261003180000` was applied at about 10:10 UTC (record:
  `APPLIED_2026_10_04_RECONCILED_PROVIDER_OBSERVATIONS.md`). There are no reconciled
  observations yet.
- **Schedules:** the Fantasy tick is on, live refresh is on, Pépites is `public`, and the
  orchestrator workflow is active. Linking players is not a scoring write, so they need not be
  paused. Still check that no mapping or player-list workflow is running before you start.
