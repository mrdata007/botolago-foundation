import type { RepositoryContext } from "@/backend/contracts/repository";
import { loadAllProposals } from "../review-queue";
import type { MockSeedCandidate } from "../mock-mapping-repository";
import { canonicalJson, sha256Hex } from "./canonical";
import { jsonbFingerprint } from "./fingerprint";
import {
  FLASHSCORE_BASIS,
  FLASHSCORE_REASONS,
  type FlashscoreEvidenceClass,
} from "./flashscore-contract";
import {
  buildFlashscoreManifest,
  flashscoreEvidenceRefs,
  type FlashscoreManifest,
  type FlashscoreRow,
} from "./flashscore-manifest";
import { flashscoreProfile } from "./flashscore-profile";
import { createBulkRunner, runApprove, runExecute, runPropose, type BulkDeps } from "./runner";
import {
  OWNER,
  buildWorld,
  candidateUuid,
  newRepo,
  oracleManifest,
  ownerContext,
  playerId,
  teamId,
  type World,
} from "./test-world";
import { sofascoreProfile } from "./sofascore-profile";

/**
 * A synthetic world for the Flashscore batch: no real player, no real date. Player i has a
 * Sofascore id (S_i, mapped through the completed Sofascore flow, so its mapping carries a real
 * audit chain) and a Flashscore id (F_i) that the batch will tie to the same canonical player.
 */
export const flashCandidateUuid = (i: number) => candidateUuid(5000 + i);

export interface FlashWorldSpec {
  readonly f1: number;
  readonly f2: number;
}

export interface FlashWorld {
  readonly sofa: World;
  readonly world: World;
  /** class of player i (1-based) */
  readonly classOf: (i: number) => FlashscoreEvidenceClass;
  readonly count: number;
}

export function buildFlashWorld(spec: FlashWorldSpec): FlashWorld {
  const count = spec.f1 + spec.f2;
  // Three spare players (never a Flashscore target in the batch) for tests that need another canonical player.
  const sofa = buildWorld({ tierA: count + 3, tierB: 0, flashscore: 0, clubs: 5 });
  const flash: MockSeedCandidate[] = [];
  for (let i = 1; i <= count; i += 1) {
    const player = sofa.appPlayers[i - 1]!;
    flash.push({
      id: flashCandidateUuid(i),
      provider: "flashscore",
      externalPlayerId: `F${i}`,
      observations: [
        {
          provider: "flashscore",
          externalPlayerId: `F${i}`,
          providerTeamId: `FT${i % 5}`,
          clubKey: `club-${i % 5}`,
          appTeamId: player.teamId ?? teamId(i % 5),
          squadCompleteness: "COMPLETE",
          registeredTeamId: null,
          registeredTeamDisagreement: false,
          shirtNumber: player.shirtNumber ?? null,
          positionSignal: player.position,
          dobState: "missing",
          birthDate: null,
          dobJanuary1: false,
          heightCm: null,
          nationalitySignal: null,
        },
      ],
      flags: [],
      displayName: `Flash ${i}`,
    });
  }
  const world: World = {
    appPlayers: sofa.appPlayers,
    candidates: [...sofa.candidates, ...flash],
    eligible: sofa.eligible,
  };
  return {
    sofa,
    world,
    count,
    classOf: (i) =>
      i <= spec.f1 ? "F1_REVIEWED_SOFASCORE_EVENTS" : "F2_REVIEWED_SOFASCORE_SHIRT_DOB",
  };
}

const ZERO = "0".repeat(64);
const SOURCES = {
  providerResponsesCapturedAt: "2026-10-01T12:00:00.000Z",
  mappingSnapshotCapturedAt: "2026-10-03T06:31:59.000Z",
  mappingSnapshotSha256: "1".repeat(64),
  candidateRecordsReadAt: "2026-10-03T07:07:18.000Z",
  candidateRecordsSha256: "2".repeat(64),
  corroborationObservedAt: "2026-10-03T07:16:51.000Z",
  corroborationSha256: "3".repeat(64),
  productionReadAt: "2026-10-03T08:09:08.000Z",
  productionReadSha256: "4".repeat(64),
  originalManifestSha256: "5".repeat(64),
  correctedManifestSha256: "6".repeat(64),
} as const;

/**
 * Maps every Sofascore identity through the reviewed flow (propose, approve, execute), then
 * builds the Flashscore manifest from what the repository holds. Fingerprints come from a
 * SEPARATE copy of the world (the stand-in for the database's own function), so the repository
 * under test starts with no Flashscore proposal in it.
 */
