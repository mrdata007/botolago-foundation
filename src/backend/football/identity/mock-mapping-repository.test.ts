import { describe, expect, test } from "bun:test";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { groupCandidates, toObservationRecords } from "./candidate-builder";
import { CLUB_PROVIDER_TEAMS } from "./club-registry";
import { collectSquads, type FetchJson } from "./collector";
import { InMemoryPlayerMappingRepository, type MockAppPlayer } from "./mock-mapping-repository";
import {
  flashPayload,
  NOW,
  seconds,
  sofaEntry,
  sofaPayload,
  type FlashEntry,
} from "./test-support";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ctx = (actorId: string | null): RepositoryContext => ({ actorId, requestId: "req" });
const REASON = "Reviewed the evidence for this pairing.";
const key = () => crypto.randomUUID();

const PLAYERS: MockAppPlayer[] = [
  { id: "a0000000-0000-4000-8000-000000000001", displayName: "App Forward", position: "F" },
  { id: "a0000000-0000-4000-8000-000000000002", displayName: "App Keeper", position: "G" },
  { id: "a0000000-0000-4000-8000-000000000003", displayName: "App Mid", position: "M" },
  { id: "a0000000-0000-4000-8000-000000000004", displayName: "App Spare", position: "D" },
];

/** Two squads that both list Sofascore id 777; one Flashscore id, one more Sofascore id. */
async function seeded(qualified: string[] = [A, B]) {
  const clubs = CLUB_PROVIDER_TEAMS.slice(0, 2);
  const fetchJson: FetchJson = async (provider, path) => {
    const club = clubs.findIndex(
      (c) => path.includes(String(c.sofascoreTeamId)) || path.includes(c.flashscoreTeamId),
    );
    if (provider === "flashscore") {
      const entries: FlashEntry[] = [{ id: `FL${club}0001`, type: "FORWARD", jersey: 9 }];
      return { status: 200, body: flashPayload(entries) };
    }
    const entries = [
      sofaEntry({
        id: 777,
        position: "F",
        shirtNumber: 9,
        teamId: clubs[0]!.sofascoreTeamId,
        dateOfBirthTimestamp: seconds("1995-05-05"),
        dateOfBirth: "1995-05-05T00:00:00+00:00",
      }),
      ...(club === 0
        ? [sofaEntry({ id: 888, position: "G", teamId: clubs[0]!.sofascoreTeamId })]
        : []),
    ];
    return { status: 200, body: sofaPayload(entries) };
  };
  const collection = await collectSquads({ fetchJson, now: NOW, clubs });
  const candidates = groupCandidates(toObservationRecords(collection));
  const repo = new InMemoryPlayerMappingRepository({
    candidates,
    appPlayers: PLAYERS,
    qualifiedActors: qualified,
  });
  return { repo, candidates, collection };
}

const proposeMap = (
  repo: InMemoryPlayerMappingRepository,
  externalId: string,
  player = PLAYERS[0]!.id,
  actor = A,
) =>
  repo.proposeMappings(
    [
      {
        kind: "map",
        sofascoreCandidateId: repo.candidateIdOf("sofascore", externalId),
        appPlayerId: player,
      },
    ],
    REASON,
    key(),
    ctx(actor),
  );

async function approvedMap(
  repo: InMemoryPlayerMappingRepository,
  externalId: string,
  player: string,
) {
  const result = await proposeMap(repo, externalId, player);
  const item = result.proposals[0]!;
  if (!item.ok) throw new Error(`refused: ${item.code}`);
  await repo.decideMappingProposal(
    { proposalId: item.id, decision: "approve", reason: REASON, fingerprint: item.fingerprint },
    key(),
    ctx(B),
  );
  return item.id;
}

