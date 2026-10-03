# Flashscore evidence batch: runbook

Status: **prepared, not run.** Nothing in this document, and nothing in the pull request that carries it, proposes, approves or maps anything. The owner runs the three actions.

## What it is

The completed Sofascore batch (189 rows) proved the tool. This is the same tool, extended to map **Flashscore** ids to canonical players, one proposal per row, in the same three separate actions (propose, approve, execute), each behind its own typed phrase. The 191 Sofascore mappings are never touched.

A Flashscore row rests on a **Sofascore mapping that is already active and reviewed**, plus what the two providers say about the same finished match:

| Class | Evidence | Proposal reason (stored with each proposal) |
|---|---|---|
| `F1_REVIEWED_SOFASCORE_EVENTS` (24 rows) | Aligned match events (goal, assist, card, substitution) between the Flashscore id and the reviewed Sofascore player, and an agreeing shirt number, or at least two distinct aligned events | `FLASHSCORE_REASONS.F1…` in `flashscore-contract.ts` |
| `F2_REVIEWED_SOFASCORE_SHIRT_DOB` (18 rows) | Same shirt number in the same match, and the birth date Flashscore reports agrees with the one Sofascore reports for that player (corroboration, never proof) | `FLASHSCORE_REASONS.F2…` |

Neither wording mentions a tier, SportsMonks, or a comparison with the canonical app's birth date: this evidence has none of those. The two providers are not an independent third source; every manifest row records that as a limitation.

## The manifest

`docs/production/manifests/gw1-flashscore-executable.manifest.json` (+ `.sha256`; the same content is embedded as `flashscore-manifest.ts` for the screen). It is a **separate** file from the historical review manifests, which are kept unchanged beside it (`4c3d2294…` original, `a885c765…` corrected).

* 42 executable rows (24 + 18), cut from the 53 Flashscore rows of the corrected review set. No row was added.
* Each row binds: candidate id and evidence revision; Flashscore id; the exact canonical target; the supporting Sofascore id, mapping row id, target, active/reviewed state and version stamp; the fixtures (ids, kickoff, and a digest of each provider's payload set); the class facts; the database's own signals; a digest of the row's evidence; limitations; the class's audit reason; and the proposal fingerprint the database computes for it.
* Capture times and digests: provider responses (historical, 2026-10-01), mapping snapshot, candidate records, birth-date corroboration, and the one production read that checked every row (`readAt` in `sources`).
* No names, no birth dates. Verification refuses a name key, a calendar date, a duplicate candidate / Flashscore id / target / supporting mapping, a class whose facts do not support it, and any fingerprint that does not follow from the row's own inputs (recomputed with the same rule the database uses; reproduced 189 of 189 against the Sofascore batch's real fingerprints).

### Held back (11 rows)

The database's own signals for these contradict the catalogue, so they are **not** executable. They are listed in the manifest (`heldBack`) with ids and codes, and the screen shows them. Nothing was substituted for them.

| Code | Rows | Why held |
|---|---|---|
| `POSITION_DISAGREEMENT` | 6 (one also has a shirt difference) | The backend parks such a proposal for a position note and an explicit acknowledgement; this batch carries neither. |
| `CLUB_CONTEXT_MISMATCH` | 1 | Flashscore observes the player at a different club than the catalogue's. A club change needs dated evidence. |
| `SHIRT_DIFFERENCE` | 4 (+1 above) | The squad-list shirt differs from the catalogue's. The Sofascore batch excluded shirt conflicts under the same bar. |

Adding any of these later is an owner decision, row by row, with its own note: it is not a manifest edit.

## What the tool re-checks, and when

Before any proposal, from the database:

* the candidate is unmapped, has no open proposal, is the same Flashscore id at the same evidence revision, and was observed at the same club;
* neither the Flashscore id nor the target is claimed for Flashscore, by an executed or an open proposal (both directions; nothing is chosen by order);
* the database's signals for the target are still clean (club and position agree, shirt agrees or gives no signal, no flag);
* **the supporting Sofascore mapping is still the same row, still active, still on the same canonical player, at the same version.**