export async function prepareFlashBatch(
  fw: FlashWorld,
  options: { allowSelfApproval?: boolean; actor?: string } = {},
) {
  const actor = options.actor ?? OWNER;
  const repo = newRepo(fw.world, { allowSelfApproval: options.allowSelfApproval ?? true, actor });
  const context: RepositoryContext = { actorId: actor, requestId: "setup" };
  const deps: BulkDeps = { repository: repo, context: () => context };

  // 1. The Sofascore side, through the completed batch's own tool.
  const sofaManifest = await oracleManifest(fw.sofa, actor);
  // Only the players the Flashscore rows rest on are mapped; the spare players stay free.
  const everyone = new Set(sofaManifest.rows.slice(0, fw.count).map((r) => r.candidateId));
  await runPropose(deps, sofaManifest, everyone, {}, sofascoreProfile);
  await runApprove(deps, sofaManifest, everyone, {}, sofascoreProfile);
  await runExecute(deps, sofaManifest, everyone, {}, sofascoreProfile);

  // 2. Fingerprints for the Flashscore items, from a clean copy.
  // The same reviewed Sofascore mappings (the database reads them for every Flashscore proposal).
  const oracle = newRepo(fw.world, {
    actor,
    allowSelfApproval: true,
    mappings: repo.mappings.map((m) => ({ ...m })),
  });
  const proposals = await loadAllProposals(repo, "executed", context);
  const candidates = await Promise.all(
    sofaManifest.rows.map(async (r) => ({
      row: r,
      candidate: await repo.getMappingCandidate(r.candidateId, context),
    })),
  );

  const rows: FlashscoreRow[] = [];
  for (let i = 1; i <= fw.count; i += 1) {
    const evidenceClass = fw.classOf(i);
    const sofaRow = candidates[i - 1]!;
    const proposal = proposals.find((p) => p.sofascoreCandidateId === sofaRow.row.candidateId)!;
    const actual = (await repo.getProviderMapping("sofascore", sofaRow.row.externalId, context))!;
    const supporting = {
      provider: "sofascore" as const,
      externalId: sofaRow.row.externalId,
      mappingId: sofaRow.candidate.existingMappingId!,
      appPlayerId: playerId(i),
      provenanceProposalId: proposal.id,
      stateDigest: actual.stateDigest,
      state: "active_reviewed" as const,
    };
    const fixtures = [
      {
        sofascoreFixtureId: `S-FX-${i % 3}`,
        flashscoreFixtureId: `F-FX-${i % 3}`,
        kickoffEpochSeconds: 1_790_000_000 + (i % 3) * 86_400,
        side: "home" as const,
        sofascoreSourceSha256: ZERO,
        flashscoreSourceSha256: "7".repeat(64),
      },
    ];
    const evidence =
      evidenceClass === "F1_REVIEWED_SOFASCORE_EVENTS"
        ? {
            shirt: "agree" as const,
            alignedEventCount: 1,
            alignedEventKinds: ["yellow_card"],
            dateCorroboration: null,
          }
        : {
            shirt: "agree" as const,
            alignedEventCount: 0,
            alignedEventKinds: [],
            dateCorroboration: "AGREE" as const,
          };
    const base = { evidenceClass, supporting, fixtures };
    const reason = FLASHSCORE_REASONS[evidenceClass];
    const result = await oracle.proposeMappings(
      [
        {
          kind: "map",
          flashscoreCandidateId: flashCandidateUuid(i),
          appPlayerId: playerId(i),
          basis: FLASHSCORE_BASIS[evidenceClass],
          evidenceRefs: flashscoreEvidenceRefs(base),
          evidenceClass,
          supportingMappingId: supporting.mappingId,
        },
      ],
      reason,
      crypto.randomUUID(),
      context,
    );
    const first = result.proposals[0]!;
    if (!first.ok) throw new Error(`oracle refused row ${i}: ${first.code}`);
    const flashCandidate = await repo.getMappingCandidate(flashCandidateUuid(i), context);
    rows.push({
      candidateId: flashCandidateUuid(i),
      provider: "flashscore",
      externalId: `F${i}`,
      appPlayerId: playerId(i),
      appTeamId: flashCandidate.observations[0]!.appTeamId,
      evidenceRevision: flashCandidate.evidenceRevision,
      evidenceClass,
      candidateStatus: "unmapped",
      currentMappingState: "none",
      openProposalState: "none",
      supporting,
      fixtures,
      evidence,
      catalogueSignals: { club: "match", position: "match", shirt: "match" },
      evidenceSha256: await sha256Hex(canonicalJson({ evidence, supporting, fixtures })),
      limitations: ["Evidence from one finished match only."],
      auditReason: reason,
      fingerprintInputs: {
        kind: "map",
        basis: FLASHSCORE_BASIS[evidenceClass],
        flashscoreCandidateId: flashCandidateUuid(i),
        flashscoreExternalId: `F${i}`,
        appPlayerId: playerId(i),
        candidateRevisions: { flashscore: flashCandidate.evidenceRevision },
        evidence: {
          candidates: [
            {
              provider: "flashscore",
              externalId: `F${i}`,
              candidateId: flashCandidateUuid(i),
              observationCount: 1,
            },
          ],
          appPlayerId: playerId(i),
          supporting: {
            mappingId: supporting.mappingId,
            provider: supporting.provider,
            externalId: supporting.externalId,
            appPlayerId: supporting.appPlayerId,
            active: true,
            reviewed: true,
            reviewProvenance: "executed_proposal",
            provenanceProposalId: supporting.provenanceProposalId,
            stateDigest: supporting.stateDigest,
            evidenceClass,
          },
          refsDigest: await jsonbFingerprint(flashscoreEvidenceRefs(base)),
          refs: flashscoreEvidenceRefs(base),
        },
        signals: {},
        positionDisagreement: false,
      },
      expectedFingerprint: first.fingerprint,
    });
  }
  const manifest: FlashscoreManifest = await buildFlashscoreManifest(rows, SOURCES);
  return {
    fw,
    repo,
    deps,
    manifest,
    actor,
    context,
    all: new Set(manifest.rows.map((r) => r.candidateId)),
    run: (phase: "propose" | "approve" | "execute", selected?: ReadonlySet<string>) =>
      createBulkRunner(deps, manifest, flashscoreProfile).run(
        phase,
        selected ?? new Set(manifest.rows.map((r) => r.candidateId)),
      ),
  };
}

export { ownerContext };
