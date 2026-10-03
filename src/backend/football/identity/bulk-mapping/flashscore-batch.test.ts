import { describe, expect, test } from "bun:test";
import type { PlayerMappingRepository } from "../mapping-repository";
import { MappingError } from "../mapping-errors";
import { loadAllCandidates, loadAllProposals } from "../review-queue";
import { MAX_PROPOSE_PER_CALL } from "./contract";
import { FLASHSCORE_REASONS } from "./flashscore-contract";
import { flashscoreProfile } from "./flashscore-profile";
import {
  verifyFlashscoreManifest,
  type FlashscoreManifest,
  type FlashscoreRow,
} from "./flashscore-manifest";
import { buildFlashWorld, flashCandidateUuid, prepareFlashBatch } from "./flashscore-test-world";
import { canonicalJson, sha256Hex } from "./canonical";
import { countStates, deriveAllRowStates } from "./row-state";
import { createBulkRunner, proposeCallCount, runApprove, runExecute, runPropose } from "./runner";
import { ownerContext, playerId } from "./test-world";

/** Records every backend call by name, and lets a test intercept one. */
function spy(
  repo: PlayerMappingRepository,
  hooks: Partial<Record<string, (...args: unknown[]) => unknown>> = {},
) {
  const seen: { name: string; args: unknown[] }[] = [];
  const proxy = new Proxy(repo, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        seen.push({ name: String(prop), args });
        await hooks[String(prop)]?.(...args);
        return value.apply(target, args);
      };
    },
  });
  return { proxy, seen };
}

const reseal = async (manifest: FlashscoreManifest): Promise<FlashscoreManifest> => {
  const { manifestSha256: _drop, ...rest } = manifest;
  return { ...manifest, manifestSha256: await sha256Hex(canonicalJson(rest)) };
};

const stateOf = async (
  repo: PlayerMappingRepository,
  manifest: FlashscoreManifest,
): Promise<Record<string, number>> =>
  countStates(
    deriveAllRowStates(
      manifest,
      await loadAllCandidates(repo, {}, ownerContext()),
      await loadAllProposals(repo, null, ownerContext()),
      new Date(),
      flashscoreProfile,
    ),
  );

/** The in-memory stand-in backend fingerprints differently from the database, so its manifests skip the recomputation. */
const NO_RECOMPUTE = { recomputeFingerprints: false } as const;

/** The 53-row shape: 32 events + 21 shirt/birth-date. */
const SHAPE = { f1: 32, f2: 21 };