describe("shared ids and the candidate", () => {
  test("the same provider id in two squads is one candidate", async () => {
    const { repo } = await seeded();
    const list = await repo.listMappingCandidates({ provider: "sofascore" }, null, 50, ctx(A));
    expect(list.filter((c) => c.externalId === "777")).toHaveLength(1);
    expect(list.find((c) => c.externalId === "777")!.flags).toContain("MULTI_SQUAD_OBSERVATION");
    expect(repo.candidateCount()).toBe(2 + 2); // 777, 888, and one Flashscore id per club
  });

  test("no duplicate mapping proposal is created for it", async () => {
    const { repo } = await seeded();
    const first = await proposeMap(repo, "777");
    expect(first.proposals[0]).toMatchObject({ ok: true, status: "pending" });
    const again = await proposeMap(repo, "777", PLAYERS[2]!.id);
    expect(again.proposals[0]).toMatchObject({ ok: false, code: "proposal_already_open" });
    expect(await repo.listMappingProposals("open", null, 50, ctx(A))).toHaveLength(1);
  });

  test("being listed under another club does not reject or lower the candidate", async () => {
    const { repo } = await seeded();
    const result = await proposeMap(repo, "777");
    expect(result.proposals[0]).toMatchObject({ ok: true, status: "pending" });
  });

  test("conflicting identity evidence still blocks approval", async () => {
    const { repo } = await seeded();
    const proposed = (await proposeMap(repo, "777")).proposals[0]!;
    if (!proposed.ok) throw new Error("refused");
    repo.forceCandidateStatus("sofascore", "777", "ignored"); // another human's executed decision
    const held = await repo.decideMappingProposal(
      {
        proposalId: proposed.id,
        decision: "approve",
        reason: REASON,
        fingerprint: proposed.fingerprint,
      },
      key(),
      ctx(B),
    );
    expect(held).toEqual({ ok: false, code: "identity_conflict", status: "identity_conflict" });
    await expect(
      repo.decideMappingProposal(
        {
          proposalId: proposed.id,
          decision: "approve",
          reason: REASON,
          fingerprint: proposed.fingerprint,
        },
        key(),
        ctx(B),
      ),
    ).rejects.toMatchObject({ code: "identity_conflict" });
    await expect(repo.executeMappingProposal(proposed.id, key(), ctx(A))).rejects.toMatchObject({
      code: "proposal_not_approved",
    });
    expect(repo.mappings).toHaveLength(0);
  });
});

