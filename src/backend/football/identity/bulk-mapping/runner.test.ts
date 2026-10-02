import { describe, expect, test } from "bun:test";
import type { PlayerMappingRepository } from "../mapping-repository";
import { loadAllCandidates, loadAllProposals } from "../review-queue";
import {
  BACKEND_PROPOSE_LIMIT,
  BULK_APPROVAL_REASON,
  BULK_REASONS,
  MAX_PROPOSE_PER_CALL,
} from "./contract";
import type { BulkManifest } from "./manifest";
import { deriveAllRowStates, countStates } from "./row-state";
import { createBulkRunner, runApprove, runExecute, runPropose, type BulkDeps } from "./runner";
import {
  OWNER,
  PRODUCTION_SHAPE,
  buildWorld,
  candidateUuid,
  newRepo,
  oracleManifest,
  ownerContext,
  playerId,
  type World,
} from "./test-world";

/** Counts every call, so a test can say exactly which backend functions a phase used. */
function spy(repo: PlayerMappingRepository) {
  const calls: Record<string, number> = {};
  const seen: { name: string; args: unknown[] }[] = [];
  const proxy = new Proxy(repo, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        calls[String(prop)] = (calls[String(prop)] ?? 0) + 1;
        seen.push({ name: String(prop), args });
        return value.apply(target, args);
      };
    },
  });
  return { proxy, calls, seen };
}

async function setup(spec = PRODUCTION_SHAPE, tweak?: (w: World) => void) {
  const world = buildWorld(spec);
  tweak?.(world);
  const manifest = await oracleManifest(world);
  const repo = newRepo(world);
  const s = spy(repo);
  const deps: BulkDeps = { repository: s.proxy, context: ownerContext };
  const all = new Set(manifest.rows.map((r) => r.candidateId));
  return { world, manifest, repo, deps, all, ...s };
}

const states = async (repo: ReturnType<typeof newRepo>, manifest: BulkManifest) =>
  countStates(
    deriveAllRowStates(
      manifest,
      await loadAllCandidates(repo, {}, ownerContext()),
      await loadAllProposals(repo, null, ownerContext()),
      new Date(),
    ),
  );