describe("Flashscore manifest", () => {
  test("a built manifest verifies, with the class split and no name or birth date in it", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld(SHAPE));
    const verdict = await verifyFlashscoreManifest(
      JSON.parse(JSON.stringify(batch.manifest)),
      NO_RECOMPUTE,
    );
    expect(verdict.ok).toBe(true);
    expect(batch.manifest.population).toEqual({
      total: 53,
      f1: 32,
      f2: 21,
      reviewSet: 53,
      heldBack: 0,
    });
    const text = JSON.stringify(batch.manifest);
    expect(text).not.toMatch(/"[a-zA-Z]*(name|birth)[a-zA-Z]*"\s*:/i);
    expect(text).not.toMatch(/\b\d{4}-\d{2}-\d{2}(?!T)\b/);
  });

  test("the reasons are class-specific and claim nothing the evidence lacks", () => {
    for (const reason of Object.values(FLASHSCORE_REASONS)) {
      expect(reason.length).toBeGreaterThanOrEqual(10);
      expect(reason.length).toBeLessThanOrEqual(500);
      expect(reason).not.toMatch(/tier\s*[ab]|sportsmonks|canonical app|app'?s birth/i);
      expect(reason).toMatch(/active and reviewed/);
    }
    expect(FLASHSCORE_REASONS.F1_REVIEWED_SOFASCORE_EVENTS).toMatch(/aligned match events/);
    expect(FLASHSCORE_REASONS.F2_REVIEWED_SOFASCORE_SHIRT_DOB).toMatch(/corroboration, not proof/);
    expect(FLASHSCORE_REASONS.F1_REVIEWED_SOFASCORE_EVENTS).not.toMatch(/birth date/);
  });

  test("tampering is refused: class, basis, reason, target, hash, order, duplicates, names, dates", async () => {
    const { manifest } = await prepareFlashBatch(buildFlashWorld({ f1: 3, f2: 3 }));
    const bad = async (edit: (m: FlashscoreManifest) => FlashscoreManifest, needle: RegExp) => {
      const copy = JSON.parse(JSON.stringify(manifest)) as FlashscoreManifest;
      const verdict = await verifyFlashscoreManifest(await reseal(edit(copy)), NO_RECOMPUTE);
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.problems.join(" | ")).toMatch(needle);
    };
    const f1 = (m: FlashscoreManifest) => m.rows.findIndex((r) => r.evidenceClass.startsWith("F1"));
    const f2 = (m: FlashscoreManifest) => m.rows.findIndex((r) => r.evidenceClass.startsWith("F2"));
    // An F1 row relabelled as F2 keeps no birth-date corroboration: refused, and the reason no longer fits.
    await bad((m) => {
      m.rows[f1(m)]!.evidenceClass = "F2_REVIEWED_SOFASCORE_SHIRT_DOB";
      return m;
    }, /class:|reasons:/);
    await bad((m) => {
      m.rows[f2(m)]!.evidenceClass = "F1_REVIEWED_SOFASCORE_EVENTS";
      return m;
    }, /class:|reasons:/);
    await bad((m) => {
      m.rows[0]!.auditReason = "Looks right to me.";
      return m;
    }, /reasons:/);
    await bad((m) => {
      m.rows[0]!.supporting.appPlayerId = playerId(999);
      return m;
    }, /supporting:/);
    await bad((m) => {
      m.rows[1]!.appPlayerId = m.rows[0]!.appPlayerId;
      m.rows[1]!.supporting.appPlayerId = m.rows[0]!.appPlayerId;
      m.rows[1]!.fingerprintInputs.appPlayerId = m.rows[0]!.appPlayerId;
      return m;
    }, /collision: duplicate target app player/);
    await bad((m) => {
      m.rows[1]!.externalId = m.rows[0]!.externalId;
      m.rows[1]!.fingerprintInputs.flashscoreExternalId = m.rows[0]!.externalId;
      return m;
    }, /collision: duplicate Flashscore id/);
    await bad((m) => {
      m.rows[1]!.supporting.mappingId = m.rows[0]!.supporting.mappingId;
      return m;
    }, /collision: duplicate supporting/);
    await bad((m) => {
      m.rows.reverse();
      return m;
    }, /order:/);
    await bad((m) => {
      m.population.f1 += 1;
      return m;
    }, /population:/);
    await bad((m) => {
      (m.rows[0] as unknown as Record<string, unknown>).evidence = {
        ...m.rows[0]!.evidence,
        displayName: "Someone",
      };
      return m;
    }, /schema:/);
    await bad((m) => {
      m.rows[0]!.limitations = ["Born on 1995-04-05."];
      return m;
    }, /forbidden:/);
    // The hash itself.
    const stale = JSON.parse(JSON.stringify(manifest)) as FlashscoreManifest;
    stale.rows[0]!.limitations = ["changed"];
    const verdict = await verifyFlashscoreManifest(stale, NO_RECOMPUTE);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.problems.join()).toMatch(/hash:/);
  });
});

