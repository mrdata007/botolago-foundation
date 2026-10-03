# Flashscore evidence batch: runbook

Status: **prepared, not run, and not runnable until migration `20261003120000` is applied** (see "Prerequisite"). Nothing in this document, and nothing in the pull request that carries it, proposes, approves or maps anything. The owner runs the three actions.

**Prerequisite.** The dependency on the supporting Sofascore mapping is enforced by the database (`docs/backend/FOOTBALL_MAPPING_SUPPORTING_DEPENDENCY.md`, migration `20261003120000`, a separate pull request this one is stacked on). That migration is **not applied anywhere yet**. The version 2 manifest below carries fingerprints that only the migrated functions produce; against an unmigrated database the screen cannot read the supporting mapping (the read function does not exist yet), so every row stops at its check before anything is sent (`mapping_unavailable`) and nothing is created. Do not run the batch before the migration is applied and the owner has approved this exact manifest hash.

## What it is

The completed Sofascore batch (189 rows) proved the tool. This is the same tool, extended to map **Flashscore** ids to canonical players, one proposal per row, in the same three separate actions (propose, approve, execute), each behind its own typed phrase. The 191 Sofascore mappings are never touched.

A Flashscore row rests on a **Sofascore mapping that is already active and reviewed**, plus what the two providers say about the same finished match:

| Class                                       | Evidence                                                                                                                                                                                   | Proposal reason (stored with each proposal)          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `F1_REVIEWED_SOFASCORE_EVENTS` (24 rows)    | Aligned match events (goal, assist, card, substitution) between the Flashscore id and the reviewed Sofascore player, and an agreeing shirt number, or at least two distinct aligned events | `FLASHSCORE_REASONS.F1…` in `flashscore-contract.ts` |
| `F2_REVIEWED_SOFASCORE_SHIRT_DOB` (18 rows) | Same shirt number in the same match, and the birth date Flashscore reports agrees with the one Sofascore reports for that player (corroboration, never proof)                              | `FLASHSCORE_REASONS.F2…`                             |

Neither wording mentions a tier, SportsMonks, or a comparison with the canonical app's birth date: this evidence has none of those. The two providers are not an independent third source; every manifest row records that as a limitation.

## The manifest

**Version 2** (the one the screen offers): `docs/production/manifests/gw1-flashscore-executable.v2.manifest.json` (+ `.v2.manifest.sha256`; the same content is embedded as `flashscore-manifest.ts` for the screen). Hash `f2eef95dd199244ca6c48e9a2e0595a39a6bc2e534e7455a41467c7dba17a286`.

**Version 1** (`gw1-flashscore-executable.manifest.json`, hash `524290909f25e4f145f84b4ab670162a859c859e17b410d1cb623a027681a5e8`) is **historical and unchanged**; a test pins its hash. The historical review manifests are kept beside it (`4c3d2294…` original, `a885c765…` corrected).

Why a new version: the database now stores the supporting mapping's state inside each proposal's fingerprinted evidence, so every fingerprint changes. What changed and what did not (checked row by row in `flashscore-manifest.real.test.ts`):

- **Unchanged:** the 42 pairs (Flashscore candidate id, Flashscore id, canonical target, supporting mapping row and Sofascore id, class), the 11 held-back rows and their codes, every row's fixtures, class facts and catalogue signals, candidate revisions and signals inside the fingerprint inputs.
- **Changed (schema and fingerprint only):** the supporting binding now carries the executed proposal that made the row reviewed and the database's state digest (it no longer carries a version label or a Sofascore candidate id); each row's fingerprint inputs now include the supporting block and the evidence-reference digest; so `evidenceSha256`, `expectedFingerprint` and the manifest hash change.

