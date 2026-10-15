import {
  alternativesMemberSchema,
  briefingMemberSchema,
  type AlternativesMember,
  type BriefingMember,
  type FormCell,
} from "@/backend/premium/briefing";

/**
 * The example briefing: Karim B. (KACM), 612 points, 3rd of 5 in his league, journée 11 with its
 * deadline on Friday 17 October 2026 at 18:00 (Morocco). It is what a non-member sees blurred
 * under the lock, and what the development server's mock repository answers. The names are
 * Botola players from the app's mock data; the ids are made up.
 *
 * It is an example, never anyone's data: a member's real figures are never drawn under a blur.
 */

const id = (kind: number, n: number) =>
  `00000000-0000-4000-8${kind}00-${String(n).padStart(12, "0")}`;

const CLUBS = {
  WAC: { id: id(1, 1), shortName: "WAC", name: "Wydad AC" },
  RCA: { id: id(1, 2), shortName: "RCA", name: "Raja CA" },
  FAR: { id: id(1, 3), shortName: "FAR", name: "AS FAR" },
  FUS: { id: id(1, 4), shortName: "FUS", name: "FUS Rabat" },
  RSB: { id: id(1, 5), shortName: "RSB", name: "RS Berkane" },
  HUS: { id: id(1, 6), shortName: "HUSA", name: "Hassania Agadir" },
  MOAS: { id: id(1, 7), shortName: "MCO", name: "MC Oujda" },
} as const;
type ClubCode = keyof typeof CLUBS;

/** The three journées the briefing looks back on, with the dates their points were published. */
const GW = [
  { sequence: 8, name: "J8", at: "2026-09-30T10:00:00+01:00" },
  { sequence: 9, name: "J9", at: "2026-10-06T10:00:00+01:00" },
  { sequence: 10, name: "J10", at: "2026-10-12T10:00:00+01:00" },
] as const;

type Cell = number | "wait" | "none";
/** Points per journée (J8, J9, J10): a number, `wait` (pending) or `none` (published, no rating). */
function form(cells: [Cell, Cell, Cell], minutes: [number, number, number]): FormCell[] {
  return GW.map((g, i) => {
    const cell = cells[i] as Cell;
    if (cell === "wait") {
      return {
        gameweekSequence: g.sequence,
        gameweekName: g.name,
        state: "pending" as const,
        points: null,
        minutes: null,
        publishedAt: null,
      };
    }
    return {
      gameweekSequence: g.sequence,
      gameweekName: g.name,
      state: cell === "none" ? ("no_rating" as const) : ("published" as const),
      points: cell === "none" ? null : cell,
      minutes: minutes[i] as number,
      publishedAt: g.at,
    };
  });
}

interface Seed {
  n: number;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  club: ClubCode;
  price: number;
  role: "starter" | "bench";
  cells: [Cell, Cell, Cell];
  minutes: [number, number, number];
  captain?: boolean;
  vice?: boolean;
  absent?: boolean;
  next: { opponent: ClubCode; home: boolean; difficulty: 1 | 2 | 3 | 4 | 5 } | null;
}

