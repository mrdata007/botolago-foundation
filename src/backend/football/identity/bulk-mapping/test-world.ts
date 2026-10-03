import type { RepositoryContext } from "@/backend/contracts/repository";
import {
  InMemoryPlayerMappingRepository,
  type MockAppPlayer,
  type MockMappingRow,
  type MockSeedCandidate,
} from "../mock-mapping-repository";
import { loadAllCandidates, loadAllProposals, readOptionSignals } from "../review-queue";
import type { CandidateFacts } from "./eligibility";
import { BULK_REASONS, type BulkTier } from "./contract";
import { buildManifest, type BulkManifest, type ManifestRow } from "./manifest";

/**
 * A synthetic production-shaped world for the bulk tests: no real player, no real
 * date. It mirrors the production population (1,004 candidates, 465 of them
 * Flashscore, 189 eligible: 108 Tier A, 81 Tier B) with the structure the
 * contract reads and nothing else.
 */
export const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const ownerContext = (): RepositoryContext => ({ actorId: OWNER, requestId: "req" });

const hex = (n: number, width: number) => n.toString(16).padStart(width, "0");
export const teamId = (club: number) => `e4000000-0000-4000-8000-${hex(club, 12)}`;
export const playerId = (i: number) => `a1000000-0000-4000-8000-${hex(i, 12)}`;
export const candidateUuid = (i: number) => `c1000000-0000-4000-8000-${hex(i, 12)}`;

/** Dates that are never January 1 and never repeat inside a club. */
const dobFor = (i: number) => {
  const base = Date.UTC(1990, 1, 2) + i * 86_400_000;
  const d = new Date(base);
  const iso = d.toISOString().slice(0, 10);
  return iso.endsWith("-01-01") ? new Date(base + 86_400_000).toISOString().slice(0, 10) : iso;
};

export interface WorldSpec {
  readonly tierA: number;
  readonly tierB: number;
  readonly flashscore: number;
  /** Sofascore candidates that must stay out, with the reason they stay out. */
  readonly noExactDob?: number;
  readonly positionConflict?: number;
  readonly incompleteSquad?: number;
  readonly january1Provider?: number;
  readonly multiSquad?: number;
  readonly shirtConflict?: number;
  /** The app player's date is a January-1 placeholder; the provider's is the same, valid-looking date. */
  readonly appJanuary1?: number;
  readonly clubs?: number;
  readonly names?: "plain" | "scrambled";
}

export interface World {
  readonly appPlayers: MockAppPlayer[];
  readonly candidates: MockSeedCandidate[];
  readonly eligible: { index: number; tier: BulkTier }[];
}

const POSITIONS = ["G", "D", "M", "F"] as const;