- 42 executable rows (24 + 18), cut from the 53 Flashscore rows of the corrected review set. No row was added.
- Each row binds: candidate id and evidence revision; Flashscore id; the exact canonical target; the supporting Sofascore id, mapping row id, target, the executed proposal behind its review and its state digest as the database computes it; the fixtures (ids, kickoff, and a digest of each provider's payload set); the class facts; the database's own signals; a digest of the row's evidence; limitations; the class's audit reason; and the proposal fingerprint.
- Capture times and digests: provider responses (historical, 2026-10-01), mapping snapshot, candidate records, birth-date corroboration, and the one production read that checked every row (`readAt` in `sources`).
- No names, no birth dates. Verification refuses a name key, a calendar date, a duplicate candidate / Flashscore id / target / supporting mapping, a class whose facts do not support it, a stored dependency block that is not the row's supporting binding, and any fingerprint that does not follow from the row's own inputs (recomputed with the same rule the database uses; reproduced 189 of 189 against the Sofascore batch's real fingerprints, and against two proposals made by the migrated database functions: `fingerprint.test.ts`).

### The production read behind version 2 (read-only)

One SELECT, 2026-10-03T10:41:48Z, `scripts/backend/build-flashscore-executable-manifest.ts --print-sql`; the saved result is `tests/fixtures/identity/gw1-flashscore-production-read-v2-2026-10-03.json`. All 53 rows still hold: candidates unmapped at revision 2 with no open proposal; no Flashscore mapping exists (0); 191 active Sofascore mappings; every supporting mapping present, active, on the same player, unchanged since the first manifest, and **reviewed by the audit record** (53 of 53); the six position disagreements and five shirt differences and the one club mismatch are exactly the 11 held-back rows. Nothing was held that was not already, and nothing replaced.

Production has not applied the migration, so the read computes the supporting state with plain SELECTs that replicate the database function; `--print-parity-sql` runs the comparison against a database that has the migration (40 of 40 rows identical locally, before and after hand edits, in any session time zone).

### Held back (11 rows)

The database's own signals for these contradict the catalogue, so they are **not** executable. They are listed in the manifest (`heldBack`) with ids and codes, and the screen shows them. Nothing was substituted for them.

| Code                    | Rows                                | Why held                                                                                                            |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `POSITION_DISAGREEMENT` | 6 (one also has a shirt difference) | The backend parks such a proposal for a position note and an explicit acknowledgement; this batch carries neither.  |
| `CLUB_CONTEXT_MISMATCH` | 1                                   | Flashscore observes the player at a different club than the catalogue's. A club change needs dated evidence.        |
| `SHIRT_DIFFERENCE`      | 4 (+1 above)                        | The squad-list shirt differs from the catalogue's. The Sofascore batch excluded shirt conflicts under the same bar. |

Adding any of these later is an owner decision, row by row, with its own note: it is not a manifest edit.

## What is checked, and by whom

**By the database (authoritative), for every Flashscore proposal, from any path:** the proposal must name its supporting Sofascore mapping and evidence class; the server reads that row itself and refuses (with a stable code, creating nothing) when it is missing, not Sofascore, inactive, not reviewed by its audit record, or on another player. It stores the row's state in the fingerprinted evidence, recomputes it at approval, and reads it again under a lock inside the executing transaction (any difference refuses with `supporting_mapping_changed`). The ordinary queue, this batch screen and a direct call all hit the same rule.

**By this screen (early warning only):** before any proposal, and again immediately before each execution on both paths the screen offers, it reads the actual mapping row through `api.admin_football_mapping_get_provider_mapping` (the same read the database uses; it is not a guess from the audit trail) and compares it with the manifest's binding: same row, still active, still reviewed, still the same player, same state digest. A difference holds the row (`STALE_EVIDENCE`, with the database's own code) before anything is sent. If the screen is skipped, the database refuses anyway.

Also checked from the database before any proposal: the candidate is unmapped, has no open proposal, is the same Flashscore id at the same evidence revision, and was observed at the same club; neither the Flashscore id nor the target is claimed for Flashscore (both directions; nothing is chosen by order); the database's signals for the target are still clean.

**The ordinary queue** cannot propose a Flashscore identity (it has no supporting mapping to give, and the database would refuse); it shows why. A Flashscore proposal for a manifest row made through the batch screen can be executed from the ordinary queue; that button runs the same early-warning read and the database check.

What the server does **not** do: it does not verify the provider's match events, shirt numbers or birth dates. Those stay reviewer evidence; the server verifies the stored review record and the dependency.

## Running it (owner)

Prerequisites: migration `20261003120000` is applied and checked; the owner has approved the version 2 manifest hash; the staff session is on the second factor with a recent sign-in; single-operator mode is on (the current owner policy); one writer at a time (`AGENTS.md`).

1. Open `/admin/football/player-mappings`, then the Flashscore batch. The screen verifies the manifest hash, shape and every fingerprint before offering anything; a refused manifest disables every action.
2. Review the table. Deselect any row. The number of propose calls follows the selection: one set of calls per class, at most 25 rows to a call.
3. **Propose** (type `PROPOSE_REVIEWED_BATCH`). A row that moved is skipped with its reason and never replaced.
4. **Approve** (type `APPROVE_REVIEWED_BATCH`).
5. **Execute** (type `EXECUTE_APPROVED_BATCH`), one proposal at a time, each its own guarded transaction.

Stop and investigate (do not retry) if the session is refused (sign-in, second factor), if a row shows `STALE_EVIDENCE` with a `supporting_*` code, or if a read-only count of active Sofascore mappings is not 191.

## Tests that stand behind it

- `bulk-mapping/flashscore-batch.test.ts`: manifest tampering (class, basis, reason, target, hash, order, duplicates, names, dates); call grouping and the 25-per-call limit; a supporting mapping deactivated or retargeted before propose and again after approval; stale evidence; an id or target claimed by someone else, before and between the re-check and the call; a tampered fingerprint; an expired session; a lost answer; single-operator mode; row state derived from the database after a reload; the Sofascore mappings unchanged; only reviewed calls made.
- `bulk-mapping/supporting-mapping.test.ts` (the check against the actual row, including "a version label alone never makes a row reviewed"), `fingerprint.test.ts` (including the golden vector from the migrated database), `flashscore-manifest.real.test.ts` (the committed v2 manifest against the committed fixtures, and v1 unchanged), `scripts/backend/build-flashscore-executable-manifest.test.ts`.
- Negative controls on the client: removing the dependency from the proposal item, ignoring `reviewed`, and removing the stand-in repository's re-read each fail the tests.
- `supabase/tests/database/football_player_mapping_flashscore_batch.test.sql`: the real database functions on a synthetic world: every proposal fingerprint equals the manifest computation; bounded calls; backend collision refusals per item; claimed id and target mid-batch with one failing row leaving the rest intact; the Sofascore mapping rows, players, memberships, Fantasy tables, scoring snapshots, automation settings and cron jobs byte-for-byte unchanged; a Flashscore proposal whose supporting mapping is inactive or retargeted is refused by the database (the old expectation that it executes is gone); an aal1 session refused. CI's `database-quality` job is the authority for these.