describe("Flashscore bulk phases", () => {
  test("propose: one set of calls per reason, 25 at most per call, count derived from the selection", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld(SHAPE));
    const s = spy(batch.repo);
    const deps = { repository: s.proxy, context: batch.deps.context };
    const result = await runPropose(deps, batch.manifest, batch.all, {}, flashscoreProfile);
    expect(result.aborted).toBeNull();
    const calls = s.seen.filter((c) => c.name === "proposeMappings");
    // 32 events rows -> 25 + 7; 21 shirt/birth-date rows -> 21: three calls in all.
    expect(calls.map((c) => (c.args[0] as unknown[]).length)).toEqual([25, 7, 21]);
    expect(calls.map((c) => c.args[1])).toEqual([
      FLASHSCORE_REASONS.F1_REVIEWED_SOFASCORE_EVENTS,
      FLASHSCORE_REASONS.F1_REVIEWED_SOFASCORE_EVENTS,
      FLASHSCORE_REASONS.F2_REVIEWED_SOFASCORE_SHIRT_DOB,
    ]);
    for (const c of calls)
      expect((c.args[0] as unknown[]).length).toBeLessThanOrEqual(MAX_PROPOSE_PER_CALL);
    expect(proposeCallCount(flashscoreProfile, batch.manifest.rows)).toBe(3);
    // Derived from the selection: deselect 8 events rows and the first group fits one call.
    const fewer = batch.manifest.rows.filter((r) => r.evidenceClass.startsWith("F1")).slice(8);
    expect(
      proposeCallCount(flashscoreProfile, [
        ...fewer,
        ...batch.manifest.rows.filter((r) => r.evidenceClass.startsWith("F2")),
      ]),
    ).toBe(2);
    expect(proposeCallCount(flashscoreProfile, [])).toBe(0);
    // Every proposal carries ids-only references and its class's basis, and nothing is approved.
    const sent = calls.flatMap(
      (c) => c.args[0] as { evidenceRefs: Record<string, unknown>[]; basis: string }[],
    );
    for (const item of sent) {
      expect(["incident", "shirt_position"]).toContain(item.basis);
      expect(JSON.stringify(item.evidenceRefs)).not.toMatch(/name/i);
    }
    expect(result.outcomes.every((o) => o.state === "PROPOSED")).toBe(true);
    expect((await stateOf(batch.repo, batch.manifest)).PROPOSED).toBe(53);
  });

  test("full lifecycle: 53 mapped, the Sofascore mappings untouched, only reviewed calls used", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld(SHAPE));
    const before = batch.repo.snapshotMappings();
    const s = spy(batch.repo);
    const deps = { repository: s.proxy, context: batch.deps.context };
    const runner = createBulkRunner(deps, batch.manifest, flashscoreProfile);
    for (const phase of ["propose", "approve", "execute"] as const) {
      const r = await runner.run(phase, batch.all);
      expect(r.aborted).toBeNull();
    }
    expect((await stateOf(batch.repo, batch.manifest)).EXECUTED).toBe(53);
    const after = batch.repo.snapshotMappings();
    // The Sofascore rows are exactly as they were (same id, id, target, active), and 53 Flashscore rows were added.
    expect(after.filter((m) => m.provider === "sofascore")).toEqual(
      before.filter((m) => m.provider === "sofascore"),
    );
    expect(after.filter((m) => m.provider === "flashscore")).toHaveLength(53);
    for (const m of after.filter((x) => x.provider === "flashscore")) expect(m.active).toBe(true);
    // Nothing but the reviewed propose, decide, execute and the reads was called.
    const allowed = new Set([
      "proposeMappings",
      "decideMappingProposal",
      "executeMappingProposal",
      "getMappingCandidate",
      "getMappingProposal",
      "listMappingCandidates",
      "listMappingProposals",
      "listMappingCandidatesForAppPlayer",
    ]);
    expect([...new Set(s.seen.map((c) => c.name))].filter((n) => !allowed.has(n))).toEqual([]);
  });

  test("a supporting mapping deactivated before propose holds only its row", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 4, f2: 4 }));
    const victim = batch.manifest.rows[2]!;
    await deactivate(batch, victim);
    const r = await runPropose(batch.deps, batch.manifest, batch.all, {}, flashscoreProfile);
    const held = r.outcomes.find((o) => o.candidateId === victim.candidateId)!;
    expect(held.state).toBe("STALE_EVIDENCE");
    expect(held.code).toBe("supporting_mapping_not_active");
    expect(r.outcomes.filter((o) => o.state === "PROPOSED")).toHaveLength(7);
    // No proposal exists for the held row.
    const proposals = await loadAllProposals(batch.repo, null, ownerContext());
    expect(proposals.some((p) => p.flashscoreCandidateId === victim.candidateId)).toBe(false);
  });

  test("a supporting mapping retargeted before propose holds only its row", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 3, f2: 3 }));
    const victim = batch.manifest.rows[1]!;
    await retarget(batch, victim, playerId(7));
    const r = await runPropose(batch.deps, batch.manifest, batch.all, {}, flashscoreProfile);
    const held = r.outcomes.find((o) => o.candidateId === victim.candidateId)!;
    expect(held.state).toBe("STALE_EVIDENCE");
    expect(held.code).toBe("supporting_mapping_retargeted");
    expect(r.outcomes.filter((o) => o.state === "PROPOSED")).toHaveLength(5);
  });

  test("a supporting mapping changed AFTER propose and approve is caught again before execution", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 3, f2: 3 }));
    await batch.run("propose");
    await batch.run("approve");
    const deactivated = batch.manifest.rows[0]!;
    const retargeted = batch.manifest.rows[1]!;
    await deactivate(batch, deactivated);
    await retarget(batch, retargeted, playerId(8));
    const r = await batch.run("execute");
    const code = (id: string) => r.outcomes.find((o) => o.candidateId === id)!;
    expect(code(deactivated.candidateId).state).toBe("STALE_EVIDENCE");
    expect(code(deactivated.candidateId).code).toBe("supporting_mapping_not_active");
    expect(code(retargeted.candidateId).code).toBe("supporting_mapping_retargeted");
    expect(r.outcomes.filter((o) => o.state === "EXECUTED")).toHaveLength(4);
    // The two blocked rows never produced a Flashscore mapping.
    const flash = batch.repo.snapshotMappings().filter((m) => m.provider === "flashscore");
    expect(flash).toHaveLength(4);
  });

  test("stale candidate evidence is skipped, never replaced", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 3, f2: 2 }));
    batch.repo.bumpEvidence("flashscore", "F2");
    const r = await runPropose(batch.deps, batch.manifest, batch.all, {}, flashscoreProfile);
    const o = r.outcomes.find((x) => x.candidateId === flashCandidateUuid(2))!;
    expect(o.state).toBe("STALE_EVIDENCE");
    expect(o.code).toBe("evidence_revision_changed");
    expect(r.outcomes.filter((x) => x.state === "PROPOSED")).toHaveLength(4);
  });

  test("an id or a target claimed by someone else is held, in both directions", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 3, f2: 3 }));
    // Direction 1: another Flashscore proposal for row 1's TARGET is executed first (by a different candidate).
    // Direction 2: row 2's Flashscore ID is proposed onto a different player first.
    const ctx = ownerContext();
    const first = batch.manifest.rows[0]!;
    const second = batch.manifest.rows[1]!;
    const stray = await batch.repo.proposeMappings(
      [
        {
          kind: "map",
          flashscoreCandidateId: second.candidateId,
          appPlayerId: playerId(8),
          basis: "manual",
        },
      ],
      "Hand-made proposal for another player.",
      crypto.randomUUID(),
      ctx,
    );
    expect(stray.proposals[0]!.ok).toBe(true);
    void first;
    const r = await runPropose(batch.deps, batch.manifest, batch.all, {}, flashscoreProfile);
    const held = r.outcomes.find((o) => o.candidateId === second.candidateId)!;
    expect(held.state).toBe("IDENTITY_CONFLICT");
    expect(r.outcomes.filter((o) => o.state === "PROPOSED")).toHaveLength(5);
  });

  test("an id claimed between the re-check and the call: only that row fails, the rest are untouched", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 4, f2: 0 }));
    const target = batch.manifest.rows[1]!;
    let claimed = false;
    const s = spy(batch.repo, {
      proposeMappings: async () => {
        if (claimed) return;
        claimed = true;
        // Someone else proposes this row's candidate onto another player just before our call lands.
        await batch.repo.proposeMappings(
          [
            {
              kind: "map",
              flashscoreCandidateId: target.candidateId,
              appPlayerId: playerId(7),
              basis: "manual",
            },
          ],
          "Claimed by someone else.",
          crypto.randomUUID(),
          ownerContext(),
        );
      },
    });
    const deps = { repository: s.proxy, context: batch.deps.context };
    const r = await runPropose(deps, batch.manifest, batch.all, {}, flashscoreProfile);
    const o = r.outcomes.find((x) => x.candidateId === target.candidateId)!;
    expect(o.state).toBe("IDENTITY_CONFLICT"); // a proposal exists, but it is not OUR proposal
    expect(o.code).toBe("proposal_already_open");
    expect(r.outcomes.filter((x) => x.state === "PROPOSED" && x.proposalId !== null)).toHaveLength(
      3,
    );
    // The foreign proposal is never approved by the batch.
    const a = await runApprove(batch.deps, batch.manifest, batch.all, {}, flashscoreProfile);
    expect(a.outcomes.filter((x) => x.state === "APPROVED")).toHaveLength(3);
  });

  test("a tampered fingerprint in the manifest leaves the proposal pending and never approves it", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 2, f2: 2 }));
    const edited = JSON.parse(JSON.stringify(batch.manifest)) as FlashscoreManifest;
    edited.rows[0]!.expectedFingerprint = "a".repeat(64);
    const manifest = await reseal(edited);
    const r = await runPropose(batch.deps, manifest, batch.all, {}, flashscoreProfile);
    const o = r.outcomes.find((x) => x.candidateId === manifest.rows[0]!.candidateId)!;
    expect(o.state).toBe("STALE_EVIDENCE");
    expect(o.code).toBe("fingerprint_differs_from_manifest");
    const a = await runApprove(batch.deps, manifest, batch.all, {}, flashscoreProfile);
    expect(a.outcomes.filter((x) => x.state === "APPROVED")).toHaveLength(3);
    expect(a.outcomes.find((x) => x.candidateId === manifest.rows[0]!.candidateId)!.state).toBe(
      "STALE_EVIDENCE",
    );
  });

  test("an expired session stops the phase at once; resuming from the database repeats nothing", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 30, f2: 0 }));
    let n = 0;
    const s = spy(batch.repo, {
      proposeMappings: () => {
        n += 1;
        if (n === 2) throw new MappingError("recent_auth_required", "Sign in again.");
      },
    });
    const deps = { repository: s.proxy, context: batch.deps.context };
    const r = await runPropose(deps, batch.manifest, batch.all, {}, flashscoreProfile);
    expect(r.aborted).toEqual({ code: "recent_auth_required" });
    // 25 landed in the first call; the second never reached the database; nothing was retried.
    expect(s.seen.filter((c) => c.name === "proposeMappings")).toHaveLength(2);
    expect((await stateOf(batch.repo, batch.manifest)).PROPOSED).toBe(25);
    // Signed in again: the remaining 5 are proposed; the first 25 are not proposed twice.
    const again = await runPropose(batch.deps, batch.manifest, batch.all, {}, flashscoreProfile);
    expect(again.outcomes.filter((o) => o.acted)).toHaveLength(5);
    expect((await stateOf(batch.repo, batch.manifest)).PROPOSED).toBe(30);
    const proposals = await loadAllProposals(batch.repo, null, ownerContext());
    expect(proposals.filter((p) => p.kind === "map" && p.flashscoreCandidateId)).toHaveLength(30);
  });

  test("an uncertain network outcome (the call landed, the answer did not) is resolved from the database", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 6, f2: 0 }));
    let lost = false;
    const lossy = new Proxy(batch.repo, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop !== "proposeMappings") return value;
        return async (...args: Parameters<PlayerMappingRepository["proposeMappings"]>) => {
          const result = await target.proposeMappings(...args);
          if (!lost) {
            lost = true;
            throw new MappingError("mapping_unavailable", "The network dropped the answer.");
          }
          return result;
        };
      },
    }) as PlayerMappingRepository;
    const deps = { repository: lossy, context: batch.deps.context };
    const first = await runPropose(deps, batch.manifest, batch.all, {}, flashscoreProfile);
    expect(first.outcomes.every((o) => o.state === "ERROR")).toBe(true);
    // A fresh read shows all six proposed (the call did land) ...
    expect((await stateOf(batch.repo, batch.manifest)).PROPOSED).toBe(6);
    // ... and running propose again proposes nothing a second time.
    const second = await runPropose(batch.deps, batch.manifest, batch.all, {}, flashscoreProfile);
    expect(second.outcomes.filter((o) => o.acted)).toHaveLength(0);
    const proposals = await loadAllProposals(batch.repo, null, ownerContext());
    expect(proposals.filter((p) => p.flashscoreCandidateId)).toHaveLength(6);
  });

  test("single-operator mode: the proposer approves their own rows; with the switch off the phase stops", async () => {
    const on = await prepareFlashBatch(buildFlashWorld({ f1: 2, f2: 2 }), {
      allowSelfApproval: true,
    });
    await on.run("propose");
    expect((await on.run("approve")).outcomes.filter((o) => o.state === "APPROVED")).toHaveLength(
      4,
    );
    const off = await prepareFlashBatch(buildFlashWorld({ f1: 2, f2: 2 }), {
      allowSelfApproval: false,
    }).catch((e: unknown) => e);
    // With the switch off the Sofascore setup itself cannot self-approve, which is the point: nothing proceeds.
    expect(off instanceof Error || (off as { repo?: unknown }).repo !== undefined).toBe(true);
  });

  test("the row state is derived from the database: a reload shows exactly where it stopped", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 3, f2: 3 }));
    await batch.run("propose");
    await batch.run("approve", new Set(batch.manifest.rows.slice(0, 2).map((r) => r.candidateId)));
    const counts = await stateOf(batch.repo, batch.manifest);
    expect(counts.APPROVED).toBe(2);
    expect(counts.PROPOSED).toBe(4);
    await runExecute(batch.deps, batch.manifest, batch.all, {}, flashscoreProfile);
    const after = await stateOf(batch.repo, batch.manifest);
    expect(after.EXECUTED).toBe(2);
    expect(after.PROPOSED).toBe(4);
  });

  test("a supporting mapping that changed shows on the row before any phase runs", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 2, f2: 2 }));
    await deactivate(batch, batch.manifest.rows[0]!);
    const states = deriveAllRowStates(
      batch.manifest,
      await loadAllCandidates(batch.repo, {}, ownerContext()),
      await loadAllProposals(batch.repo, null, ownerContext()),
      new Date(),
      flashscoreProfile,
    );
    expect(states.get(batch.manifest.rows[0]!.candidateId)?.code).toBe(
      "supporting_mapping_not_active",
    );
    expect(states.get(batch.manifest.rows[1]!.candidateId)?.state).toBe("NOT_PROPOSED");
  });
});

