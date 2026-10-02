import { describe, expect, test } from "bun:test";
import type { RepositoryContext } from "@/backend/contracts/repository-context";
import type { ProposalDto } from "@/backend/football/identity/mapping-contracts";
import { mapMappingError } from "@/backend/football/identity/mapping-errors";
import type { PlayerMappingRepository } from "@/backend/football/identity/mapping-repository";
import { InMemoryPlayerMappingRepository } from "@/backend/football/identity/mock-mapping-repository";
import { loadAllCandidates, loadOptions } from "@/backend/football/identity/review-queue";
import { SAMPLE_ACTORS, buildSampleWorld } from "@/backend/football/identity/sample-mapping-data";
import { getPlayerMappingCopy, mappingErrorMessage } from "./copy";
import { createMappingActions } from "./use-player-mappings";

/**
 * The execute step, walked through an in-memory repository that mirrors the
 * reviewed database contract: invented data only, nothing here can reach a
 * real database. What the database itself enforces is proved by the pgTAP
 * workflow tests; what the SCREEN adds (re-reading the proposal, one key per
 * proposal, one proposal at a time) is proved here.
 */

const ctx = (actorId: string): RepositoryContext => ({ actorId, requestId: "execute-test" });
const proposer = ctx(SAMPLE_ACTORS.proposer);
const approver = ctx(SAMPLE_ACTORS.approver);
const THIRD = "00000000-0000-4000-8000-0000000000e3";
const third = ctx(THIRD);

async function setup(
  options: {
    allowSelfApproval?: boolean;
    sessions?: Record<string, { aal2?: boolean; recentSignIn?: boolean }>;
  } = {},
) {
  const world = buildSampleWorld({ sofascore: 20, flashscore: 0 });
  const repo = new InMemoryPlayerMappingRepository({
    candidates: world.candidates,
    appPlayers: world.appPlayers,
    qualifiedActors: [SAMPLE_ACTORS.proposer, SAMPLE_ACTORS.approver, THIRD],
    ...options,
  });
  const candidates = await loadAllCandidates(repo, {}, proposer);
  const candidate = candidates[0]!;
  const rankedOptions = await loadOptions(repo, candidate, "club", proposer);
  const target = rankedOptions[0]!;
  const made = await repo.proposeMappings(
    [{ kind: "map", sofascoreCandidateId: candidate.id, appPlayerId: target.appPlayerId }],
    "Même numéro, même poste, même club.",
    crypto.randomUUID(),
    proposer,
  );
  const id = (made.proposals[0] as { id: string }).id;
  const approve = async (by: RepositoryContext = approver) => {
    const proposal = await repo.getMappingProposal(id, by);
    await repo.decideMappingProposal(
      {
        proposalId: id,
        decision: "approve",
        reason: "Preuves relues et concordantes.",
        fingerprint: proposal.fingerprint,
      },
      crypto.randomUUID(),
      by,
    );
    return repo.getMappingProposal(id, by);
  };
  return { repo, candidate, candidates, target, id, approve };
}

const codeOf = async (work: Promise<unknown>) => {
  try {
    await work;
    return "no_error";
  } catch (error) {
    return mapMappingError(error).code;
  }
};

