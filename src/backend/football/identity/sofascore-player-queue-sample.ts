import {
  SofascoreQueueError,
  parseSofascoreQueue,
  type ParsedQueue,
  type QueueEntry,
  type ResolveResult,
  type SofascorePlayerQueueRepository,
} from "./sofascore-player-queue";

/**
 * Invented data and an in-memory repository for the development sample page and
 * for tests. No names here belong to a real person: they are "Joueur Exemple"
 * style placeholders, plus an Arabic one to exercise right-to-left text.
 */
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const RAW_SAMPLE_QUEUE: readonly unknown[] = [
  {
    sofascorePlayerId: "900001",
    name: "Joueur Exemple Alpha",
    shortName: "J. Alpha",
    shirtNumber: 9,
    position: "forward",
    side: "home",
    reason: "ambiguous_name",
    fixtureId: id(5001),
    teamId: id(7001),
    teamName: "Club Exemple Casablanca",
    firstSeenAt: "2026-10-10T18:05:00Z",
    lastSeenAt: "2026-10-11T20:40:00Z",
    timesSeen: 4,
    candidates: [
      {
        playerId: id(1),
        fullName: "Joueur Exemple Alpha Premier",
        displayName: "Alpha P.",
        position: "forward",
        shirtNumber: 9,
        mappedToSofascoreId: null,
      },
      {
        playerId: id(2),
        fullName: "Joueur Exemple Alpha Second",
        displayName: "Alpha S.",
        position: "midfielder",
        shirtNumber: 19,
        mappedToSofascoreId: null,
      },
    ],
  },
  {
    sofascorePlayerId: "900002",
    name: "Joueur Exemple Bêta",
    shortName: null,
    shirtNumber: 4,
    position: "defender",
    side: "away",
    reason: "candidate_already_mapped",
    fixtureId: id(5002),
    teamId: id(7002),
    teamName: "Club Exemple Rabat",
    firstSeenAt: "2026-10-09T15:00:00Z",
    lastSeenAt: "2026-10-11T19:00:00Z",
    timesSeen: 7,
    candidates: [
      {
        playerId: id(3),
        fullName: "Joueur Exemple Bêta",
        displayName: "Bêta",
        position: "defender",
        shirtNumber: 4,
        mappedToSofascoreId: "811111",
      },
    ],
  },
  {
    sofascorePlayerId: "900003",
    name: "لاعب تجريبي ثالث",
    shortName: null,
    shirtNumber: 21,
    position: "midfielder",
    side: "home",
    reason: "partial_name",
    fixtureId: id(5003),
    teamId: id(7003),
    teamName: "نادي تجريبي فاس",
    firstSeenAt: "2026-10-11T12:00:00Z",
    lastSeenAt: "2026-10-11T12:00:00Z",
    timesSeen: 1,
    candidates: [
      {
        playerId: id(4),
        fullName: "لاعب تجريبي ثالث المغربي",
        displayName: null,
        position: "midfielder",
        shirtNumber: null,
        mappedToSofascoreId: null,
      },
    ],
  },
  {
    sofascorePlayerId: "900004",
    name: "Joueur Exemple Gamma avec un nom particulièrement long pour vérifier le retour à la ligne",
    shortName: "J. Gamma",
    shirtNumber: 1,
    position: "goalkeeper",
    side: "away",
    reason: "no_candidate",
    fixtureId: id(5004),
    teamId: id(7004),
    teamName: "Club Exemple Tanger",
    firstSeenAt: "2026-10-08T09:00:00Z",
    lastSeenAt: "2026-10-11T21:00:00Z",
    timesSeen: 12,
    candidates: [],
  },
  {
    sofascorePlayerId: "900005",
    name: "Joueur Exemple Delta",
    shortName: null,
    shirtNumber: null,
    position: null,
    side: "home",
    reason: "duplicate_name_in_squad",
    fixtureId: id(5005),
    teamId: id(7001),
    teamName: "Club Exemple Casablanca",
    firstSeenAt: "2026-10-11T08:00:00Z",
    lastSeenAt: "2026-10-11T08:00:00Z",
    timesSeen: 1,
    candidates: [],
  },
  {
    sofascorePlayerId: "900006",
    name: "Joueur Exemple Epsilon",
    shortName: "J. Epsilon",
    shirtNumber: 17,
    position: "forward",
    side: "away",
    reason: "position_mismatch",
    fixtureId: id(5006),
    teamId: id(7005),
    teamName: "Club Exemple Agadir",
    firstSeenAt: "2026-10-10T10:00:00Z",
    lastSeenAt: "2026-10-11T10:30:00Z",
    timesSeen: 3,
    candidates: [
      {
        playerId: id(6),
        fullName: "Joueur Exemple Epsilon",
        displayName: "Epsilon",
        position: "defender",
        shirtNumber: 17,
        mappedToSofascoreId: null,
      },
    ],
  },
  {
    sofascorePlayerId: "900007",
    name: "Joueur Exemple Zêta",
    shortName: null,
    shirtNumber: 30,
    position: "midfielder",
    side: "home",
    reason: "inactive_mapping_exists",
    fixtureId: id(5007),
    teamId: id(7002),
    teamName: "Club Exemple Rabat",
    firstSeenAt: "2026-10-07T10:00:00Z",
    lastSeenAt: "2026-10-11T10:30:00Z",
    timesSeen: 9,
    candidates: [
      {
        playerId: id(7),
        fullName: "Joueur Exemple Zêta",
        displayName: "Zêta",
        position: "midfielder",
        shirtNumber: 30,
        mappedToSofascoreId: null,
      },
    ],
  },
  // A row that does not have the expected shape: the screen leaves it out and says so.
  { name: "ligne sans identifiant", reason: "no_candidate", candidates: [] },
];