describe("dual control", () => {
  test("a proposer cannot approve or reject their own proposal", async () => {
    const { repo } = await seeded();
    const proposed = (await proposeMap(repo, "777")).proposals[0]!;
    if (!proposed.ok) throw new Error("refused");
    const decide = (decision: "approve" | "reject") =>
      repo.decideMappingProposal(
        { proposalId: proposed.id, decision, reason: REASON, fingerprint: proposed.fingerprint },
        key(),
        ctx(A),
      );
    await expect(decide("approve")).rejects.toMatchObject({ code: "self_approval_denied" });
    await expect(decide("reject")).rejects.toMatchObject({ code: "self_approval_denied" });
  });

  test("another fingerprint is refused, and nothing is executed before approval", async () => {
    const { repo } = await seeded();
    const proposed = (await proposeMap(repo, "777")).proposals[0]!;
    if (!proposed.ok) throw new Error("refused");
    await expect(
      repo.decideMappingProposal(
        {
          proposalId: proposed.id,
          decision: "approve",
          reason: REASON,
          fingerprint: "0".repeat(64),
        },
        key(),
        ctx(B),
      ),
    ).rejects.toMatchObject({ code: "fingerprint_mismatch" });
    await expect(repo.executeMappingProposal(proposed.id, key(), ctx(A))).rejects.toMatchObject({
      code: "proposal_not_approved",
    });
    expect(repo.mappings).toHaveLength(0);
  });

  test("approval alone maps nothing; execution maps once", async () => {
    const { repo } = await seeded();
    const id = await approvedMap(repo, "777", PLAYERS[0]!.id);
    expect(repo.mappings).toHaveLength(0);
    expect(await repo.executeMappingProposal(id, key(), ctx(A))).toMatchObject({
      ok: true,
      status: "executed",
    });
    expect(repo.mappings).toHaveLength(1);
    await expect(repo.executeMappingProposal(id, key(), ctx(A))).rejects.toMatchObject({
      code: "operation_already_executed",
    });
    expect(repo.mappings).toHaveLength(1);
  });

  test("the same idempotency key replays the stored answer", async () => {
    const { repo } = await seeded();
    const id = await approvedMap(repo, "777", PLAYERS[0]!.id);
    const k = key();
    const one = await repo.executeMappingProposal(id, k, ctx(A));
    expect(await repo.executeMappingProposal(id, k, ctx(A))).toEqual(one);
    expect(repo.mappings).toHaveLength(1);
  });

  test("anyone who is not a qualified operator is refused", async () => {
    const { repo } = await seeded([A]);
    await expect(proposeMap(repo, "777", PLAYERS[0]!.id, B)).rejects.toMatchObject({
      code: "permission_missing",
    });
    await expect(repo.listMappingCandidates({}, null, 10, ctx(null))).rejects.toMatchObject({
      code: "staff_access_denied",
    });
  });

  test("with one operator there is no second reviewer and no bypass", async () => {
    const { repo } = await seeded([A]);
    expect(await repo.getQualifiedReviewerAvailability(ctx(A))).toEqual({
      qualifiedReviewersAvailable: 0,
      secondReviewerRequired: true,
    });
    const proposed = (await proposeMap(repo, "777")).proposals[0]!;
    if (!proposed.ok) throw new Error("refused");
    await expect(
      repo.decideMappingProposal(
        {
          proposalId: proposed.id,
          decision: "approve",
          reason: REASON,
          fingerprint: proposed.fingerprint,
        },
        key(),
        ctx(A),
      ),
    ).rejects.toMatchObject({ code: "self_approval_denied" });
    expect((await repo.getMappingProposal(proposed.id, ctx(A))).status).toBe("pending");
  });

  test("a reason of at least 10 characters is required", async () => {
    const { repo } = await seeded();
    await expect(
      repo.proposeMappings(
        [
          {
            kind: "map",
            sofascoreCandidateId: repo.candidateIdOf("sofascore", "777"),
            appPlayerId: PLAYERS[0]!.id,
          },
        ],
        "short",
        key(),
        ctx(A),
      ),
    ).rejects.toMatchObject({ code: "reason_required" });
  });
});

