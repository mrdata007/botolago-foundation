import { describe, expect, test } from "bun:test";
import type { PlayerMappingRepository } from "../mapping-repository";
import { MappingError } from "../mapping-errors";
import { loadAllCandidates, loadAllProposals } from "../review-queue";
import { MAX_PROPOSE_PER_CALL } from "./contract";
import { FLASHSCORE_REASONS } from "./flashscore-contract";
import { createMappingActions } from "@/components/admin/player-mappings/use-player-mappings";
import { flashscoreProfile, guardFlashscoreExecute } from "./flashscore-profile";
import {
  verifyFlashscoreManifest,
  type FlashscoreManifest,
  type FlashscoreRow,
} from "./flashscore-manifest";
import { buildFlashWorld, flashCandidateUuid, prepareFlashBatch } from "./flashscore-test-world";
import { canonicalJson, sha256Hex } from "./canonical";
import { countStates, deriveAllRowStates } from "./row-state";
import { createBulkRunner, proposeCallCount, runApprove, runExecute, runPropose } from "./runner";
import { candidateUuid, ownerContext, playerId } from "./test-world";

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
      "getProviderMapping",
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
    expect(held.code).toBe("supporting_mapping_inactive");
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
    expect(held.code).toBe("supporting_mapping_target_mismatch");
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
    expect(code(deactivated.candidateId).code).toBe("supporting_mapping_inactive");
    expect(code(retargeted.candidateId).code).toBe("supporting_mapping_target_mismatch");
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
      [await supportedItem(batch, second.candidateId, 8)],
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
    // The stray proposal below is legal on its own terms: its target has a reviewed Sofascore mapping.
    const strayItemForTarget = await supportedItem(batch, target.candidateId, 7);
    let claimed = false;
    const s = spy(batch.repo, {
      proposeMappings: async () => {
        if (claimed) return;
        claimed = true;
        // Someone else proposes this row's candidate onto another player just before our call lands.
        await batch.repo.proposeMappings(
          [strayItemForTarget],
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
      await flashscoreProfile.loadSupporting!(batch.deps, batch.manifest.rows),
    );
    expect(states.get(batch.manifest.rows[0]!.candidateId)?.code).toBe(
      "supporting_mapping_inactive",
    );
    expect(states.get(batch.manifest.rows[1]!.candidateId)?.state).toBe("NOT_PROPOSED");
  });
});

describe("executing one Flashscore proposal outside the bulk runner", () => {
  test("the ordinary queue's execute re-checks the supporting mapping too: refused when it changed, allowed when it did not", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 2, f2: 2 }));
    await batch.run("propose");
    await batch.run("approve");
    const proposals = await loadAllProposals(batch.repo, null, ownerContext());
    const proposalOf = (row: FlashscoreRow) =>
      proposals.find((p) => p.flashscoreCandidateId === row.candidateId)!;
    const guard = (proposal: Parameters<typeof guardFlashscoreExecute>[2]) =>
      guardFlashscoreExecute(batch.deps, batch.manifest.rows, proposal);
    const actions = createMappingActions(batch.repo, () => ownerContext(), { guardExecute: guard });

    const changed = batch.manifest.rows[0]!;
    const fine = batch.manifest.rows[1]!;
    await deactivate(batch, changed);
    await expect(actions.execute(proposalOf(changed))).rejects.toMatchObject({
      code: "stale_evidence",
    });
    expect(batch.repo.snapshotMappings().some((m) => m.provider === "flashscore")).toBe(false);

    await actions.execute(proposalOf(fine));
    const flash = batch.repo.snapshotMappings().filter((m) => m.provider === "flashscore");
    expect(flash).toHaveLength(1);
    expect(flash[0]!.appPlayerId).toBe(fine.appPlayerId);
  });

  test("a proposal the manifest does not cover, and one that is not a Flashscore map, are left to the backend", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 1, f2: 1 }));
    const guard = (p: Parameters<typeof guardFlashscoreExecute>[2]) =>
      guardFlashscoreExecute(batch.deps, batch.manifest.rows, p);
    expect(
      await guard({ kind: "map", flashscoreCandidateId: "99999999-9999-4999-8999-999999999999" }),
    ).toBeNull();
    expect(await guard({ kind: "map", flashscoreCandidateId: null })).toBeNull();
    expect(
      await guard({
        kind: "deactivate",
        flashscoreCandidateId: batch.manifest.rows[0]!.candidateId,
      }),
    ).toBeNull();
  });
});

type Batch = Awaited<ReturnType<typeof prepareFlashBatch>>;

/**
 * A legal hand-made Flashscore proposal onto player `n`: first maps player n's Sofascore identity
 * through the reviewed flow (so the dependency the database requires exists), then returns the item.
 */