export function buildSampleSofascoreQueue(): ParsedQueue {
  return parseSofascoreQueue(RAW_SAMPLE_QUEUE);
}

export class InMemorySofascorePlayerQueueRepository implements SofascorePlayerQueueRepository {
  private entries: QueueEntry[];
  private readonly skipped: number;
  /** Every confirmation received, in order, for a test to read. */
  readonly resolved: { sofascorePlayerId: string; playerId: string }[] = [];

  constructor(
    private readonly options: {
      /** When set, every confirmation is refused with this code. */
      failResolveWith?: SofascoreQueueError["code"];
      /** When set, the list itself fails with this code. */
      failListWith?: SofascoreQueueError["code"];
      entries?: ParsedQueue;
    } = {},
  ) {
    const queue = options.entries ?? buildSampleSofascoreQueue();
    this.entries = [...queue.entries];
    this.skipped = queue.skipped;
  }

  async listQueue(): Promise<ParsedQueue> {
    if (this.options.failListWith) {
      throw new SofascoreQueueError(this.options.failListWith, "refused");
    }
    return { entries: [...this.entries], skipped: this.skipped };
  }

  async resolve(sofascorePlayerId: string, playerId: string): Promise<ResolveResult> {
    if (this.options.failResolveWith) {
      throw new SofascoreQueueError(this.options.failResolveWith, "refused");
    }
    const entry = this.entries.find((e) => e.sofascorePlayerId === sofascorePlayerId);
    if (!entry) throw new SofascoreQueueError("queue_entry_not_found", "not found");
    const candidate = entry.candidates.find((c) => c.playerId === playerId);
    if (!candidate) throw new SofascoreQueueError("player_not_found", "not a candidate");
    if (candidate.mappedToSofascoreId !== null) {
      throw new SofascoreQueueError("sofascore_mapping_conflict", "already mapped");
    }
    this.resolved.push({ sofascorePlayerId, playerId });
    this.entries = this.entries.filter((e) => e.sofascorePlayerId !== sofascorePlayerId);
    return { sofascorePlayerId, playerId, mappingId: null, alreadyResolved: false };
  }
}
