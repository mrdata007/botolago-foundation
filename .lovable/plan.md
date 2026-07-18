# Pass 3.2 Hardening — Ordered Execution Plan

The audit is correct: Pass 3.2 was declared complete prematurely. This plan lands every acceptance item, in an order that keeps typecheck/tests green after each sub-pass. Each sub-pass ends with `bunx tsgo --noEmit` + `bun test` green and a matching test count bump.

**Total scope**: ~11 files edited, 4 new files, ~20 new tests. This is too large for one green pass; splitting it lets each sub-pass be reviewed and typecheck-clean.

## 3.2-H1 — Provider + repo foundation (Finding E)

New / edited:
- `src/services/fantasy-owned-provider.tsx`: add `replaceSnapshot(next)` and `writeMutationStatus(next)` (timer-safe, monotonic) so routes never race stale `saved→idle` timers, and can install a returned snapshot into the cache without a network reload.
- `src/services/fantasy-mutation-controller.ts`: call `replaceSnapshot(res.data)` on success instead of blind `invalidateOwned()`; guard `saved→idle` with a mutation id so an older timer cannot overwrite a newer status. Never re-throw a cloud error as a local fallback.
- Tests: monotonic status timer, `replaceSnapshot` cache write, no-fallback-to-local on cloud error.

## 3.2-H2 — i18n keys + a11y primitives (Finding F)

- `src/i18n/dictionaries/fr.ts` + `ar.ts`: add keys for unsaved / conflict / retry / reload-latest / keep-working / import validation / empty-builder / swap-hint / draft-restored / cloud-finalized.
- `src/components/fantasy/UnsavedBadge.tsx`: `aria-live="polite"` visible unsaved badge (44px hit target for its inline "Save" affordance).
- `src/components/fantasy/ConflictBar.tsx`: localized reload-latest / keep-working inline bar, `aria-live="assertive"`, 44px targets, 320px wrap.
- Verify RTL logical props (`ms-*`, `me-*`) — no `ml-*` / `mr-*` in new components.

## 3.2-H3 — Import prompt (Finding A)

Rewrite `src/components/fantasy/FantasyImportPrompt.tsx`:
- Source = `new LocalFantasyRepository().loadSnapshot()` (not `fantasyService.getTeam()`).
- Validate all 15 (squad size, formation legality via `validateTeam`, ID map coverage) with localized error copy.
- Resolve local `state.currentGameweek` number → live UUID via `loadGameweekIndex` + `resolveGameweekId`; refuse import when no UUID exists.
- Pass local `lifecycle` (chips, transferHitPoints, results, currentGameweek) and derived purchase prices to `repo.saveTeam` (`expectedVersion: 0`).
- Marker `imported` set only on success. `start_new` marker sets on explicit action. "Plus tard" is transient (no marker).
- Remove `"My Team"`; all copy through `t()`.
- Tests (4): happy path (single `saveTeam` call, `imported` marker), mapping failure (no marker, no local mutation), RPC conflict/RLS (no marker, snapshot untouched), start-new (marker set, no `saveTeam` call).

## 3.2-H4 — Team draft + builder (Finding B)

New: `src/services/fantasy-team-draft.ts` — typed `TeamDraftPayload` (squad, formation, captain/vice, chip draft, purchase prices, lifecycle patch, baseVersion, teamId), JSON round-trip.
Edit `src/routes/fantasy.team.tsx`:
- Init working state from draft (matching uid/team/version/kind) or `owned.snapshot`.
- Persist draft on every real edit (formation, swap, captain/vice, chip toggle, replacement). In cloud mode, chip toggles write draft only — never `fantasyStateStore`.
- `UnsavedBadge` visible when draft ≠ snapshot.
- Save: `expectedVersion = snapshot.version`. On success → `replaceSnapshot`, clear draft. On conflict/error → draft kept; `ConflictBar` renders Reload Latest / Keep Working. Reload Latest calls `repo.reload()` + drops draft after user confirmation.
- Remove the `fantasySummary` mock query in cloud mode (omit those stats; Pass 3.3 wires them from snapshot).
- Empty-cloud (post start-new) renders `EmptyTeamBuilder` initialized from public player pool, not local squad; no pitch crash on empty squad.
- Remove hardcoded `"Tap two players of the same position…"` and any `lang === "ar" ? … : …` ternaries → dictionary keys.
- Ensure 44px hit targets on formation, chips, captain/vice, save/cancel; check with pixel probe.
- Tests (5): draft init/restore by (uid, team, version), persist edits, save-success clears draft + returned snapshot wins, conflict preserves draft, start-new produces empty builder (no local squad substitution), cloud chip edit writes draft only (spy that `fantasyStateStore.write` is not called).