async function supportedItem(batch: Batch, flashscoreCandidateId: string, n: number) {
  const ctx = ownerContext();
  const sofa = await batch.repo.getMappingCandidate(candidateUuid(n), ctx);
  if (sofa.existingMappingId === null)
    await viaReviewedFlow(batch, {
      kind: "map",
      sofascoreCandidateId: candidateUuid(n),
      appPlayerId: playerId(n),
      basis: "manual",
    });
  const mapping = (await batch.repo.getProviderMapping("sofascore", sofa.externalId, ctx))!;
  return {
    kind: "map" as const,
    flashscoreCandidateId,
    appPlayerId: playerId(n),
    basis: "incident" as const,
    evidenceRefs: [{ source: "reviewed_sofascore_mapping", mappingId: mapping.mappingId }],
    evidenceClass: "F1_REVIEWED_SOFASCORE_EVENTS" as const,
    supportingMappingId: mapping.mappingId,
  };
}

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

describe("the dependency on the supporting mapping, as the database enforces it (stand-in repository, same refusals)", () => {
  const propose = (batch: Batch, item: Record<string, unknown>) =>
    batch.repo.proposeMappings(
      [item as never],
      "A proposal made without the batch tool.",
      crypto.randomUUID(),
      ownerContext(),
    );
  const codeOf = async (batch: Batch, item: Record<string, unknown>) => {
    const r = await propose(batch, item);
    const first = r.proposals[0]!;
    return first.ok ? "ok" : first.code;
  };
  const base = (batch: Batch) => {
    const row = batch.manifest.rows[0]!;
    return {
      row,
      item: {
        kind: "map",
        flashscoreCandidateId: row.candidateId,
        appPlayerId: row.appPlayerId,
        basis: "incident",
        evidenceRefs: [{ source: "reviewed_sofascore_mapping" }],
        evidenceClass: row.evidenceClass,
        supportingMappingId: row.supporting.mappingId,
      },
    };
  };

  test("every proposal the batch sends names its supporting mapping and class; none is sent without", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 3, f2: 3 }));
    const s = spy(batch.repo);
    await runPropose(
      { repository: s.proxy, context: batch.deps.context },
      batch.manifest,
      batch.all,
      {},
      flashscoreProfile,
    );
    const sent = s.seen
      .filter((c) => c.name === "proposeMappings")
      .flatMap(
        (c) =>
          c.args[0] as {
            flashscoreCandidateId: string;
            evidenceClass: string;
            supportingMappingId: string;
          }[],
      );
    expect(sent).toHaveLength(6);
    for (const item of sent) {
      const row = batch.manifest.rows.find((r) => r.candidateId === item.flashscoreCandidateId)!;
      expect(item.evidenceClass).toBe(row.evidenceClass);
      expect(item.supportingMappingId).toBe(row.supporting.mappingId);
    }
  });

  test("a Flashscore-only proposal without the dependency is refused, whoever asks: nothing is created", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 2, f2: 2 }));
    const { row, item } = base(batch);
    const bare = { ...item } as Record<string, unknown>;
    delete bare.evidenceClass;
    delete bare.supportingMappingId;
    expect(await codeOf(batch, bare)).toBe("supporting_dependency_required");
    expect(await codeOf(batch, { ...item, supportingMappingId: undefined })).toBe(
      "supporting_dependency_required",
    );
    expect(await codeOf(batch, { ...item, evidenceClass: undefined })).toBe(
      "supporting_dependency_required",
    );
    expect(await codeOf(batch, { ...item, evidenceClass: "F9_MADE_UP" })).toBe(
      "supporting_dependency_invalid",
    );
    const proposals = await loadAllProposals(batch.repo, null, ownerContext());
    expect(proposals.some((p) => p.flashscoreCandidateId === row.candidateId)).toBe(false);
  });

  test("a made-up, wrong-provider, wrong-player or label-only supporting mapping is refused with its own code", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 3, f2: 3 }));
    const { row, item } = base(batch);
    expect(
      await codeOf(batch, { ...item, supportingMappingId: "99999999-9999-4999-8999-999999999999" }),
    ).toBe("supporting_mapping_missing");
    // another row's supporting mapping belongs to another player
    const other = batch.manifest.rows[1]!;
    expect(await codeOf(batch, { ...item, supportingMappingId: other.supporting.mappingId })).toBe(
      "supporting_mapping_target_mismatch",
    );
    // a hand-made row with the right-looking label and no audit record behind it is not reviewed
    const handMade = batch.repo.mappings.find((m) => m.id === row.supporting.mappingId)!;
    const saved = handMade.writtenBy;
    handMade.writtenBy = undefined;
    expect(await codeOf(batch, item)).toBe("supporting_mapping_unreviewed");
    // ... and so does one edited by hand after the reviewed write (the record no longer matches)
    handMade.writtenBy = saved;
    handMade.externalId = "EDITED-BY-HAND";
    expect(await codeOf(batch, item)).toBe("supporting_mapping_unreviewed");
    handMade.externalId = row.supporting.externalId;
    expect(await codeOf(batch, item)).toBe("ok");
  });

  test("the dependency is not accepted where it does not apply", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 2, f2: 2 }));
    const { row, item } = base(batch);
    // an ignore, or a Sofascore proposal, never carries it
    expect(
      await codeOf(batch, {
        kind: "ignore",
        flashscoreCandidateId: row.candidateId,
        evidenceClass: row.evidenceClass,
        supportingMappingId: row.supporting.mappingId,
        evidenceRefs: [{ source: "x" }],
      }),
    ).toBe("supporting_dependency_not_applicable");
    expect(await codeOf(batch, { ...item, evidenceRefs: [] })).toBe("evidence_refs_required");
  });

  test("approved, then the supporting mapping breaks: the repository itself holds the execution, with or without the client guard", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 2, f2: 2 }));
    await batch.run("propose");
    await batch.run("approve");
    const row = batch.manifest.rows[0]!;
    await deactivate(batch, row);
    // no client guard at all: the ordinary queue's actions with no guardExecute
    const proposals = await loadAllProposals(batch.repo, null, ownerContext());
    const proposal = proposals.find((p) => p.flashscoreCandidateId === row.candidateId)!;
    const result = await batch.repo.executeMappingProposal(
      proposal.id,
      crypto.randomUUID(),
      ownerContext(),
    );
    expect(result).toMatchObject({ ok: false, code: "supporting_mapping_inactive" });
    expect(
      batch.repo
        .snapshotMappings()
        .some((m) => m.provider === "flashscore" && m.externalId === row.externalId),
    ).toBe(false);
  });

  test("a supporting mapping changed and restored through the reviewed flow is a new state: the old approval is refused", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 2, f2: 2 }));
    await batch.run("propose");
    await batch.run("approve");
    const row = batch.manifest.rows[0]!;
    await deactivate(batch, row);
    await viaReviewedFlow(batch, {
      kind: "reactivate",
      providerName: "sofascore",
      mappingId: row.supporting.mappingId,
    });
    const now = (await batch.repo.getProviderMapping(
      "sofascore",
      row.supporting.externalId,
      ownerContext(),
    ))!;
    expect(now.active && now.reviewed).toBe(true);
    // The client's early warning sees the new state ...
    const verdict = await guardFlashscoreExecute(batch.deps, batch.manifest.rows, {
      kind: "map",
      flashscoreCandidateId: row.candidateId,
    });
    expect(verdict?.code).toBe("supporting_mapping_changed");
    // ... and so does the repository (standing in for the database).
    const proposals = await loadAllProposals(batch.repo, null, ownerContext());
    const proposal = proposals.find((p) => p.flashscoreCandidateId === row.candidateId)!;
    const result = await batch.repo.executeMappingProposal(
      proposal.id,
      crypto.randomUUID(),
      ownerContext(),
    );
    expect(result).toMatchObject({ ok: false, code: "supporting_mapping_changed" });
  });

  test("one refused row leaves the others usable", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 3, f2: 3 }));
    await batch.run("propose");
    await batch.run("approve");
    await deactivate(batch, batch.manifest.rows[2]!);
    const result = await runExecute(batch.deps, batch.manifest, batch.all, {}, flashscoreProfile);
    expect(result.outcomes.filter((o) => o.state === "EXECUTED")).toHaveLength(5);
    expect(result.outcomes.filter((o) => o.state === "STALE_EVIDENCE")).toHaveLength(1);
  });

  test("the ordinary queue cannot propose a Flashscore identity: it has no supporting mapping to give", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 1, f2: 1 }));
    const actions = createMappingActions(batch.repo, () => ownerContext());
    const candidate = await batch.repo.getMappingCandidate(
      batch.manifest.rows[0]!.candidateId,
      ownerContext(),
    );
    await expect(
      actions.propose(
        candidate,
        batch.manifest.rows[0]!.appPlayerId,
        "A reason that is long enough.",
      ),
    ).rejects.toMatchObject({ code: "supporting_dependency_required" });
    const proposals = await loadAllProposals(batch.repo, null, ownerContext());
    expect(proposals.some((p) => p.flashscoreCandidateId !== null)).toBe(false);
  });

  test("against a database without the migration (no read function) every row stops before anything is sent", async () => {
    const batch = await prepareFlashBatch(buildFlashWorld({ f1: 2, f2: 2 }));
    const s = spy(batch.repo, {
      getProviderMapping: () => {
        throw new MappingError("mapping_unavailable", "function does not exist");
      },
    });
    const r = await runPropose(
      { repository: s.proxy, context: batch.deps.context },
      batch.manifest,
      batch.all,
      {},
      flashscoreProfile,
    );
    expect(r.outcomes.every((o) => o.state === "ERROR" && o.code === "mapping_unavailable")).toBe(
      true,
    );
    expect(s.seen.some((c) => c.name === "proposeMappings")).toBe(false);
    expect((await loadAllProposals(batch.repo, null, ownerContext())).length).toBe(
      (await loadAllProposals(batch.repo, null, ownerContext())).filter(
        (p) => p.sofascoreCandidateId !== null,
      ).length,
    );
  });
});