export function buildWorld(spec: WorldSpec): World {
  const clubs = spec.clubs ?? 15;
  const appPlayers: MockAppPlayer[] = [];
  const candidates: MockSeedCandidate[] = [];
  const eligible: World["eligible"] = [];
  const nameFor = (kind: string, i: number) =>
    spec.names === "scrambled" ? `ZZ ${(i * 7919) % 100003} ${kind}` : `${kind} ${i}`;
  let next = 0;

  const addPair = (
    opts: {
      tier?: BulkTier;
      appBirth?: string | null;
      providerBirth?: string;
      providerPosition?: "G" | "D" | "M" | "F";
      dobState?: string;
      dobJanuary1?: boolean;
      squad?: "COMPLETE" | "INCOMPLETE_PROVIDER_SQUAD";
      shirtConflict?: boolean;
      second?: boolean;
    } = {},
  ) => {
    const i = (next += 1);
    const club = i % clubs;
    const position = POSITIONS[i % 4]!;
    const birth = dobFor(i);
    const shirt = (i % 98) + 1;
    appPlayers.push({
      id: playerId(i),
      displayName: nameFor("App", i),
      position,
      teamId: teamId(club),
      birthDate: opts.appBirth === undefined ? birth : opts.appBirth,
      // Tier B: the app has no shirt, so the shirt gives NO signal (never a conflict).
      shirtNumber: opts.tier === "B" ? null : shirt,
    });
    const observation = (providerTeam: string, app: string | null) => ({
      provider: "sofascore" as const,
      externalPlayerId: `S${i}`,
      providerTeamId: providerTeam,
      clubKey: `club-${club}`,
      appTeamId: app,
      squadCompleteness: opts.squad ?? "COMPLETE",
      registeredTeamId: null,
      registeredTeamDisagreement: false,
      shirtNumber: opts.shirtConflict ? shirt + 1 : shirt,
      positionSignal: opts.providerPosition ?? position,
      dobState: opts.dobState ?? "valid",
      birthDate: opts.providerBirth ?? birth,
      dobJanuary1: opts.dobJanuary1 ?? false,
      heightCm: null,
      nationalitySignal: null,
    });
    const observations = [observation(`PT${club}`, teamId(club))];
    if (opts.second) observations.push(observation(`PT${club}b`, teamId((club + 1) % clubs)));
    candidates.push({
      id: candidateUuid(i),
      provider: "sofascore",
      externalPlayerId: `S${i}`,
      observations,
      flags: opts.second ? ["MULTI_SQUAD_OBSERVATION"] : [],
      displayName: nameFor("Provider", i),
    });
    if (opts.tier) eligible.push({ index: i, tier: opts.tier });
  };

  for (let n = 0; n < spec.tierA; n += 1) addPair({ tier: "A" });
  for (let n = 0; n < spec.tierB; n += 1) addPair({ tier: "B" });
  for (let n = 0; n < (spec.noExactDob ?? 0); n += 1) addPair({ providerBirth: "1980-03-03" });
  for (let n = 0; n < (spec.positionConflict ?? 0); n += 1) {
    // The provider says a different position than the app player holds.
    const i = next + 1;
    addPair({ providerPosition: POSITIONS[(i + 1) % 4]! });
  }
  for (let n = 0; n < (spec.incompleteSquad ?? 0); n += 1)
    addPair({ squad: "INCOMPLETE_PROVIDER_SQUAD" });
  for (let n = 0; n < (spec.january1Provider ?? 0); n += 1)
    addPair({ dobJanuary1: true, providerBirth: "1995-01-01" });
  for (let n = 0; n < (spec.multiSquad ?? 0); n += 1) addPair({ second: true });
  for (let n = 0; n < (spec.shirtConflict ?? 0); n += 1) addPair({ shirtConflict: true });
  for (let n = 0; n < (spec.appJanuary1 ?? 0); n += 1)
    addPair({ appBirth: "1992-01-01", providerBirth: "1992-01-01" });

  for (let n = 0; n < spec.flashscore; n += 1) {
    const i = (next += 1);
    const club = i % clubs;
    candidates.push({
      id: candidateUuid(i),
      provider: "flashscore",
      externalPlayerId: `F${i}`,
      observations: [
        {
          provider: "flashscore",
          externalPlayerId: `F${i}`,
          providerTeamId: `FT${club}`,
          clubKey: `club-${club}`,
          appTeamId: teamId(club),
          squadCompleteness: "COMPLETE",
          registeredTeamId: null,
          registeredTeamDisagreement: false,
          shirtNumber: (i % 98) + 1,
          positionSignal: POSITIONS[i % 4]!,
          dobState: "missing",
          birthDate: null,
          dobJanuary1: false,
          heightCm: null,
          nationalitySignal: null,
        },
      ],
      flags: [],
      displayName: nameFor("Flash", i),
    });
  }
  return { appPlayers, candidates, eligible };
}

/** The production-shaped population: 189 eligible (108 A, 81 B) among 1,004 candidates. */
export const PRODUCTION_SHAPE: WorldSpec = {
  tierA: 108,
  tierB: 81,
  flashscore: 465,
  noExactDob: 246,
  positionConflict: 44,
  incompleteSquad: 10,
  january1Provider: 36,
  multiSquad: 2,
  shirtConflict: 6,
  appJanuary1: 6,
};

export const newRepo = (
  world: World,
  extra: {
    allowSelfApproval?: boolean;
    actor?: string;
    /** Mapping rows that already exist (with their review record), e.g. a copy of another repository's. */
    mappings?: readonly MockMappingRow[];
  } = {},
) =>
  new InMemoryPlayerMappingRepository({
    candidates: world.candidates,
    appPlayers: world.appPlayers,
    mappings: extra.mappings,
    qualifiedActors: [extra.actor ?? OWNER],
    allowSelfApproval: extra.allowSelfApproval ?? true,
  });

/**
 * The fingerprints the (stand-in) backend would give each eligible row. Computed on a
 * SEPARATE copy of the world, so the repository under test starts untouched. In
 * production the same numbers come from the database's own fingerprint function.
 */