The supporting mapping is checked again, from fresh reads, **immediately before each execution**. The reviewed backend re-checks everything about the Flashscore side at propose, approve and execute; it does not look at the supporting Sofascore mapping (a database test pins that fact).

### How the supporting mapping is read, and the gap

The authenticated screen cannot read the mapping table. It reads:

1. the Sofascore **candidate record**: `status` is `mapped` exactly while an active mapping holds the id, and `existingMappingId` names the mapping row;
2. the **audit record of every executed proposal**: each records the row it wrote (`mappingId`, target, active flag), and the row's version stamp is `football_player_mapping:<that proposal's id>`.

The current state is the last executed write to the row; the check refuses anything it cannot affirm (no history, a different last writer, an unexpected shape). All 191 production mappings have exactly this trail (checked read-only: 191 of 191 have a history, none has more than one write, the last writer always matches the version stamp).

**What this cannot see:** a mapping row changed outside the reviewed proposals, for example by a hand-run script that does not touch the version stamp. Closing that gap needs one small read-only function, which is **not** part of this change (it would be a migration):

```
api.admin_football_mapping_get_provider_mapping(p_provider text, p_external_id text) returns jsonb
  -- stable, security definer, same reader permission as the other read functions, granted to authenticated
  -- returns { mappingId, provider, externalId, appPlayerId, active, version (= source_version), reviewed (= source_version like 'football_player_mapping:%'), updatedAt }
  -- or null; reads app_private.football_provider_mappings; writes nothing; exposes no name, no key.
```

With it, the check reads the row itself instead of its audit trail. Until the owner chooses to add it, the audit-trail check above is what runs.

## Running it (owner)

Prerequisites: the staff session is on the second factor with a recent sign-in; single-operator mode is on (the current owner policy); one writer at a time (`AGENTS.md`).

1. Open `/admin/football/player-mappings`, then the Flashscore batch. The screen verifies the manifest hash, shape and every fingerprint before offering anything; a refused manifest disables every action.
2. Review the table. Deselect any row. The number of propose calls follows the selection: one set of calls per class, at most 25 rows to a call.
3. **Propose** (type `PROPOSE_REVIEWED_BATCH`). A row that moved is skipped with its reason and never replaced.
4. **Approve** (type `APPROVE_REVIEWED_BATCH`).
5. **Execute** (type `EXECUTE_APPROVED_BATCH`), one proposal at a time, each its own guarded transaction.

Stop and investigate (do not retry) if the session is refused (sign-in, second factor), if a row shows `STALE_EVIDENCE` with a `supporting_*` code, or if a read-only count of active Sofascore mappings is not 191.

## Tests that stand behind it

* `bulk-mapping/flashscore-batch.test.ts`: manifest tampering (class, basis, reason, target, hash, order, duplicates, names, dates); call grouping and the 25-per-call limit; a supporting mapping deactivated or retargeted before propose and again after approval; stale evidence; an id or target claimed by someone else, before and between the re-check and the call; a tampered fingerprint; an expired session; a lost answer; single-operator mode; row state derived from the database after a reload; the Sofascore mappings unchanged; only reviewed calls made.
* `bulk-mapping/supporting-mapping.test.ts`, `fingerprint.test.ts`, `flashscore-manifest.real.test.ts` (the committed manifest against the committed fixtures).
* `supabase/tests/database/football_player_mapping_flashscore_batch.test.sql`: the real database functions on a synthetic world: every proposal fingerprint equals the manifest computation; bounded calls; backend collision refusals per item; claimed id and target mid-batch with one failing row leaving the rest intact; the Sofascore mapping rows, players, memberships, Fantasy tables, scoring snapshots, automation settings and cron jobs byte-for-byte unchanged; the audit shape the client reads; the database's lack of a supporting-mapping check; an aal1 session refused. CI's `database-quality` job is the authority for these.
