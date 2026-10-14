import {
  SofascoreQueueError,
  createPlayerArgs,
  linkOptionAction,
  parseSofascoreQueue,
  type AliasResult,
  type CreatePlayerInput,
  type CreateResult,
  type LinkOption,
  type LinkOptions,
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
        mappedActive: true,
        sofascoreAliasIds: [],
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
    canCreate: true,
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
  {
    sofascorePlayerId: "900008",
    name: "Joueur Exemple Eta",
    shortName: null,
    shirtNumber: 10,
    position: "midfielder",
    side: "home",
    reason: "no_shirt_on_file",
    fixtureId: id(5008),
    teamId: id(7001),
    teamName: "Club Exemple Casablanca",
    firstSeenAt: "2026-10-12T18:00:00Z",
    lastSeenAt: "2026-10-12T18:00:00Z",
    timesSeen: 1,
    candidates: [
      {
        playerId: id(8),
        fullName: "Eta Sans Numéro",
        displayName: null,
        position: "midfielder",
        shirtNumber: null,
        mappedToSofascoreId: null,
      },
    ],
  },
  {
    sofascorePlayerId: "900009",
    name: "Joueur Exemple Thêta",
    shortName: null,
    shirtNumber: 6,
    position: "defender",
    side: "away",
    reason: "ambiguous_shirt",
    fixtureId: id(5009),
    teamId: id(7002),
    teamName: "Club Exemple Rabat",
    firstSeenAt: "2026-10-12T18:00:00Z",
    lastSeenAt: "2026-10-12T20:00:00Z",
    timesSeen: 2,
    candidates: [
      {
        playerId: id(9),
        fullName: "Joueur Exemple Iota",
        displayName: null,
        position: "defender",
        shirtNumber: 6,
        mappedToSofascoreId: null,
      },
      {
        playerId: id(10),
        fullName: "Joueur Exemple Kappa",
        displayName: null,
        position: "midfielder",
        shirtNumber: 6,
        mappedToSofascoreId: null,
      },
    ],
  },
  {
    sofascorePlayerId: "900010",
    name: "Joueur Exemple Lambda",
    shortName: null,
    shirtNumber: null,
    position: "forward",
    side: "home",
    reason: "no_shirt",
    fixtureId: id(5010),
    teamId: id(7003),
    teamName: "نادي تجريبي فاس",
    firstSeenAt: "2026-10-12T18:00:00Z",
    lastSeenAt: "2026-10-12T18:00:00Z",
    timesSeen: 1,
    candidates: [],
    canCreate: true,
  },
  {
    sofascorePlayerId: "900011",
    name: "Joueur Exemple Mu",
    shortName: null,
    shirtNumber: 22,
    position: "midfielder",
    side: "away",
    reason: "shirt_conflict",
    fixtureId: id(5011),
    teamId: id(7004),
    teamName: "Club Exemple Tanger",
    firstSeenAt: "2026-10-11T18:00:00Z",
    lastSeenAt: "2026-10-12T20:00:00Z",
    timesSeen: 3,
    candidates: [
      {
        playerId: id(11),
        fullName: "Joueur Exemple Nu",
        displayName: null,
        position: "midfielder",
        shirtNumber: 22,
        mappedToSofascoreId: null,
      },
      {
        playerId: id(12),
        fullName: "Joueur Exemple Xi",
        displayName: null,
        position: "midfielder",
        shirtNumber: 23,
        mappedToSofascoreId: null,
      },
    ],
  },
  {
    sofascorePlayerId: "900012",
    name: "Joueur Exemple Omicron",
    shortName: null,
    shirtNumber: 14,
    position: null,
    side: null,
    reason: "weak_match",
    fixtureId: null,
    teamId: id(7001),
    teamName: "Club Exemple Casablanca",
    firstSeenAt: "2026-10-12T19:00:00Z",
    lastSeenAt: "2026-10-12T19:00:00Z",
    timesSeen: 1,
    candidates: [
      {
        playerId: id(13),
        fullName: "Joueur Exemple Pi",
        displayName: null,
        position: "midfielder",
        shirtNumber: 14,
        mappedToSofascoreId: null,
      },
    ],
  },
  // A row that does not have the expected shape: the screen leaves it out and says so.
  { name: "ligne sans identifiant", reason: "no_candidate", candidates: [] },
];

/** Invented catalog players for the search: some in a sample club, one with a second id, one switched off. */
const SAMPLE_CATALOG: readonly LinkOption[] = [
  {
    playerId: id(3),
    fullName: "Joueur Exemple Bêta",
    displayName: "Bêta",
    position: "defender",
    teamId: id(7002),
    teamName: "Club Exemple Rabat",
    shirtNumber: 4,
    inClub: false,
    sofascoreId: "811111",
    sofascoreActive: true,
    sofascoreAliasIds: [],
  },
  {
    playerId: id(21),
    fullName: "Joueur Exemple Kappa",
    displayName: "Kappa",
    position: "goalkeeper",
    teamId: id(7004),
    teamName: "Club Exemple Tanger",
    shirtNumber: 16,
    inClub: false,
    sofascoreId: null,
    sofascoreActive: null,
    sofascoreAliasIds: [],
  },
  {
    playerId: id(22),
    fullName: "Joueur Exemple Omicron",
    displayName: null,
    position: "goalkeeper",
    teamId: id(7004),
    teamName: "Club Exemple Tanger",
    shirtNumber: 30,
    inClub: false,
    sofascoreId: "822222",
    sofascoreActive: true,
    sofascoreAliasIds: ["833333"],
  },
  {
    playerId: id(23),
    fullName: "لاعب تجريبي سابع",
    displayName: null,
    position: "forward",
    teamId: id(7003),
    teamName: "نادي تجريبي فاس",
    shirtNumber: 11,
    inClub: false,
    sofascoreId: "844444",
    sofascoreActive: false,
    sofascoreAliasIds: [],
  },
];