const SQUAD: Seed[] = [
  {
    n: 1,
    name: "Anas Zniti",
    position: "GK",
    club: "RCA",
    price: 4.8,
    role: "starter",
    cells: [4, 5, 6],
    minutes: [90, 90, 90],
    next: { opponent: "FUS", home: true, difficulty: 2 },
  },
  {
    n: 2,
    name: "Munir Mohamedi",
    position: "GK",
    club: "RSB",
    price: 4.6,
    role: "bench",
    cells: [5, 4, "wait"],
    minutes: [90, 0, 0],
    next: { opponent: "WAC", home: false, difficulty: 4 },
  },
  {
    n: 3,
    name: "Mohamed Nahiri",
    position: "DEF",
    club: "WAC",
    price: 5.5,
    role: "starter",
    cells: [6, 5, 0],
    minutes: [90, 71, 0],
    next: { opponent: "RSB", home: true, difficulty: 3 },
  },
  {
    n: 4,
    name: "Achraf Dari",
    position: "DEF",
    club: "FAR",
    price: 6.0,
    role: "starter",
    cells: [7, 6, 7],
    minutes: [90, 90, 90],
    next: { opponent: "WAC", home: false, difficulty: 4 },
  },
  {
    n: 5,
    name: "Issoufou Dayo",
    position: "DEF",
    club: "RSB",
    price: 5.4,
    role: "starter",
    cells: [5, 6, "wait"],
    minutes: [90, 90, 0],
    next: { opponent: "WAC", home: false, difficulty: 4 },
  },
  {
    n: 6,
    name: "Marouane Saadane",
    position: "DEF",
    club: "FUS",
    price: 4.5,
    role: "starter",
    cells: [4, 6, 5],
    minutes: [90, 90, 90],
    next: { opponent: "RCA", home: false, difficulty: 3 },
  },
  {
    n: 7,
    name: "Anass Salah-Eddine",
    position: "DEF",
    club: "FAR",
    price: 5.7,
    role: "bench",
    cells: [6, "wait", "wait"],
    minutes: [90, 0, 0],
    next: { opponent: "WAC", home: false, difficulty: 4 },
  },
  {
    n: 8,
    name: "Abdelilah Hafidi",
    position: "MID",
    club: "RCA",
    price: 7.0,
    role: "starter",
    cells: [6, 5, 0],
    minutes: [90, 62, 0],
    absent: true,
    next: { opponent: "FUS", home: true, difficulty: 2 },
  },
  {
    n: 9,
    name: "Mohamed Rabie Hrimat",
    position: "MID",
    club: "FAR",
    price: 6.7,
    role: "starter",
    cells: [6, 7, 8],
    minutes: [90, 90, 90],
    next: { opponent: "WAC", home: true, difficulty: 4 },
  },
  {
    n: 10,
    name: "Reda Slim",
    position: "MID",
    club: "FUS",
    price: 6.4,
    role: "starter",
    cells: [5, 6, "wait"],
    minutes: [90, 88, 0],
    next: { opponent: "RCA", home: false, difficulty: 3 },
  },
  {
    n: 11,
    name: "Bakr El Helali",
    position: "MID",
    club: "RSB",
    price: 6.5,
    role: "bench",
    cells: [6, "wait", "wait"],
    minutes: [90, 0, 0],
    next: { opponent: "WAC", home: false, difficulty: 4 },
  },
  {
    n: 12,
    name: "Mohamed Ali Bemammer",
    position: "MID",
    club: "HUS",
    price: 6.1,
    role: "bench",
    cells: [5, 5, 6],
    minutes: [90, 90, 90],
    next: { opponent: "MOAS", home: true, difficulty: 2 },
  },
  {
    n: 13,
    name: "Ayoub El Kaabi",
    position: "FWD",
    club: "RCA",
    price: 9.5,
    role: "starter",
    cells: [8, 7, "wait"],
    minutes: [90, 90, 0],
    captain: true,
    next: { opponent: "FUS", home: true, difficulty: 2 },
  },
  {
    n: 14,
    name: "Bouly Sambou",
    position: "FWD",
    club: "WAC",
    price: 8.0,
    role: "starter",
    cells: [7, 9, 7],
    minutes: [90, 90, 90],
    vice: true,
    next: { opponent: "FAR", home: false, difficulty: 4 },
  },
  {
    n: 15,
    name: "Ilias Haddad",
    position: "FWD",
    club: "FUS",
    price: 7.2,
    role: "starter",
    cells: [5, 6, 7],
    minutes: [90, 90, 90],
    next: { opponent: "RCA", home: false, difficulty: 3 },
  },
];

/** The deadline of journée 11: Friday 17 October 2026, 18:00 in Morocco. */
export const EXAMPLE_DEADLINE = "2026-10-17T18:00:00+01:00";

