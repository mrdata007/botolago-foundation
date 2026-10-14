import type { CareerMember, DuelMember, DuelWeek } from "@/backend/premium/card-reads";
import type { LeagueSeries } from "@/backend/premium/league-context";

import { makeSeasonView, type SeasonPeople, type SeasonView } from "./plus-season-context";
import {
  MISSING,
  TRANSFER_PENALTY,
  type RatingCode,
  type SeasonRaw,
  type TransferWeek,
} from "./plus-season-data";

/**
 * Maps a member's paid reads (`get_my_card_career`, `get_card_duel`, `get_card_league_context`)
 * into the shape the season screens draw (`SeasonRaw`). This is the one place that knows all sides.
 *
 * The league context (`LeagueSeries`, from `toLeagueSeries`) is merged by `gameweekSeq`, never by
 * position: the weeks can have gaps (journées 1, 2, 3, 5) and the league's weeks need not be the
 * reader's. What the API serves as null stays `MISSING` (`NaN`) and the screens write it « — »:
 *
 *   - a league smaller than `minGroup` (captain and transfer averages, the ratings' average);
 *   - a journée the league has no figure for, a rank not yet earned;
 *   - on the duel's rival side: everything weekly, the captain and the transfers when they keep
 *     their history to themselves, and always the best starters and the best-choice count (the
 *     context does not serve them);
 *   - everything of the league when no league series is given (the context off, the reader in no
 *     private league, or the read failed): the career and the duel still show.
 */

const missing = (n: number): number[] => Array.from({ length: n }, () => MISSING);
const byCode = <T>(value: (code: RatingCode) => T): Record<RatingCode, T> => ({
  CAP: value("CAP"),
  SEL: value("SEL"),
  TRF: value("TRF"),
  CON: value("CON"),
});
const statKey = { CAP: "cap", SEL: "sel", TRF: "trf", CON: "con" } as const;
const orMissing = (n: number | null | undefined): number =>
  n === null || n === undefined ? MISSING : n;

/** One value of a league series per journée of the reader's, matched on the real journée number. */
function byWeek(
  league: LeagueSeries | null,
  weeks: readonly number[],
  series: readonly (number | null)[] | null | undefined,
): number[] {
  if (!league || !series) return missing(weeks.length);
  const at = new Map(league.gameweeks.map((seq, i) => [seq, i]));
  return weeks.map((seq) => {
    const i = at.get(seq);
    return i === undefined ? MISSING : orMissing(series[i]);
  });
}

/** The league's season figures that are the same for a career and a duel. */
function leagueSeason(league: LeagueSeries | null) {
  return {
    leaderTotal: orMissing(league?.leaderTotal),
    leagueCaptain: orMissing(league?.leagueCaptain),
    leagueNetTransfers: orMissing(league?.leagueNetTransfers),
    leagueRating: byCode((code) => orMissing(league?.leagueRating[code])),
    ratingRank: {
      ...byCode((code) => orMissing(league?.ratingRank[code])),
      OVR: orMissing(league?.ratingRank.OVR),
    },
  };
}

/** The sides of a duel's decisions that only the league's data can fill. */
const NO_RIVAL_DECISIONS: SeasonRaw["rival_"] = {
  captain: MISSING,
  bestStarters: MISSING,
  gross: MISSING,
  penalty: MISSING,
  transfers: MISSING,
  paidTransfers: MISSING,
  captainBest: MISSING,
};

/**
 * « Votre saison » from the career read, with the league's context when it is given. Null when no
 * journée has been played yet.
 */
export function careerToSeasonView(
  career: CareerMember,
  league: LeagueSeries | null = null,
): SeasonView | null {
  const weeks = [...career.weeks].sort((a, b) => a.gameweekSeq - b.gameweekSeq);
  const n = weeks.length;
  if (n === 0) return null;
  const seqs = weeks.map((w) => w.gameweekSeq);
  const hitOf = new Map(weeks.map((w) => [w.gameweekSeq, w.transferHit]));
  // The API's gain is already net of the points hit, and the screens take the hit off the gross
  // gain themselves: it goes back on here, so the net on screen is the API's own `seasonGain`.
  const transfers: TransferWeek[] = career.transfers.byGameweek.map((g) => {
    const hit = hitOf.get(g.gameweekSeq) ?? 0;
    return [g.gameweekSeq, g.gain + hit, hit, g.transfers];
  });
  const pair = (t: CareerMember["transfers"]["best"]) =>
    t ? { from: t.playerOut, to: t.playerIn } : null;
  const fromLeague = leagueSeason(league);
  const raw: SeasonRaw = {
    you: weeks.map((w) => w.score),
    rival: missing(n),
    leagueAvg: byWeek(league, seqs, league?.leagueAvg),
    leagueBest: byWeek(league, seqs, league?.leagueBest),
    youRank: byWeek(league, seqs, league?.youRank),
    rivalRank: missing(n),
    gameweeks: seqs,
    captain: weeks.map((w) => w.captain?.points ?? 0),
    bestStarter: weeks.map((w) => orMissing(w.captain?.bestStarterPoints)),
    bestChoiceWeeks: career.captain.hits,
    captainWeeks: career.captain.weeksCounted,
    leaderTotal: fromLeague.leaderTotal,
    leagueCaptain: fromLeague.leagueCaptain,
    leagueNetTransfers: fromLeague.leagueNetTransfers,
    transfers,
    bestTransfer: pair(career.transfers.best),
    worstTransfer: pair(career.transfers.worst),
    rival_: NO_RIVAL_DECISIONS,
    ovrSeries: weeks.map((w) => w.ovr),
    ratings: byCode((code) => weeks.map((w) => w.stats[statKey[code]])),
    leagueRating: fromLeague.leagueRating,
    ratingRank: fromLeague.ratingRank,
    rivalRating: byCode(() => MISSING),
    rivalRatingRank: { ...byCode(() => MISSING), OVR: MISSING },
  };
  return makeSeasonView(raw, { leagueSize: league ? league.leagueSize : Number.NaN });
}