export function buildSampleSofascoreQueue(): ParsedQueue {
  return parseSofascoreQueue(RAW_SAMPLE_QUEUE);
}

export class InMemorySofascorePlayerQueueRepository implements SofascorePlayerQueueRepository {
  private entries: QueueEntry[];
  private readonly skipped: number;
  /** Every confirmation received, in order, for a test to read. */
  readonly resolved: { sofascorePlayerId: string; playerId: string }[] = [];
  /** Every "link as second ID" and every creation received, in order. */
  readonly aliased: { sofascorePlayerId: string; playerId: string }[] = [];
  readonly created: { sofascorePlayerId: string; input: CreatePlayerInput }[] = [];

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
    const candidate =
      entry.candidates.find((c) => c.playerId === playerId) ??
      SAMPLE_CATALOG.find((c) => c.playerId === playerId);
    if (!candidate) throw new SofascoreQueueError("player_not_found", "not a candidate");
    const mapped =
      "mappedToSofascoreId" in candidate ? candidate.mappedToSofascoreId : candidate.sofascoreId;
    if (mapped !== null) {
      throw new SofascoreQueueError("sofascore_mapping_conflict", "already mapped");
    }
    this.resolved.push({ sofascorePlayerId, playerId });
    this.entries = this.entries.filter((e) => e.sofascorePlayerId !== sofascorePlayerId);
    return { sofascorePlayerId, playerId, mappingId: null, alreadyResolved: false };
  }

  async listOptions(sofascorePlayerId: string, query?: string): Promise<LinkOptions> {
    if (this.options.failListWith) {
      throw new SofascoreQueueError(this.options.failListWith, "refused");
    }
    const entry = this.entries.find((e) => e.sofascorePlayerId === sofascorePlayerId);
    if (!entry) throw new SofascoreQueueError("queue_entry_not_found", "not found");
    const q = query?.trim().toLowerCase() ?? "";
    if (q !== "" && (q.length < 2 || q.length > 80)) {
      throw new SofascoreQueueError("invalid_resolution", "invalid search");
    }
    const players = SAMPLE_CATALOG.map((p) => ({ ...p, inClub: p.teamId === entry.teamId }))
      .filter((p) =>
        q === ""
          ? p.inClub
          : `${p.fullName ?? ""} ${p.displayName ?? ""}`.toLowerCase().includes(q),
      )
      .sort((a, b) => Number(b.inClub) - Number(a.inClub));
    return { sofascorePlayerId, query: q === "" ? null : q, players, skipped: 0 };
  }

  async linkAlias(sofascorePlayerId: string, playerId: string): Promise<AliasResult> {
    if (this.options.failResolveWith) {
      throw new SofascoreQueueError(this.options.failResolveWith, "refused");
    }
    const entry = this.entries.find((e) => e.sofascorePlayerId === sofascorePlayerId);
    if (!entry) throw new SofascoreQueueError("queue_entry_not_found", "not found");
    const fromCandidates = entry.candidates.find((c) => c.playerId === playerId);
    const option =
      SAMPLE_CATALOG.find((c) => c.playerId === playerId) ??
      (fromCandidates
        ? {
            sofascoreId: fromCandidates.mappedToSofascoreId,
            sofascoreActive: fromCandidates.mappedActive,
          }
        : undefined);
    if (!option) throw new SofascoreQueueError("player_not_found", "unknown player");
    if (linkOptionAction(option) !== "alias") {
      throw new SofascoreQueueError("sofascore_alias_needs_primary", "no active main link");
    }
    this.aliased.push({ sofascorePlayerId, playerId });
    this.entries = this.entries.filter((e) => e.sofascorePlayerId !== sofascorePlayerId);
    return {
      sofascorePlayerId,
      playerId,
      primarySofascoreId: option.sofascoreId,
      alreadyLinked: false,
    };
  }

  async createPlayer(sofascorePlayerId: string, input: CreatePlayerInput): Promise<CreateResult> {
    createPlayerArgs(sofascorePlayerId, input);
    if (this.options.failResolveWith) {
      throw new SofascoreQueueError(this.options.failResolveWith, "refused");
    }
    const entry = this.entries.find((e) => e.sofascorePlayerId === sofascorePlayerId);
    if (!entry) throw new SofascoreQueueError("queue_entry_not_found", "not found");
    if (!entry.canCreate)
      throw new SofascoreQueueError("sofascore_create_no_club", "cannot create");
    this.created.push({ sofascorePlayerId, input });
    this.entries = this.entries.filter((e) => e.sofascorePlayerId !== sofascorePlayerId);
    return { sofascorePlayerId, playerId: id(900 + this.created.length), created: true };
  }
}
