/**
 * Pure helpers for the Curva ranking (`/curva/classement`): which cards are rankable, in what
 * order, with what rank. The owner approved this screen on 2026-10-12; « Les vôtres » keeps the
 * league's points order and does not use any of this.
 *
 * Order: rated cards by OVR descending (equal OVR, equal rank: 1, 1, 3), then the cards without an
 * OVR, unranked, the fullest first. A row that cannot be read (no team id, no name, an OVR outside
 * 1 to 99, an unknown tier) is skipped and counted, never thrown.
 */
import type { CardClubDto } from "@/backend/manager-card/contracts";
import {
  STAT_CODES,
  TIER_CODES,
  type StatCode,
  type TierCode,
} from "@/components/manager-card/types";

/** The most managers one card read answers for, and so the most the « Tous » view ranks. */
export const RANKING_LIMIT = 100;

export const STAT_TOTAL = STAT_CODES.length;

/** What the ranking needs of a card, once it has been checked. */
export interface RankingEntry {
  teamId: string;
  name: string;
  club: CardClubDto | null;
  tier: TierCode | null;
  ovr: number | null;
  provisional: boolean;
  stats: Record<StatCode, number | null>;
  /** How many of the four statistics are filled. */
  filled: number;
  /** « En formation k/min » for a card that has not counted enough journées yet. */
  counted: number;
  minRated: number;
  own: boolean;
}

export interface RatedRow {
  entry: RankingEntry;
  /** Competition rank: equal OVR share it and the next one is skipped. */
  rank: number;
  /** The previous row has the same rank. */
  tied: boolean;
}

export interface Ranking {
  rated: RatedRow[];
  unrated: RankingEntry[];
  /** Rows dropped because they could not be read. */
  skipped: number;
  /**
   * The reader's own card when their team is not in the list that was ranked (a league of more than
   * 100 teams, or the overall board past its first 100). It has no rank here: a rank among a
   * partial list would be a wrong number.
   */
  ownOutside: RankingEntry | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStat = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 99;

/** A card from the read, as a ranking entry, or null when it cannot be used. */
export function toEntry(raw: unknown, ownTeamId: string | null | undefined): RankingEntry | null {
  if (!isRecord(raw)) return null;
  const teamId = typeof raw.teamId === "string" ? raw.teamId.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!teamId || !name) return null;

  const ovr = raw.ovr === null || raw.ovr === undefined ? null : raw.ovr;
  if (ovr !== null && !isStat(ovr)) return null;
  const tier = raw.tier === null || raw.tier === undefined ? null : raw.tier;
  if (tier !== null && !(TIER_CODES as readonly unknown[]).includes(tier)) return null;

  const rawStats = isRecord(raw.stats) ? raw.stats : {};
  const stats = { cap: null, sel: null, trf: null, con: null } as Record<StatCode, number | null>;
  for (const code of STAT_CODES) {
    const value = rawStats[code];
    stats[code] = isStat(value) ? value : null;
  }
  const filled = STAT_CODES.filter((code) => stats[code] !== null).length;

  const club =
    isRecord(raw.club) && typeof raw.club.id === "string"
      ? (raw.club as unknown as CardClubDto)
      : null;
  const counted =
    typeof raw.gameweeksCounted === "number" && raw.gameweeksCounted >= 0
      ? Math.floor(raw.gameweeksCounted)
      : 0;
  const minRated =
    typeof raw.minRated === "number" && raw.minRated > 0 ? Math.floor(raw.minRated) : 0;

  return {
    teamId,
    name,
    club,
    tier: ovr === null ? null : (tier as TierCode | null),
    ovr,
    provisional: ovr !== null && raw.provisional === true,
    stats,
    filled,
    counted,
    minRated,
    own: teamId === "me" || (!!ownTeamId && teamId === ownTeamId),
  };
}

const byName = (a: RankingEntry, b: RankingEntry) =>
  a.name.localeCompare(b.name, "fr") || a.teamId.localeCompare(b.teamId);

/** The ranking of a set of cards. A team that appears twice counts once. */
export function buildRanking(
  cards: readonly unknown[],
  ownTeamId: string | null | undefined,
  /** The teams of the list that was ranked; the reader's card outside it is set aside. */
  listedIds?: ReadonlySet<string>,
): Ranking {
  const seen = new Set<string>();
  const rated: RankingEntry[] = [];
  const unrated: RankingEntry[] = [];
  let skipped = 0;
  let ownOutside: RankingEntry | null = null;
  for (const raw of cards) {
    const entry = toEntry(raw, ownTeamId);
    if (!entry) {
      skipped += 1;
      continue;
    }
    if (seen.has(entry.teamId)) continue;
    seen.add(entry.teamId);
    if (entry.own && listedIds && !listedIds.has(entry.teamId)) {
      ownOutside = entry;
      continue;
    }
    (entry.ovr === null ? unrated : rated).push(entry);
  }

  rated.sort((a, b) => b.ovr! - a.ovr! || byName(a, b));
  unrated.sort((a, b) => b.filled - a.filled || b.counted - a.counted || byName(a, b));

  const rows: RatedRow[] = [];
  rated.forEach((entry, index) => {
    const previous = rows[index - 1];
    const tied = previous !== undefined && previous.entry.ovr === entry.ovr;
    rows.push({ entry, rank: tied ? previous.rank : index + 1, tied });
  });
  return { rated: rows, unrated, skipped, ownOutside };
}

/** The team ids to ask the card read about: at most `limit`, the reader's own always in. */
export function rankingTeamIds(
  ids: readonly string[],
  ownTeamId?: string | null,
  limit = RANKING_LIMIT,
): string[] {
  const unique = [...new Set(ids)];
  const head = unique.slice(0, limit);
  if (ownTeamId && unique.includes(ownTeamId) && !head.includes(ownTeamId)) {
    head[limit - 1] = ownTeamId;
  }
  return head;
}

/** What the screen shows, from what the reads say. A card error with no rows at all is a full error. */
export function rankingStatus(read: {
  off: boolean;
  listError: boolean;
  cardsFailedEmpty: boolean;
  noLeague: boolean;
  leaguesPending: boolean;
  listPending: boolean;
  cardsPending: boolean;
}): "off" | "error" | "no_league" | "loading" | "ready" {
  if (read.off) return "off";
  if (read.listError || read.cardsFailedEmpty) return "error";
  if (read.noLeague) return "no_league";
  if (read.leaguesPending || read.listPending || read.cardsPending) return "loading";
  return "ready";
}