describe("the existing-row replacement model", () => {
  async function mappedRow() {
    const { repo } = await seeded();
    const id = await approvedMap(repo, "777", PLAYERS[0]!.id);
    await repo.executeMappingProposal(id, key(), ctx(A));
    return { repo, row: repo.mappings[0]! };
  }
  const go = async (
    repo: InMemoryPlayerMappingRepository,
    result: Awaited<ReturnType<typeof proposeMap>>,
  ) => {
    const item = result.proposals[0]!;
    if (!item.ok) throw new Error(`refused: ${item.code}`);
    await repo.decideMappingProposal(
      { proposalId: item.id, decision: "approve", reason: REASON, fingerprint: item.fingerprint },
      key(),
      ctx(B),
    );
    return repo.executeMappingProposal(item.id, key(), ctx(A));
  };

  test("replace updates the SAME row: no second row is ever inserted", async () => {
    const { repo, row } = await mappedRow();
    const rowId = row.id;
    await go(
      repo,
      await repo.replaceMapping(
        { provider: "sofascore", mappingId: rowId, newAppPlayerId: PLAYERS[2]!.id },
        REASON,
        key(),
        ctx(A),
      ),
    );
    expect(repo.mappings).toHaveLength(1);
    expect(repo.mappings[0]).toMatchObject({
      id: rowId,
      externalId: "777",
      appPlayerId: PLAYERS[2]!.id,
    });
    await go(
      repo,
      await repo.replaceMapping(
        { provider: "sofascore", mappingId: rowId, newExternalId: "777-FIXED" },
        REASON,
        key(),
        ctx(A),
      ),
    );
    expect(repo.mappings[0]).toMatchObject({
      id: rowId,
      externalId: "777-FIXED",
      appPlayerId: PLAYERS[2]!.id,
    });
    expect(repo.mappings).toHaveLength(1);
  });

  test("deactivate sets active=false on that row, and a reactivation reuses it", async () => {
    const { repo, row } = await mappedRow();
    await go(
      repo,
      await repo.deactivateMapping(
        { provider: "sofascore", mappingId: row.id },
        REASON,
        key(),
        ctx(A),
      ),
    );
    expect(repo.mappings).toHaveLength(1);
    expect(repo.mappings[0]!.active).toBe(false);
    // the identity is still held by that row: a map is refused, a reactivation is the way back
    expect((await proposeMap(repo, "777", PLAYERS[2]!.id)).proposals[0]).toMatchObject({
      ok: false,
      code: "already_mapped",
    });
    await go(
      repo,
      await repo.reactivateMapping(
        { provider: "sofascore", mappingId: row.id },
        REASON,
        key(),
        ctx(A),
      ),
    );
    expect(repo.mappings).toHaveLength(1);
    expect(repo.mappings[0]).toMatchObject({ id: row.id, active: true });
  });

  test("a target held by another row is refused, nothing written", async () => {
    const { repo, row } = await mappedRow();
    const second = await approvedMap(repo, "888", PLAYERS[1]!.id);
    await repo.executeMappingProposal(second, key(), ctx(A));
    const refused = await repo.replaceMapping(
      { provider: "sofascore", mappingId: row.id, newAppPlayerId: PLAYERS[1]!.id },
      REASON,
      key(),
      ctx(A),
    );
    expect(refused.proposals[0]).toMatchObject({ ok: false, code: "already_mapped" });
    const before = JSON.stringify(repo.mappings);
    const refusedExternal = await repo.replaceMapping(
      { provider: "sofascore", mappingId: row.id, newExternalId: "888" },
      REASON,
      key(),
      ctx(A),
    );
    expect(refusedExternal.proposals[0]).toMatchObject({ ok: false, code: "already_mapped" });
    expect(JSON.stringify(repo.mappings)).toBe(before);
  });

  test("replace needs a different approver too", async () => {
    const { repo, row } = await mappedRow();
    const item = (
      await repo.replaceMapping(
        { provider: "sofascore", mappingId: row.id, newAppPlayerId: PLAYERS[2]!.id },
        REASON,
        key(),
        ctx(A),
      )
    ).proposals[0]!;
    if (!item.ok) throw new Error("refused");
    await expect(
      repo.decideMappingProposal(
        { proposalId: item.id, decision: "approve", reason: REASON, fingerprint: item.fingerprint },
        key(),
        ctx(A),
      ),
    ).rejects.toMatchObject({ code: "self_approval_denied" });
  });
});