export async function oracleManifest(world: World, actor: string = OWNER): Promise<BulkManifest> {
  const oracle = newRepo(world, { actor });
  const rows: ManifestRow[] = [];
  const ctx: RepositoryContext = { actorId: actor, requestId: "oracle" };
  for (const tier of ["A", "B"] as const) {
    const members = world.eligible.filter((e) => e.tier === tier);
    for (let at = 0; at < members.length; at += 100) {
      const part = members.slice(at, at + 100);
      await oracle.proposeMappings(
        part.map((m) => ({
          kind: "map" as const,
          sofascoreCandidateId: candidateUuid(m.index),
          appPlayerId: playerId(m.index),
          basis: "manual" as const,
        })),
        BULK_REASONS[tier],
        crypto.randomUUID(),
        ctx,
      );
    }
  }
  const proposals = await loadAllProposals(oracle, null, ctx);
  for (const e of world.eligible) {
    const p = proposals.find((x) => x.sofascoreCandidateId === candidateUuid(e.index))!;
    const candidate = await oracle.getMappingCandidate(candidateUuid(e.index), ctx);
    rows.push({
      candidateId: candidateUuid(e.index),
      provider: "sofascore",
      externalId: `S${e.index}`,
      appPlayerId: playerId(e.index),
      appTeamId: candidate.observations[0]!.appTeamId!,
      evidenceRevision: candidate.evidenceRevision,
      tier: e.tier,
      candidateStatus: "unmapped",
      currentMappingState: "none",
      openProposalState: "none",
      observationCount: 1,
      squadCompleteness: "COMPLETE",
      signals: {
        dob: "match",
        position: "match",
        club: "match",
        shirt: e.tier === "A" ? "match" : "no_signal",
      },
      sportsMonksCorroboration: true,
      fingerprintInputs: {
        kind: "map",
        basis: "manual",
        sofascoreCandidateId: candidateUuid(e.index),
        sofascoreExternalId: `S${e.index}`,
        appPlayerId: playerId(e.index),
        candidateRevisions: { sofascore: candidate.evidenceRevision },
        evidence: {},
        signals: {},
        positionDisagreement: false,
      },
      expectedFingerprint: p.fingerprint,
    });
  }
  return buildManifest(rows);
}

/**
 * The structured facts of every candidate, as the contract reads them: from the
 * repository's signals and structure only. A display name is not a field here, so no
 * name can reach the classifier.
 */
export async function factsOf(
  repo: InMemoryPlayerMappingRepository,
  options: { sportsMonks?: (appPlayerId: string) => boolean } = {},
): Promise<CandidateFacts[]> {
  const ctx = ownerContext();
  const all = await loadAllCandidates(repo, {}, ctx);
  const proposals = await loadAllProposals(repo, null, ctx);
  const sportsMonks = options.sportsMonks ?? (() => true);
  const out: CandidateFacts[] = [];
  for (const c of all) {
    const obs = c.observations[0];
    const team = obs?.appTeamId ?? null;
    const raw = team ? await repo.listMappingCandidatesForAppPlayer(c.id, team, 200, ctx) : [];
    out.push({
      candidateId: c.id,
      provider: c.provider,
      externalId: c.externalId,
      status: c.status,
      hasExistingMapping: c.existingMappingId !== null,
      providerIdMapped: false,
      openProposal:
        c.openProposalId !== null ||
        proposals.some(
          (p) => p.sofascoreCandidateId === c.id && ["pending", "approved"].includes(p.status),
        ),
      evidenceRevision: c.evidenceRevision,
      observationCount: c.observations.length,
      appTeamId: team,
      squadComplete: obs?.squadCompleteness === "COMPLETE",
      registeredTeamDisagreement: obs?.registeredTeamDisagreement ?? false,
      providerDobState: obs?.dobState ?? "missing",
      providerDobJanuary1: obs?.dobJanuary1 ?? false,
      independentBridge: false,
      options: raw.map((o) => {
        const s = readOptionSignals(o.signals);
        return {
          appPlayerId: o.appPlayerId,
          dob: s.dob,
          shirt: s.shirt,
          position: s.position,
          club: s.club,
          flags: s.flags,
          ownedBySofascore: o.alreadyMappedForProvider,
          sportsMonksActive: sportsMonks(o.appPlayerId),
        };
      }),
    });
  }
  return out;
}
