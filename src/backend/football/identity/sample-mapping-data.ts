import type { BuiltCandidate } from "./candidate-builder";
import { CLUB_PROVIDER_TEAMS } from "./club-registry";
import {
  InMemoryPlayerMappingRepository,
  type MockAppPlayer,
  type MockSeedCandidate,
} from "./mock-mapping-repository";

/**
 * Deterministic SAMPLE data for the reviewer screen's tests and its browser
 * harness. Every name is invented ("Joueur Exemple 0042") and every id is a
 * made-up uuid: nothing here comes from production, and nothing is ever sent
 * anywhere. The shape matches what the database functions return, so the screen
 * can be exercised at the real scale (1,004 candidates over 16 clubs) with no
 * database.
 */

/** Production's counts when the candidates were recorded (2 October 2026). */
export const PRODUCTION_SCALE = { sofascore: 539, flashscore: 465 } as const;

export const SAMPLE_ACTORS = {
  /** Holds football.manage_mappings. */
  proposer: "00000000-0000-4000-8000-0000000000a1",
  /** A second person who also holds it. */
  approver: "00000000-0000-4000-8000-0000000000a2",
} as const;

type Position = "G" | "D" | "M" | "F";
const POSITIONS: readonly Position[] = ["G", "D", "D", "D", "M", "M", "M", "F", "F"];

/** mulberry32: a small seeded generator, so a sample is the same every run. */
function generator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (n: number, width = 12) => n.toString(16).padStart(width, "0");
export const sampleUuid = (kind: "c" | "a" | "t" | "p", n: number) =>
  `0000000${kind === "c" ? "1" : kind === "a" ? "2" : kind === "t" ? "3" : "4"}-0000-4000-8000-${hex(n)}`;

const isoDate = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export interface SampleOptions {
  readonly sofascore?: number;
  readonly flashscore?: number;
  readonly seed?: number;
}

export interface SampleWorld {
  readonly repository: InMemoryPlayerMappingRepository;
  readonly candidates: readonly MockSeedCandidate[];
  readonly appPlayers: readonly MockAppPlayer[];
  readonly clubKeys: readonly string[];
}

/**
 * Builds the world: per club, a roster of app players, and provider candidates
 * that mostly describe one of them (the rest are players the app does not have).
 * A few carry the flags a reviewer must see: two squads, a registered team that
 * disagrees, and Widad Témara's Flashscore squad marked incomplete.
 */
