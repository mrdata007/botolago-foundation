import type { CareerMember, DuelMember, DuelWeek } from "@/backend/premium/card-reads";

import { makeSeasonView, type SeasonPeople, type SeasonView } from "./plus-season-context";
import { MISSING, type RatingCode, type SeasonRaw, type TransferWeek } from "./plus-season-data";

/**
 * Maps a member's paid reads (`get_my_card_career`, `get_card_duel`) into the shape the season
 * screens draw (`SeasonRaw`). This is the one place that knows both sides.
 *
 * What the backend does not serve yet is `MISSING` here (`NaN`), and the screens write it « — »:
 *
 *   - the league's average and best score per journée, the rank after each journée, the league's
 *     size, the league's captain and net-transfer averages, the per-rating league average and rank;
 *   - on the duel's rival side: captain, best starters, transfers and penalties (only the
 *     per-journée scores and the card's four ratings come with the read).
 *
 * TODO(lane L): when those figures are served, fill them in the marked places below and nothing
 * else changes: every derived figure and chart picks them up.
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

/** The seven sides of a duel's decisions that only the league's data can fill. */
const NO_RIVAL_DECISIONS: SeasonRaw["rival_"] = {
  captain: MISSING,
  bestStarters: MISSING,
  gross: MISSING,
  penalty: MISSING,
  transfers: MISSING,
  paidTransfers: MISSING,
  captainBest: MISSING,
};

/** « Votre saison » from the career read. Null when no journée has been played yet. */
export function careerToSeasonView(career: CareerMember): SeasonView | null {
  const weeks = [...career.weeks].sort((a, b) => a.gameweekSeq - b.gameweekSeq);
  const n = weeks.length;
  if (n === 0) return null;
  const hitOf = new Map(weeks.map((w) => [w.gameweekSeq, w.transferHit]));
  const transfers: TransferWeek[] = career.transfers.byGameweek.map((g) => [
    g.gameweekSeq,
    g.gain,
    hitOf.get(g.gameweekSeq) ?? 0,
    g.transfers,
  ]);
  const pair = (t: CareerMember["transfers"]["best"]) =>
    t ? { from: t.playerOut, to: t.playerIn } : null;
  const raw: SeasonRaw = {
    you: weeks.map((w) => w.score),
    rival: missing(n),
    // TODO(lane L): league average and best score per journée, rank after each journée.
    leagueAvg: missing(n),
    leagueBest: missing(n),
    youRank: missing(n),
    rivalRank: missing(n),
    captain: weeks.map((w) => w.captain?.points ?? 0),
    bestStarter: weeks.map((w) => orMissing(w.captain?.bestStarterPoints)),
    bestChoiceWeeks: career.captain.hits,
    // TODO(lane L): the league's captain total, net transfers and the leader's total.
    leaderTotal: MISSING,
    leagueCaptain: MISSING,
    leagueNetTransfers: MISSING,
    transfers,
    bestTransfer: pair(career.transfers.best),
    worstTransfer: pair(career.transfers.worst),
    rival_: NO_RIVAL_DECISIONS,
    ovrSeries: weeks.map((w) => w.ovr),
    ratings: byCode((code) => weeks.map((w) => w.stats[statKey[code]])),
    // TODO(lane L): the league's average per rating and the reader's rank in each.
    leagueRating: byCode(() => MISSING),
    ratingRank: { ...byCode(() => MISSING), OVR: MISSING },
    rivalRating: byCode(() => MISSING),
    rivalRatingRank: { ...byCode(() => MISSING), OVR: MISSING },
  };
  return makeSeasonView(raw);
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
 * « Détail du duel » from the duel read. Null when there is nothing to draw: no journée played in
 * common, or the opponent keeps their history to themselves (`historyVisible: false`).
 */
export function duelToSeasonView(
  duel: DuelMember,
  lang: "fr" | "ar",
  names: { you: string; rival: string },
): SeasonView | null {
  const weeks: DuelWeek[] = [...duel.weeks].sort((a, b) => a.gameweekSeq - b.gameweekSeq);
  const n = weeks.length;
  if (n === 0 || !duel.opponent.historyVisible) return null;
  const last = weeks[n - 1]!;
  const raw: SeasonRaw = {
    you: weeks.map((w) => w.me.score),
    rival: weeks.map((w) => w.opponent.score),
    leagueAvg: missing(n),
    leagueBest: missing(n),
    youRank: missing(n),
    rivalRank: missing(n),
    captain: missing(n),
    bestStarter: missing(n),
    leaderTotal: MISSING,
    leagueCaptain: MISSING,
    leagueNetTransfers: MISSING,
    transfers: [],
    bestTransfer: null,
    worstTransfer: null,
    // TODO(lane L): the rival's captain, starters and transfers (`NO_RIVAL_DECISIONS`).
    rival_: NO_RIVAL_DECISIONS,
    ovrSeries: weeks.map((w) => w.me.ovr),
    rivalOvr: last.opponent.ovr,
    ratings: byCode((code) => weeks.map((w) => w.me.stats[statKey[code]])),
    leagueRating: byCode(() => MISSING),
    ratingRank: { ...byCode(() => MISSING), OVR: MISSING },
    rivalRating: byCode((code) => orMissing(last.opponent.stats[statKey[code]])),
    rivalRatingRank: { ...byCode(() => MISSING), OVR: MISSING },
  };
  return makeSeasonView(raw, {
    people: {
      you: person(duel.me.card, names.you, lang),
      rival: person(duel.opponent.card, names.rival, lang),
    },
  });
}