/** The face shown for a manager: the card's name, the initials from it, the club's short name. */
function person(
  card: DuelMember["me"]["card"],
  fallbackName: string,
  lang: "fr" | "ar",
): SeasonPeople["you"] {
  const name = card?.name.trim() || fallbackName;
  const club = card?.club ? card.club.shortName[lang] || card.club.shortName.fr || null : null;
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();
  return { name, initials: letters || "?", club };
}

/**
 * « Détail du duel » from the duel read, with the league's context (the rival's week-by-week and
 * season figures only when they show their history). Null when there is nothing to draw: no
 * journée played in common, or the opponent keeps their history to themselves
 * (`historyVisible: false`).
 */
export function duelToSeasonView(
  duel: DuelMember,
  lang: "fr" | "ar",
  names: { you: string; rival: string },
  league: LeagueSeries | null = null,
): SeasonView | null {
  const weeks: DuelWeek[] = [...duel.weeks].sort((a, b) => a.gameweekSeq - b.gameweekSeq);
  const n = weeks.length;
  if (n === 0 || !duel.opponent.historyVisible) return null;
  const last = weeks[n - 1]!;
  const seqs = weeks.map((w) => w.gameweekSeq);
  const shown = league?.rivalSeason ?? null;
  const mine = league?.youSeason ?? null;
  const rivalPenalty =
    shown && shown.grossTransfers !== null && shown.netTransfers !== null
      ? shown.grossTransfers - shown.netTransfers
      : MISSING;
  const raw: SeasonRaw = {
    you: weeks.map((w) => w.me.score),
    rival: weeks.map((w) => w.opponent.score),
    leagueAvg: byWeek(league, seqs, league?.leagueAvg),
    leagueBest: byWeek(league, seqs, league?.leagueBest),
    youRank: byWeek(league, seqs, league?.youRank),
    rivalRank: byWeek(league, seqs, league?.rivalRank),
    gameweeks: seqs,
    captain: byWeek(league, seqs, league?.youCaptainByWeek),
    bestStarter: missing(n),
    ...leagueSeason(league),
    transfers: [],
    transferTotals:
      mine && mine.grossTransfers !== null && mine.netTransfers !== null && mine.transfers !== null
        ? {
            gross: mine.grossTransfers,
            penalty: mine.grossTransfers - mine.netTransfers,
            count: mine.transfers,
          }
        : undefined,
    bestTransfer: null,
    worstTransfer: null,
    rival_: {
      ...NO_RIVAL_DECISIONS,
      captain: orMissing(shown?.captain),
      gross: orMissing(shown?.grossTransfers),
      // The net is the gross after the hit: what is left over is the penalty.
      penalty: rivalPenalty,
      transfers: orMissing(shown?.transfers),
      paidTransfers: Number.isFinite(rivalPenalty) ? rivalPenalty / TRANSFER_PENALTY : MISSING,
    },
    ovrSeries: weeks.map((w) => w.me.ovr),
    rivalOvr: last.opponent.ovr,
    ratings: byCode((code) => weeks.map((w) => w.me.stats[statKey[code]])),
    rivalRating: byCode((code) =>
      orMissing(last.opponent.stats[statKey[code]] ?? league?.rivalRating?.[code]),
    ),
    rivalRatingRank: {
      ...byCode((code) => orMissing(league?.rivalRatingRank?.[code])),
      OVR: orMissing(league?.rivalRatingRank?.OVR),
    },
  };
  return makeSeasonView(raw, {
    leagueSize: league ? league.leagueSize : Number.NaN,
    people: {
      you: person(duel.me.card, names.you, lang),
      rival: person(duel.opponent.card, names.rival, lang),
    },
  });
}