export function buildSampleWorld(options: SampleOptions = {}): SampleWorld {
  const wantSofa = options.sofascore ?? PRODUCTION_SCALE.sofascore;
  const wantFlash = options.flashscore ?? PRODUCTION_SCALE.flashscore;
  const rand = generator(options.seed ?? 20261002);
  const clubs = CLUB_PROVIDER_TEAMS;
  const appPlayers: MockAppPlayer[] = [];
  const rosterByClub = new Map<string, MockAppPlayer[]>();
  let appCounter = 0;
  clubs.forEach((club, clubIndex) => {
    const roster: MockAppPlayer[] = [];
    const teamId = sampleUuid("t", clubIndex + 1);
    for (let slot = 0; slot < 38; slot += 1) {
      appCounter += 1;
      const hasDob = rand() > 0.25;
      const january1 = hasDob && rand() < 0.03;
      roster.push({
        id: sampleUuid("a", appCounter),
        displayName: `Joueur Exemple ${String(appCounter).padStart(4, "0")}`,
        position: POSITIONS[Math.floor(rand() * POSITIONS.length)]!,
        teamId,
        birthDate: hasDob
          ? january1
            ? isoDate(1990 + Math.floor(rand() * 15), 1, 1)
            : isoDate(
                1989 + Math.floor(rand() * 16),
                1 + Math.floor(rand() * 12),
                1 + Math.floor(rand() * 28),
              )
          : null,
        shirtNumber: rand() > 0.3 ? slot + 1 : null,
      });
    }
    rosterByClub.set(club.clubKey, roster);
    appPlayers.push(...roster);
  });

  const candidates: MockSeedCandidate[] = [];
  let candidateCounter = 0;
  const make = (provider: "sofascore" | "flashscore", total: number) => {
    for (let index = 0; index < total; index += 1) {
      const clubIndex = index % clubs.length;
      const club = clubs[clubIndex]!;
      const roster = rosterByClub.get(club.clubKey)!;
      const teamId = sampleUuid("t", clubIndex + 1);
      candidateCounter += 1;
      // Three in four describe someone the app has; the rest are new to the app.
      const twin = rand() < 0.75 ? roster[Math.floor(rand() * roster.length)]! : null;
      const incomplete = provider === "flashscore" && club.clubKey === "widad-temara";
      const observation = (providerTeamId: string, clubKey: string, appTeamId: string) => ({
        provider,
        externalPlayerId: String(100_000 + candidateCounter),
        providerTeamId,
        clubKey,
        appTeamId,
        squadCompleteness: incomplete
          ? ("INCOMPLETE_PROVIDER_SQUAD" as const)
          : ("COMPLETE" as const),
        registeredTeamId: null,
        registeredTeamDisagreement: provider === "sofascore" && rand() < 0.06,
        shirtNumber:
          twin?.shirtNumber && rand() < 0.8
            ? twin.shirtNumber
            : rand() < 0.8
              ? 1 + Math.floor(rand() * 40)
              : null,
        positionSignal:
          rand() < 0.95
            ? twin?.position && rand() < 0.9
              ? twin.position
              : POSITIONS[Math.floor(rand() * POSITIONS.length)]!
            : null,
        // Flashscore squads carry no date of birth; Sofascore's is usually there.
        dobState:
          provider === "flashscore"
            ? "not_provided"
            : twin?.birthDate && rand() < 0.9
              ? "valid"
              : "missing",
        birthDate: null as string | null,
        dobJanuary1: false,
        heightCm: rand() < 0.5 ? 165 + Math.floor(rand() * 30) : null,
        nationalitySignal: rand() < 0.5 ? "flag:1" : null,
      });
      const first = observation(
        provider === "sofascore" ? String(club.sofascoreTeamId) : club.flashscoreTeamId,
        club.clubKey,
        teamId,
      );
      if (first.dobState === "valid") {
        first.birthDate = twin!.birthDate!;
        first.dobJanuary1 = first.birthDate.endsWith("-01-01");
      }
      const observations = [first];
      // The first two Sofascore candidates sit in two squads, as in production.
      if (provider === "sofascore" && index < 2) {
        const other = clubs[(clubIndex + 1) % clubs.length]!;
        observations.push(
          observation(
            String(other.sofascoreTeamId),
            other.clubKey,
            sampleUuid("t", ((clubIndex + 1) % clubs.length) + 1),
          ),
        );
      }
      const flags: BuiltCandidate["flags"] = [
        ...(observations.length > 1 ? (["MULTI_SQUAD_OBSERVATION"] as const) : []),
        ...(incomplete ? (["INCOMPLETE_PROVIDER_SQUAD"] as const) : []),
      ];
      candidates.push({
        id: sampleUuid("c", candidateCounter),
        provider,
        externalPlayerId: first.externalPlayerId,
        observations,
        flags,
        displayName: `${provider === "sofascore" ? "Sofa" : "Flash"} Exemple ${String(candidateCounter).padStart(4, "0")}`,
      });
    }
  };
  make("sofascore", wantSofa);
  make("flashscore", wantFlash);

  const repository = new InMemoryPlayerMappingRepository({
    candidates,
    appPlayers,
    qualifiedActors: [SAMPLE_ACTORS.proposer, SAMPLE_ACTORS.approver],
  });
  return { repository, candidates, appPlayers, clubKeys: clubs.map((c) => c.clubKey) };
}