describe("the full lifecycle on a 1,004-candidate, production-shaped world", () => {
  test("PROPOSE → APPROVE → EXECUTE: 189 individual proposals, approvals and mappings", async () => {
    const { manifest, repo, deps, all, calls, seen } = await setup();
    expect(manifest.population).toEqual({ total: 189, tierA: 108, tierB: 81 });
    const preMappings = repo.snapshotMappings();
    const preStatuses = repo.snapshotCandidateStatuses();

    // ---- PROPOSE: bounded calls, nothing mapped, nothing approved.
    const proposed = await runPropose(deps, manifest, all);
    expect(proposed.aborted).toBeNull();
    expect(proposed.outcomes.filter((o) => o.state === "PROPOSED")).toHaveLength(189);
    // Bounded calls of at most 25 (the stored-response ceiling): Tier A 4 x 25 + 8, Tier B 3 x 25 + 6.
    expect(calls.proposeMappings).toBe(9);
    const sizes = seen
      .filter((c) => c.name === "proposeMappings")
      .map((c) => (c.args[0] as unknown[]).length);
    expect(sizes.sort((a, b) => a - b)).toEqual([6, 8, 25, 25, 25, 25, 25, 25, 25]);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(MAX_PROPOSE_PER_CALL);
    expect(MAX_PROPOSE_PER_CALL).toBeLessThanOrEqual(BACKEND_PROPOSE_LIMIT);
    expect(calls.decideMappingProposal ?? 0).toBe(0);
    expect(repo.snapshotMappings()).toEqual(preMappings);
    const proposals = await loadAllProposals(repo, null, ownerContext());
    expect(proposals).toHaveLength(189);
    expect(new Set(proposals.map((p) => p.id)).size).toBe(189);
    expect(new Set(proposals.map((p) => p.fingerprint)).size).toBe(189);
    for (const row of manifest.rows) {
      const p = proposals.find((x) => x.sofascoreCandidateId === row.candidateId)!;
      expect(p.reason).toBe(BULK_REASONS[row.tier]);
      expect(p.fingerprint).toBe(row.expectedFingerprint);
      expect(p.appPlayerId).toBe(row.appPlayerId);
      expect(p.status).toBe("pending");
    }
    expect(proposals.filter((p) => p.reason === BULK_REASONS.A)).toHaveLength(108);
    expect(proposals.filter((p) => p.reason === BULK_REASONS.B)).toHaveLength(81);

    // ---- APPROVE: one proposal at a time through the reviewed function; still nothing mapped.
    const approved = await runApprove(deps, manifest, all);
    expect(approved.outcomes.filter((o) => o.state === "APPROVED")).toHaveLength(189);
    expect(calls.decideMappingProposal).toBe(189);
    expect(calls.executeMappingProposal ?? 0).toBe(0);
    expect(repo.snapshotMappings()).toEqual(preMappings);
    const afterApproval = await loadAllProposals(repo, null, ownerContext());
    expect(
      afterApproval.every(
        (p) => p.status === "approved" && p.decisionReason === BULK_APPROVAL_REASON,
      ),
    ).toBe(true);
    expect(afterApproval.every((p) => p.selfApproved)).toBe(true);

    // ---- EXECUTE: one at a time; only now do mappings appear.
    const executed = await runExecute(deps, manifest, all);
    expect(executed.outcomes.filter((o) => o.state === "EXECUTED")).toHaveLength(189);
    expect(calls.executeMappingProposal).toBe(189);
    expect(calls.executeMappingBatch ?? 0).toBe(0);
    expect(repo.snapshotMappings().length).toBe(preMappings.length + 189);
    expect(await states(repo, manifest)).toMatchObject({ EXECUTED: 189, NOT_PROPOSED: 0 });

    // Everything that existed before is untouched; no Flashscore candidate was touched.
    for (const m of preMappings) expect(repo.snapshotMappings()).toContainEqual(m);
    const candidates = await loadAllCandidates(repo, {}, ownerContext());
    expect(
      candidates.filter((c) => c.provider === "flashscore" && c.status !== "unmapped"),
    ).toHaveLength(0);
    expect(candidates.filter((c) => c.status === "mapped")).toHaveLength(189);
    expect(preStatuses.size).toBe(1004);
  });

  test("the runner uses only the reviewed read/propose/approve/execute functions", async () => {
    const { manifest, deps, all, calls } = await setup({ tierA: 6, tierB: 4, flashscore: 5 });
    await runPropose(deps, manifest, all);
    await runApprove(deps, manifest, all);
    await runExecute(deps, manifest, all);
    const allowed = new Set([
      "listMappingCandidates",
      "getMappingCandidate",
      "listMappingCandidatesForAppPlayer",
      "listMappingProposals",
      "getMappingProposal",
      "proposeMappings",
      "decideMappingProposal",
      "executeMappingProposal",
    ]);
    expect(Object.keys(calls).filter((name) => !allowed.has(name))).toEqual([]);
  });

  test("deselecting rows leaves them untouched and un-ignored", async () => {
    const { manifest, repo, deps } = await setup({ tierA: 6, tierB: 4, flashscore: 0 });
    const keep = new Set(manifest.rows.slice(0, 7).map((r) => r.candidateId));
    await runPropose(deps, manifest, keep);
    const proposals = await loadAllProposals(repo, null, ownerContext());
    expect(proposals).toHaveLength(7);
    const candidates = await loadAllCandidates(repo, {}, ownerContext());
    const left = manifest.rows.filter((r) => !keep.has(r.candidateId));
    for (const row of left)
      expect(candidates.find((c) => c.id === row.candidateId)!.status).toBe("unmapped");
  });
});