describe("executing one approved proposal", () => {
  test("nothing runs on its own: approval writes no mapping", async () => {
    const w = await setup();
    await w.approve();
    expect(w.repo.mappings).toHaveLength(0);
    expect((await w.repo.getMappingProposal(w.id, approver)).status).toBe("approved");
  });

  test("12. a successful execution writes exactly one mapping, for exactly this pairing", async () => {
    const w = await setup();
    const approved = await w.approve();
    const actions = createMappingActions(w.repo, () => approver);
    await actions.execute(approved);
    expect(w.repo.mappings).toHaveLength(1);
    expect(w.repo.mappings[0]).toMatchObject({
      provider: "sofascore",
      externalId: w.candidate.externalId,
      appPlayerId: w.target.appPlayerId,
      active: true,
    });
    const after = await w.repo.getMappingProposal(w.id, approver);
    expect(after.status).toBe("executed");
    const candidateAfter = (await loadAllCandidates(w.repo, {}, approver)).find(
      (c) => c.id === w.candidate.id,
    )!;
    expect(candidateAfter.status).toBe("mapped");
  });

  test("13. no unrelated candidate or mapping changes", async () => {
    const w = await setup();
    const approved = await w.approve();
    const before = w.repo.snapshotCandidateStatuses();
    await createMappingActions(w.repo, () => approver).execute(approved);
    const after = w.repo.snapshotCandidateStatuses();
    const changed = [...after].filter(([id, state]) => before.get(id) !== state).map(([id]) => id);
    expect(changed).toEqual([w.candidate.id]);
    expect(w.repo.snapshotMappings()).toHaveLength(1);
    expect(w.repo.candidateCount()).toBe(before.size);
  });

  test("5a. a fingerprint other than the one the person read is refused, before the database is asked", async () => {
    const w = await setup();
    const approved = await w.approve();
    let called = 0;
    const spy: PlayerMappingRepository = new Proxy(w.repo, {
      get(target, prop, receiver) {
        if (prop === "executeMappingProposal") {
          return (...args: Parameters<PlayerMappingRepository["executeMappingProposal"]>) => {
            called += 1;
            return target.executeMappingProposal(...args);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const shown: ProposalDto = { ...approved, fingerprint: "a".repeat(64) };
    expect(await codeOf(createMappingActions(spy, () => approver).execute(shown))).toBe(
      "fingerprint_mismatch",
    );
    expect(called).toBe(0);
    expect(w.repo.mappings).toHaveLength(0);
  });

  test("5b. a stored row that no longer matches its sealed fingerprint is refused by the contract", async () => {
    const w = await setup();
    const approved = await w.approve();
    w.repo.tamperFingerprint(w.id);
    const direct = await codeOf(w.repo.executeMappingProposal(w.id, crypto.randomUUID(), approver));
    expect(direct).toBe("fingerprint_mismatch");
    // Through the screen it is refused too: the proposal it re-reads no longer matches what was shown.
    expect(await codeOf(createMappingActions(w.repo, () => approver).execute(approved))).toBe(
      "fingerprint_mismatch",
    );
    expect(w.repo.mappings).toHaveLength(0);
  });

  test("6. evidence that moved since the proposal is refused and held, and nothing is written", async () => {
    const w = await setup();
    const approved = await w.approve();
    w.repo.bumpEvidence("sofascore", w.candidate.externalId);
    expect(await codeOf(createMappingActions(w.repo, () => approver).execute(approved))).toBe(
      "stale_evidence",
    );
    expect(w.repo.mappings).toHaveLength(0);
    expect((await w.repo.getMappingProposal(w.id, approver)).status).toBe("stale_evidence");
    const candidateAfter = (await loadAllCandidates(w.repo, {}, approver)).find(
      (c) => c.id === w.candidate.id,
    )!;
    expect(candidateAfter.status).toBe("unmapped");
  });

  test("7. a target that another row took meanwhile is refused", async () => {
    const taken = await setup();
    const approvedTaken = await taken.approve();
    taken.repo.mappings.push({
      id: crypto.randomUUID(),
      provider: "sofascore",
      externalId: taken.candidate.externalId,
      appPlayerId: crypto.randomUUID(),
      active: true,
    });
    expect(
      await codeOf(createMappingActions(taken.repo, () => approver).execute(approvedTaken)),
    ).toBe("already_mapped");
    expect(taken.repo.mappings).toHaveLength(1);

    const ignored = await setup();
    const approvedIgnored = await ignored.approve();
    ignored.repo.forceCandidateStatus("sofascore", ignored.candidate.externalId, "ignored");
    expect(
      await codeOf(createMappingActions(ignored.repo, () => approver).execute(approvedIgnored)),
    ).toBe("identity_conflict");
    expect(ignored.repo.mappings).toHaveLength(0);
  });

  test("8. an executed proposal cannot be executed twice", async () => {
    const w = await setup();
    const approved = await w.approve();
    const actions = createMappingActions(w.repo, () => approver);
    await actions.execute(approved);
    // The same screen, a second press: the proposal it re-reads is final.
    expect(await codeOf(actions.execute(approved))).toBe("operation_already_executed");
    // A fresh screen (new keys) is refused the same way, by the contract.
    expect(await codeOf(createMappingActions(w.repo, () => approver).execute(approved))).toBe(
      "operation_already_executed",
    );
    expect(await codeOf(w.repo.executeMappingProposal(w.id, crypto.randomUUID(), approver))).toBe(
      "operation_already_executed",
    );
    expect(w.repo.mappings).toHaveLength(1);
  });

  test("a lost response is retried with the same idempotency key, never a second execution", async () => {
    const w = await setup();
    const approved = await w.approve();
    const keys: string[] = [];
    let failFirst = true;
    const flaky: PlayerMappingRepository = new Proxy(w.repo, {
      get(target, prop, receiver) {
        if (prop === "executeMappingProposal") {
          return async (...args: Parameters<PlayerMappingRepository["executeMappingProposal"]>) => {
            keys.push(args[1]);
            if (failFirst) {
              failFirst = false;
              throw new Error("network down");
            }
            return target.executeMappingProposal(...args);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const actions = createMappingActions(flaky, () => approver);
    expect(await codeOf(actions.execute(approved))).toBe("mapping_unavailable");
    await actions.execute(approved);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]!);
    expect(w.repo.mappings).toHaveLength(1);
  });

  test("a proposal that is not approved or whose approval expired never reaches the database", async () => {
    const countingRepo = (repo: InMemoryPlayerMappingRepository) => {
      const calls = { execute: 0 };
      const proxy: PlayerMappingRepository = new Proxy(repo, {
        get(target, prop, receiver) {
          if (prop === "executeMappingProposal") {
            return (...args: Parameters<PlayerMappingRepository["executeMappingProposal"]>) => {
              calls.execute += 1;
              return target.executeMappingProposal(...args);
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });
      return { calls, proxy };
    };

    const pending = await setup();
    const shownPending = await pending.repo.getMappingProposal(pending.id, approver);
    const pendingSpy = countingRepo(pending.repo);
    expect(
      await codeOf(createMappingActions(pendingSpy.proxy, () => approver).execute(shownPending)),
    ).toBe("proposal_not_approved");
    expect(pendingSpy.calls.execute).toBe(0);

    const expired = await setup();
    const approved = await expired.approve();
    expired.repo.patchProposal(expired.id, { effectiveStatus: "expired" });
    const expiredSpy = countingRepo(expired.repo);
    expect(
      await codeOf(createMappingActions(expiredSpy.proxy, () => approver).execute(approved)),
    ).toBe("approval_expired");
    expect(expiredSpy.calls.execute).toBe(0);

    expect(expired.repo.mappings).toHaveLength(0);
    expect(pending.repo.mappings).toHaveLength(0);
  });

  test("the screen offers one proposal at a time: there is no bulk execute", async () => {
    const w = await setup();
    const actions = createMappingActions(w.repo, () => approver);
    expect(Object.keys(actions).sort()).toEqual(
      ["addNote", "cancel", "decide", "execute", "propose", "refreshEvidence"].sort(),
    );
    expect(actions.execute.length).toBe(1);
  });
});

describe("the login rules still apply to an execution", () => {
  test("9. a session without the second factor (AAL2) is refused, and says so in words", async () => {
    const w = await setup({ allowSelfApproval: true, sessions: { [THIRD]: { aal2: false } } });
    const approved = await w.approve(proposer);
    const actions = createMappingActions(w.repo, () => third);
    expect(await codeOf(actions.execute(approved))).toBe("mfa_assurance_insufficient");
    expect(w.repo.mappings).toHaveLength(0);
    for (const lang of ["fr", "ar"] as const) {
      const text = mappingErrorMessage(getPlayerMappingCopy(lang), "mfa_assurance_insufficient");
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toBe("mfa_assurance_insufficient");
    }
  });

  test("10. a stale sign-in is refused, and says so in words", async () => {
    const w = await setup({
      allowSelfApproval: true,
      sessions: { [THIRD]: { recentSignIn: false } },
    });
    const approved = await w.approve(proposer);
    const actions = createMappingActions(w.repo, () => third);
    expect(await codeOf(actions.execute(approved))).toBe("recent_auth_required");
    expect(w.repo.mappings).toHaveLength(0);
    for (const lang of ["fr", "ar"] as const) {
      const text = mappingErrorMessage(getPlayerMappingCopy(lang), "recent_auth_required");
      expect(text).not.toBe("recent_auth_required");
    }
  });

  test("a person who is not a qualified staff member is refused", async () => {
    const w = await setup();
    const approved = await w.approve();
    expect(
      await codeOf(
        createMappingActions(w.repo, () => ctx("00000000-0000-4000-8000-0000000000ff")).execute(
          approved,
        ),
      ),
    ).toBe("permission_missing");
    expect(await codeOf(createMappingActions(w.repo, () => ctx("")).execute(approved))).toBe(
      "staff_access_denied",
    );
    expect(w.repo.mappings).toHaveLength(0);
  });
});
