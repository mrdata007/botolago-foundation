/**
 * Invented managers for the development sample route and the tests. Nobody here exists. Eight
 * managers: two share the top rating, two share a lower one, one is provisional, two have no
 * rating yet (one with two of four statistics, one still forming), and one of them is the reader.
 */
import type { CardClubDto } from "@/backend/manager-card/contracts";

const club = (n: number, fr: string, ar: string, color: string): CardClubDto => ({
  id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`,
  slug: null,
  code: null,
  name: { fr, ar },
  shortName: { fr, ar },
  city: null,
  primaryColor: color,
  secondaryColor: null,
});

export const SAMPLE_CLUBS = {
  a: club(1, "Raja", "الرجاء", "#1f7a3a"),
  b: club(2, "Wydad", "الوداد", "#c8102e"),
  c: club(3, "FAR", "الجيش", "#16423c"),
  d: club(4, "RSB", "نهضة بركان", "#f28c28"),
};

const id = (n: number) => `00000000-0000-4000-8000-0000000002${String(n).padStart(2, "0")}`;

export const SAMPLE_OWN_ID = id(5);

function card(
  n: number,
  name: string,
  clubKey: keyof typeof SAMPLE_CLUBS | null,
  ovr: number | null,
  tier: string | null,
  stats: [number | null, number | null, number | null, number | null],
  extra: { provisional?: boolean; counted?: number } = {},
) {
  return {
    teamId: id(n),
    name,
    club: clubKey ? SAMPLE_CLUBS[clubKey] : null,
    serial: null,
    founderCohort: null,
    seasonLabel: "2026/27",
    ratingState:
      ovr === null ? (extra.counted === undefined ? "insufficient" : "forming") : "rated",
    ovr,
    tier,
    provisional: extra.provisional ?? false,
    stats: { cap: stats[0], sel: stats[1], trf: stats[2], con: stats[3] },
    gameweeksCounted: extra.counted ?? 6,
    minRated: 3,
    firstRatedGameweekSeq: ovr === null ? null : 3,
  };
}

/** In no particular order: the ranking sorts them. */
export const SAMPLE_CARDS: ReadonlyArray<ReturnType<typeof card>> = [
  card(1, "Salma El Idrissi", "b", 84, "champion", [88, 80, 79, 89]),
  card(2, "Youssef Benali", "a", 91, "legend", [95, 90, 86, 93]),
  card(3, "Imane", "c", 91, "legend", [92, 94, 84, 94], { provisional: true }),
  card(4, "Hamza Ouazzani", null, 62, "stade", [60, 66, null, 60]),
  card(5, "Ali", "a", 77, "pro", [81, 72, 70, 85]),
  card(6, "Khadija Tazi", "d", 62, "stade", [58, 64, 66, 60]),
  card(7, "Mehdi", "b", null, null, [64, null, 71, null]),
  card(8, "Nadia Cherkaoui", "c", null, null, [null, null, null, null], { counted: 1 }),
];