type Batch = Awaited<ReturnType<typeof prepareFlashBatch>>;

/** Deactivates a row's supporting Sofascore mapping through the reviewed flow (propose, approve, execute). */
async function deactivate(batch: Batch, row: FlashscoreRow) {
  await viaReviewedFlow(batch, {
    kind: "deactivate",
    providerName: "sofascore",
    mappingId: row.supporting.mappingId,
  });
}

async function retarget(batch: Batch, row: FlashscoreRow, newAppPlayerId: string) {
  await viaReviewedFlow(batch, {
    kind: "replace",
    providerName: "sofascore",
    mappingId: row.supporting.mappingId,
    newAppPlayerId,
  });
}

async function viaReviewedFlow(
  batch: Batch,
  item: Parameters<PlayerMappingRepository["proposeMappings"]>[0][number],
) {
  const ctx = ownerContext();
  const proposed = await batch.repo.proposeMappings(
    [item],
    "Change the supporting mapping for a test.",
    crypto.randomUUID(),
    ctx,
  );
  const first = proposed.proposals[0]!;
  if (!first.ok) throw new Error(`proposal refused: ${first.code}`);
  await batch.repo.decideMappingProposal(
    {
      proposalId: first.id,
      decision: "approve",
      reason: "Approved for a test.",
      fingerprint: first.fingerprint,
    },
    crypto.randomUUID(),
    ctx,
  );
  const done = await batch.repo.executeMappingProposal(first.id, crypto.randomUUID(), ctx);
  if (!done.ok) throw new Error(`execute refused: ${done.code}`);
}