describe("stale evidence", () => {
  test("changed evidence BEFORE propose: that row is skipped as STALE_EVIDENCE, the rest proceed", async () => {
    const { manifest, repo, deps, all } = await setup({ tierA: 6, tierB: 4, flashscore: 0 });
    repo.bumpEvidence("sofascore", manifest.rows[2]!.externalId);
    const out = await runPropose(deps, manifest, all);
    expect(out.outcomes.find((o) => o.candidateId === manifest.rows[2]!.candidateId)).toMatchObject(
      {
        state: "STALE_EVIDENCE",
        code: "evidence_revision_changed",
        acted: false,
      },
    );
    expect(out.outcomes.filter((o) => o.state === "PROPOSED")).toHaveLength(9);
    // And the target is never recomputed into a different player.
    const proposals = await loadAllProposals(repo, null, ownerContext());
    expect(
      proposals.find((p) => p.sofascoreCandidateId === manifest.rows[2]!.candidateId),
    ).toBeUndefined();
  });

  test("changed evidence AFTER propose: that row is not approved, the rest are", async () => {
    const { manifest, repo, deps, all } = await setup({ tierA: 6, tierB: 4, flashscore: 0 });
    await runPropose(deps, manifest, all);
    repo.bumpEvidence("sofascore", manifest.rows[0]!.externalId);
    const out = await runApprove(deps, manifest, all);
    expect(out.outcomes.find((o) => o.candidateId === manifest.rows[0]!.candidateId)!.state).toBe(
      "STALE_EVIDENCE",
    );
    expect(out.outcomes.filter((o) => o.state === "APPROVED")).toHaveLength(9);
  });

  test("changed evidence AFTER approval: that row is not executed, the rest are", async () => {
    const { manifest, repo, deps, all } = await setup({ tierA: 6, tierB: 4, flashscore: 0 });
    await runPropose(deps, manifest, all);
    await runApprove(deps, manifest, all);
    repo.bumpEvidence("sofascore", manifest.rows[4]!.externalId);
    const out = await runExecute(deps, manifest, all);
    expect(out.outcomes.find((o) => o.candidateId === manifest.rows[4]!.candidateId)).toMatchObject(
      {
        state: "STALE_EVIDENCE",
        acted: false,
      },
    );
    expect(out.outcomes.filter((o) => o.state === "EXECUTED")).toHaveLength(9);
    expect(repo.snapshotMappings().length).toBe(9);
  });
});