describe("position disagreement and ignore", () => {
  test("position disagreement holds the proposal; a note and an acknowledgement let it through", async () => {
    const { repo } = await seeded();
    const proposed = (await proposeMap(repo, "888", PLAYERS[0]!.id)).proposals[0]!; // Sofascore says G, the app says F
    if (!proposed.ok) throw new Error("refused");
    expect(proposed.status).toBe("position_disagreement");
    await expect(
      repo.decideMappingProposal(
        {
          proposalId: proposed.id,
          decision: "approve",
          reason: REASON,
          fingerprint: proposed.fingerprint,
        },
        key(),
        ctx(B),
      ),
    ).rejects.toMatchObject({ code: "position_disagreement_unacknowledged" });
    await expect(
      repo.addPositionNote(proposed.id, "Not the proposer.", key(), ctx(B)),
    ).rejects.toMatchObject({ code: "not_authorized" });
    await repo.addPositionNote(
      proposed.id,
      "Sofascore lists a goalkeeper; same goals attributed in two matches.",
      key(),
      ctx(A),
    );
    const pending = await repo.getMappingProposal(proposed.id, ctx(B));
    expect(pending.status).toBe("pending");
    await expect(
      repo.decideMappingProposal(
        {
          proposalId: proposed.id,
          decision: "approve",
          reason: REASON,
          fingerprint: pending.fingerprint,
        },
        key(),
        ctx(B),
      ),
    ).rejects.toMatchObject({ code: "position_disagreement_unacknowledged" });
    expect(
      await repo.decideMappingProposal(
        {
          proposalId: proposed.id,
          decision: "approve",
          reason: REASON,
          fingerprint: pending.fingerprint,
          positionDisagreementAcknowledged: true,
        },
        key(),
        ctx(B),
      ),
    ).toMatchObject({ ok: true, status: "approved" });
  });

  test("ignore and reverse ignore go through the same two people", async () => {
    const { repo } = await seeded();
    const candidateId = repo.candidateIdOf("sofascore", "888");
    const item = (
      await repo.proposeIgnore({ provider: "sofascore", candidateId }, REASON, key(), ctx(A))
    ).proposals[0]!;
    if (!item.ok) throw new Error("refused");
    await expect(
      repo.decideMappingProposal(
        { proposalId: item.id, decision: "approve", reason: REASON, fingerprint: item.fingerprint },
        key(),
        ctx(A),
      ),
    ).rejects.toMatchObject({ code: "self_approval_denied" });
    await repo.decideMappingProposal(
      { proposalId: item.id, decision: "approve", reason: REASON, fingerprint: item.fingerprint },
      key(),
      ctx(B),
    );
    await repo.executeMappingProposal(item.id, key(), ctx(A));
    expect((await repo.getMappingCandidate(candidateId, ctx(A))).status).toBe("ignored");
    expect((await proposeMap(repo, "888", PLAYERS[1]!.id)).proposals[0]).toMatchObject({
      ok: false,
      code: "identity_conflict",
    });
    const back = (
      await repo.proposeReverseIgnore({ provider: "sofascore", candidateId }, REASON, key(), ctx(A))
    ).proposals[0]!;
    if (!back.ok) throw new Error("refused");
    await repo.decideMappingProposal(
      { proposalId: back.id, decision: "approve", reason: REASON, fingerprint: back.fingerprint },
      key(),
      ctx(B),
    );
    await repo.executeMappingProposal(back.id, key(), ctx(B));
    expect((await repo.getMappingCandidate(candidateId, ctx(A))).status).toBe("unmapped");
  });

  test("cancel and reject give the candidate back", async () => {
    const { repo } = await seeded();
    const candidateId = repo.candidateIdOf("sofascore", "777");
    const item = (await proposeMap(repo, "777")).proposals[0]!;
    if (!item.ok) throw new Error("refused");
    expect((await repo.getMappingCandidate(candidateId, ctx(A))).status).toBe("proposed");
    await expect(
      repo.cancelMappingProposal(item.id, "Not the proposer to cancel.", key(), ctx(B)),
    ).rejects.toMatchObject({ code: "not_authorized" });
    await repo.cancelMappingProposal(item.id, "Withdrawn, the evidence was thin.", key(), ctx(A));
    expect((await repo.getMappingCandidate(candidateId, ctx(A))).status).toBe("unmapped");
  });
});

describe("ranking list", () => {
  test("lists every app player, a position contradiction ranks lower but never hides anyone", async () => {
    const { repo } = await seeded();
    const options = await repo.listMappingCandidatesForAppPlayer(
      repo.candidateIdOf("sofascore", "777"),
      null,
      50,
      ctx(A),
    );
    expect(options).toHaveLength(PLAYERS.length);
    expect(options[0]!.appPlayerId).toBe(PLAYERS[0]!.id);
    expect(options.find((o) => o.position === "G")).toBeDefined();
  });
});