export function exampleBriefing(): BriefingMember {
  return briefingMemberSchema.parse({
    available: true,
    locked: false,
    gameweek: { id: id(2, 11), sequence: 11, name: "J11", deadlineAt: EXAMPLE_DEADLINE },
    team: {
      id: id(3, 1),
      name: "KACM",
      bank: 0.8,
      teamValue: 100,
      freeTransfers: 1,
      transferHitCost: 4,
      maxPerClub: 3,
      captainMultiplier: 2,
    },
    published: [
      { sequence: 8, name: "J8", state: "published", publishedAt: GW[0].at },
      { sequence: 9, name: "J9", state: "published", publishedAt: GW[1].at },
      { sequence: 10, name: "J10", state: "partial", publishedAt: GW[2].at },
    ],
    absenceFeed: { listed: 4 },
    squad: SQUAD.map((p) => ({
      fantasyPlayerId: id(4, p.n),
      name: p.name,
      position: p.position,
      club: CLUBS[p.club],
      price: p.price,
      salePrice: p.price,
      role: p.role,
      captain: p.captain === true,
      viceCaptain: p.vice === true,
      form: form(p.cells, p.minutes),
      absence: p.absent
        ? {
            category: "injury",
            expectedReturnOn: "2026-11-02",
            gamesMissed: 2,
            asOf: "2026-10-13T09:00:00+01:00",
            source: "provider",
          }
        : null,
      nextFixture: p.next
        ? {
            opponent: CLUBS[p.next.opponent],
            isHome: p.next.home,
            difficulty: p.next.difficulty,
            confidence: "medium",
          }
        : null,
    })),
    league: {
      id: id(5, 1),
      name: "Les Lions du Derb",
      rank: 3,
      size: 5,
      ahead: ["Sami", "Yassine"],
    },
  });
}

interface AltSeed {
  n: number;
  name: string;
  club: ClubCode;
  price: number;
  cells: [Cell, Cell, Cell];
  minutes: [number, number, number];
  after: number;
}

const ALTERNATIVES: AltSeed[] = [
  {
    n: 21,
    name: "Zouhair El Moutaraji",
    club: "WAC",
    price: 7.4,
    cells: [9, 7, "wait"],
    minutes: [90, 90, 0],
    after: 3,
  },
  {
    n: 22,
    name: "Nassim Boujellab",
    club: "RCA",
    price: 6.9,
    cells: ["none", 7, 6],
    minutes: [34, 90, 90],
    after: 3,
  },
  {
    n: 23,
    name: "Reda Jaadi",
    club: "WAC",
    price: 6.8,
    cells: [6, 8, "wait"],
    minutes: [90, 90, 0],
    after: 3,
  },
  {
    n: 24,
    name: "Amine Bassi",
    club: "MOAS",
    price: 5.9,
    cells: [5, 6, 7],
    minutes: [90, 90, 90],
    after: 1,
  },
];

/** The alternatives to the example's absent midfielder: sale price 7.0 + bank 0.8 = 7.8. */
export function exampleAlternatives(playerOut: string): AlternativesMember {
  return alternativesMemberSchema.parse({
    available: true,
    locked: false,
    playerOut,
    budget: { salePrice: 7.0, bank: 0.8, max: 7.8 },
    maxPerClub: 3,
    items: ALTERNATIVES.map((a) => ({
      fantasyPlayerId: id(4, a.n),
      name: a.name,
      position: "MID",
      club: CLUBS[a.club],
      price: a.price,
      clubInSquadAfter: a.after,
      form: form(a.cells, a.minutes),
    })),
  });
}

/** What this device last saw, for the example (« Depuis votre visite du 9 oct. »). */
export const EXAMPLE_PREVIOUS_VISIT = {
  at: "2026-10-09T19:30:00+01:00",
  gameweek: 10,
  published: { "8": "published", "9": "pending", "10": "pending" },
  absentIds: [] as string[],
  rank: 2 as number | null,
  size: 5 as number | null,
  ahead: ["Yassine"],
};