describe("the world moves while the batch runs; one bad row never corrupts the rest", () => {
  test("a target that gets mapped by someone else mid-run is skipped as TARGET_ALREADY_MAPPED", async () => {
    const { manifest, repo, deps, all } = await setup({ tierA: 6, tierB: 4, flashscore: 0 });
    await runPropose(deps, manifest, all);
    await runApprove(deps, manifest, all);
    repo.mappings.push({
      id: crypto.randomUUID(),
      provider: "sofascore",
      externalId: "SOMEONE-ELSE",
      appPlayerId: manifest.rows[1]!.appPlayerId,
      active: true,
    });
    const out = await runExecute(deps, manifest, all);
    const bad = out.outcomes.find((o) => o.candidateId === manifest.rows[1]!.candidateId)!;
    expect(bad).toMatchObject({ state: "TARGET_ALREADY_MAPPED", code: "already_mapped" });
    expect(out.outcomes.filter((o) => o.state === "EXECUTED")).toHaveLength(9);
    // Nothing was retried: the bad row still has no mapping of its own.
    expect(
      repo.snapshotMappings().filter((m) => m.externalId === manifest.rows[1]!.externalId),
    ).toHaveLength(0);
  });

  test("a provider id that gets mapped mid-run is skipped as PROVIDER_ID_ALREADY_MAPPED", async () => {
    const { manifest, repo, deps, all } = await setup({ tierA: 6, tierB: 4, flashscore: 0 });
    await runPropose(deps, manifest, all);
    await runApprove(deps, manifest, all);
    repo.mappings.push({
      id: crypto.randomUUID(),
      provider: "sofascore",
      externalId: manifest.rows[3]!.externalId,
      appPlayerId: playerId(9999),
      active: true,
    });
    repo.forceCandidateStatus("sofascore", manifest.rows[3]!.externalId, "mapped");
    const out = await runExecute(deps, manifest, all);
    expect(out.outcomes.find((o) => o.candidateId === manifest.rows[3]!.candidateId)!.state).toBe(
      "PROVIDER_ID_ALREADY_MAPPED",
    );
    expect(out.outcomes.filter((o) => o.state === "EXECUTED")).toHaveLength(9);
  });

  test("an approval that is expired or older than 24 hours is never executed", async () => {
    const { manifest, repo, deps, all } = await setup({ tierA: 6, tierB: 4, flashscore: 0 });
    await runPropose(deps, manifest, all);
    await runApprove(deps, manifest, all);
    const proposals = await loadAllProposals(repo, null, ownerContext());
    const byRow = (i: number) =>
      proposals.find((p) => p.sofascoreCandidateId === manifest.rows[i]!.candidateId)!;
    repo.patchProposal(byRow(0).id, { effectiveStatus: "expired" });
    repo.patchProposal(byRow(1).id, {
      decidedAt: new Date(Date.now() - 25 * 3_600_000).toISOString(),
    });
    const out = await runExecute(deps, manifest, all);
    for (const i of [0, 1])
      expect(
        out.outcomes.find((o) => o.candidateId === manifest.rows[i]!.candidateId),
      ).toMatchObject({
        state: "APPROVAL_EXPIRED",
        acted: false,
      });
    expect(out.outcomes.filter((o) => o.state === "EXECUTED")).toHaveLength(8);
  });

  test("a proposal that lands changed (fingerprint not the frozen one) is never approved", async () => {
    const { manifest, repo, deps, all } = await setup({ tierA: 6, tierB: 4, flashscore: 0 });
    await runPropose(deps, manifest, all);
    const proposals = await loadAllProposals(repo, null, ownerContext());
    repo.tamperFingerprint(
      proposals.find((p) => p.sofascoreCandidateId === manifest.rows[0]!.candidateId)!.id,
    );
    const out = await runApprove(deps, manifest, all);
    expect(out.outcomes.find((o) => o.candidateId === manifest.rows[0]!.candidateId)).toMatchObject(
      {
        state: "STALE_EVIDENCE",
        acted: false,
      },
    );
    expect(out.outcomes.filter((o) => o.state === "APPROVED")).toHaveLength(9);
  });

  test("a held proposal (position disagreement) is HELD and does not stop the others", async () => {
    const { manifest, repo, deps, all } = await setup({ tierA: 6, tierB: 4, flashscore: 0 });
    await runPropose(deps, manifest, all);
    const proposals = await loadAllProposals(repo, null, ownerContext());
    repo.patchProposal(
      proposals.find((p) => p.sofascoreCandidateId === manifest.rows[5]!.candidateId)!.id,
      {
        status: "position_disagreement",
        effectiveStatus: "position_disagreement",
      },
    );
    const out = await runApprove(deps, manifest, all);
    expect(out.outcomes.find((o) => o.candidateId === manifest.rows[5]!.candidateId)!.state).toBe(
      "HELD",
    );
    expect(out.outcomes.filter((o) => o.state === "APPROVED")).toHaveLength(9);
  });
});