## 3.2-H5 — Transfers draft + Free Hit (Finding C)

New: `src/services/fantasy-transfers-draft.ts` — typed `TransfersDraftPayload` (staged out/in ids, nextSquad, nextBank, nextFreeTransfers, pendingTransfers, purchase prices, transaction rows with engine hits, lifecycle patch, baseVersion, teamId). JSON round-trip test.
New: `src/services/fantasy-free-hit-snapshot.ts` — `captureFreeHitSnapshotOnce({team, chips, purchasePrices})` and `restoreFreeHitSnapshot(snap)`; snapshot includes 15 squad rows w/ slots, captain/vice, formation, bank, freeTransfers, pendingTransfers, teamName, managerName, purchasePrices. Idempotent — no overwrite once set.
Edit `src/routes/fantasy.transfers.tsx`:
- Restore draft on mount by scoped key; persist every staging change (add/remove/replace).
- Confirm passes real engine `transactions` with per-row `hit` derived from engine (matches `hitPointsApplied`), not `hit: 0`.
- Free Hit: capture-once before first temporary transfer; wildcard retains and hit=0.
- On confirm success: `replaceSnapshot`, clear draft. On conflict/error: full draft kept, `ConflictBar` inline.
- Replace inline FR/AR ternaries with dictionary keys. 44px targets.
- Tests (5): draft JSON round-trip + restore, single `confirmTransfers` invocation with complete payload, failure/conflict preserves full draft, Free Hit capture-once + exact restoration, wildcard retention & zero-hit.

## 3.2-H6 — Points/finalization (Finding D)

New: `src/services/fantasy-cloud-finalize.ts`:
- `selectStableCloudResult(snapshot, gw)` — returns finalized result from `snapshot.finalizedResults[gw]` if present.
- `buildCloudFinalizationPlan({snapshot, gw, breakdown, averagePoints, highestPoints, lifecycle})` — returns `{ result, chipFinalize, postTeam, postPurchasePrices, nextGameweekNumber, nextGameweekId, nextLifecycle }`. Rolls free transfers via `rollFreeTransfers`. Free Hit restores from snapshot's captured purchase prices (not current temporary ones). Chip `used` de-duplicated.
Edit `src/routes/fantasy.points.tsx`:
- Cloud mode: gw-result/history primary source = `owned.snapshot.finalizedResults` + snapshot history; provisional breakdown may come from public gameweek fixture data (mock is public/fixture only, comment cited).
- `onRecompute`: no-op writing local storage in cloud mode; only refetches the fixture/breakdown query.
- Stable result short-circuit: if `selectStableCloudResult` returns a result, do NOT call `finalizeGameweek`; render immediately.
- Finalize: call `repo.finalizeGameweek` once with `postPurchasePrices` passed at the repo input level (not only inside `postTeam`), advance to resolved next GW UUID.
- Cloud advance path: no local `advanceGameweek` call; lifecycle transitions built purely and installed via `replaceSnapshot` after `repo.saveTeam` with new `currentGameweekId` and rolled `freeTransfers`.
- 44px targets on Finalize / Advance / Recompute.
- Tests (5): stable-result short-circuits (spy: `repo.finalizeGameweek` not called), plan advances GW + rolls free transfers, plan finalizes chip exactly once (no duplicate `used`), `postPurchasePrices` reaches the repo input (spy assertion on `finalizeGameweek` args), idempotent reload does not replay effects, cloud `onRecompute`/advance never write `fantasyStateStore` (spy).

## 3.2-H7 — Browser matrix (targeted, not full 3.3)

Playwright script `/tmp/browser/pass32/` — Chromium 320×1800:
- `/fantasy/team` FR + AR: empty (post start-new), unsaved badge, conflict bar simulated by version bump.
- `/fantasy/transfers` FR + AR: staged draft, over-budget, deadline error copy wraps.
- `/fantasy/points` FR + AR: stable-result render, provisional recompute.
- Assert no console errors, no horizontal overflow (`document.documentElement.scrollWidth <= 320`).

## Verification

After each sub-pass and at end: `bunx tsgo --noEmit` + `bun test`. End total tests ≥ 177 + 20 = 197. Report final count + per-file diff summary + Pass 3.3 remaining scope (Home/dashboard cloud summary, leagues cloud, browser matrix full).

## Ask

This is 3+ turns of work if each sub-pass must land green. **Confirm the sequence (H1 → H7) or reorder.** Otherwise I begin H1 (provider foundation) now and land the rest in subsequent turns, reporting after each.