describe("resumability and duplicate presses", () => {
  test("a browser that closes after 47 of 189 resumes from the database and repeats nothing", async () => {
    const { manifest, repo, deps, all, calls } = await setup();
    await runPropose(deps, manifest, all);

    const stop = new AbortController();
    let done = 0;
    const first = await runApprove(deps, manifest, all, {
      signal: stop.signal,
      onRow: (o) => {
        if (o.acted && (done += 1) === 47) stop.abort();
      },
    });
    expect(first.outcomes.filter((o) => o.state === "APPROVED" && o.acted)).toHaveLength(47);
    expect(calls.decideMappingProposal).toBe(47);
    expect(await states(repo, manifest)).toMatchObject({ APPROVED: 47, PROPOSED: 142 });

    // "Reopen": a brand-new runner and a fresh read of the database, same manifest.
    const resumed = await runApprove(deps, manifest, all);
    expect(calls.decideMappingProposal).toBe(189); // 47 + 142, never 47 twice
    expect(resumed.outcomes.filter((o) => o.acted)).toHaveLength(142);
    expect(await states(repo, manifest)).toMatchObject({ APPROVED: 189 });
  });

  test("a second press while a phase runs gets the SAME run; a re-press after it adds nothing", async () => {
    const { manifest, repo, deps, all, calls } = await setup({
      tierA: 12,
      tierB: 8,
      flashscore: 0,
    });
    const runner = createBulkRunner(deps, manifest);
    const a = runner.run("propose", all);
    const b = runner.run("propose", all);
    expect(b).toBe(a);
    await a;
    expect(calls.proposeMappings).toBe(2);
    await expect(runner.run("approve", all)).resolves.toBeDefined();
    // Pressing PROPOSE again later proposes nothing new: every row already stands where it stands.
    const again = await runner.run("propose", all);
    expect(again.outcomes.every((o) => !o.acted)).toBe(true);
    expect(calls.proposeMappings).toBe(2);
    expect(await loadAllProposals(repo, null, ownerContext())).toHaveLength(20);
  });

  test("a different phase cannot start while one is running", async () => {
    const { manifest, deps, all } = await setup({ tierA: 6, tierB: 4, flashscore: 0 });
    const runner = createBulkRunner(deps, manifest);
    const running = runner.run("propose", all);
    await expect(runner.run("execute", all)).rejects.toThrow("another_phase_is_running");
    await running;
    expect(runner.busy).toBe(false);
  });

  test("a lost session stops the phase at once and does not hammer the backend", async () => {
    const { manifest, repo, deps, all, calls } = await setup({ tierA: 6, tierB: 4, flashscore: 0 });
    await runPropose(deps, manifest, all);
    repo.setSession(OWNER, { recentSignIn: false });
    const out = await runApprove(deps, manifest, all);
    expect(out.aborted).toEqual({ code: "recent_auth_required" });
    expect(calls.decideMappingProposal).toBe(1);
    expect(out.outcomes.filter((o) => o.state === "APPROVED")).toHaveLength(0);
  });

  test("with the second factor missing nothing is proposed", async () => {
    const { manifest, repo, deps, all } = await setup({ tierA: 6, tierB: 4, flashscore: 0 });
    repo.setSession(OWNER, { aal2: false });
    const out = await runPropose(deps, manifest, all);
    expect(out.aborted).toEqual({ code: "mfa_assurance_insufficient" });
    expect(await loadAllProposals(repo, null, ownerContext())).toHaveLength(0);
  });
});

describe("excluded populations", () => {
  test("a Flashscore candidate, an app January-1 date, or an incomplete squad can never enter the manifest's batch", async () => {
    const world = buildWorld({
      tierA: 3,
      tierB: 2,
      flashscore: 10,
      incompleteSquad: 3,
      january1Provider: 3,
      appJanuary1: 3,
    });
    const manifest = await oracleManifest(world);
    const repo = newRepo(world);
    const deps: BulkDeps = { repository: repo, context: ownerContext };
    await runPropose(deps, manifest, new Set(manifest.rows.map((r) => r.candidateId)));
    const proposals = await loadAllProposals(repo, null, ownerContext());
    expect(proposals).toHaveLength(5);
    const outsiders = world.candidates.filter(
      (c) => !manifest.rows.some((r) => r.candidateId === c.id),
    );
    expect(outsiders.length).toBe(19);
    const now = await loadAllCandidates(repo, {}, ownerContext());
    for (const o of outsiders) expect(now.find((c) => c.id === o.id)!.status).toBe("unmapped");
    expect(candidateUuid(1)).toBeDefined();
  });
});
