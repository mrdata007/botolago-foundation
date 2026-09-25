import type { TranslationKey } from "@/i18n/dictionaries";
import { isKickoffTimeUnconfirmed, matchDayKey } from "@/lib/match-kickoff";
import { matchRefetchInterval } from "@/lib/match-refresh";
import type { Match } from "@/types/domain";

/**
 * What the match page's panels say when they have nothing to show (audit A07).
 *
 * Each panel used to have one empty message whatever state the match was in,
 * so a finished 1–3 match said its statistics "will be available at
 * kick-off". An empty panel only means the page holds no data for it, and
 * what that means depends on the match. Before kick-off it is expected, and
 * the copy says why — the match has not started — without saying the data
 * will come then: the provider sometimes sends none at all (audit A02), so
 * "available at kick-off" was a promise too.
 * While the page is still refetching the match (`matchRefetchInterval`:
 * every 30 seconds in play, every minute from kick-off until the status
 * moves), the data may still come in, and the copy says the page updates
 * itself. After the final whistle, for a match that was called off, or once
 * the page has stopped checking, nothing here can promise the data will ever
 * arrive, so the copy only says it is not available — never that it will be,
 * and never that the page will make up for what the provider did not send.
 */

/**
 * The match as its empty panels read it:
 *
 *   upcoming   — scheduled, kick-off still ahead; at the provider's
 *                placeholder hour, until the end of its day
 *   awaiting   — kick-off passed, not yet reported under way (a late start,
 *                or a feed behind): the page is still checking
 *   live       — in play
 *   finished   — played to the end
 *   unreported — kick-off long passed (at the placeholder hour, its day over)
 *                and still reported as scheduled: the page is not checking,
 *                and says nothing will come
 *   postponed  — postponed, or suspended to be resumed
 *   called_off — cancelled or abandoned: not going to be played as scheduled
 */
export type MatchDataPhase =
  | "upcoming"
  | "awaiting"
  | "live"
  | "finished"
  | "unreported"
  | "postponed"
  | "called_off";

/**
 * `asOf` is when the page read the match — the detail query's
 * `dataUpdatedAt` — not the clock at render. The server and the browser's
 * first render seed the query with the same time (see the match route's
 * loader), so both say the same thing, and each refetch moves it on. A
 * refetch inside the checking window schedules the next, so the last read
 * lands past the window and the copy stops saying the page updates itself
 * when the page stops.
 */
export function matchDataPhase(
  match: Pick<Match, "status" | "calledOff" | "kickoff">,
  asOf: number,
): MatchDataPhase {
  switch (match.status) {
    case "live":
      return "live";
    case "finished":
      return "finished";
    case "postponed":
      return match.calledOff ? "called_off" : "postponed";
    case "scheduled": {
      const kickoff = Date.parse(match.kickoff);
      if (Number.isNaN(kickoff) || asOf < kickoff) return "upcoming";
      // A kick-off still at the provider's placeholder hour (midnight UTC,
      // 01:00 in Casablanca) names the day, not the hour. The page does not
      // watch it (`matchRefetchInterval`), so once that hour had passed, the
      // match was "unreported", its data not available, from 01:00 on the
      // very day it is to be played. It is still to come until that day is
      // over.
      if (
        isKickoffTimeUnconfirmed(match) &&
        matchDayKey(new Date(asOf)) <= matchDayKey(new Date(kickoff))
      ) {
        return "upcoming";
      }
      return matchRefetchInterval(match, asOf) === false ? "unreported" : "awaiting";
    }
  }
}

type Translate = (key: TranslationKey) => string;

// Literal-key switches below rather than a lookup table, so the i18n gate
// sees every key. Each panel has four things to say: that the match has not
// started (before kick-off), that nothing has come yet and the page is
// checking, that it is not available, and why there is none (postponed,
// called off).

/** The Stats tab with no statistics. */
export function noStatsMessage(phase: MatchDataPhase, t: Translate): string {
  switch (phase) {
    case "upcoming":
      return t("matches.detail.no_stats");
    case "awaiting":
    case "live":
      return t("matches.detail.no_stats_updating");
    case "finished":
    case "unreported":
      return t("matches.detail.no_stats_unavailable");
    case "postponed":
      return t("matches.detail.no_data_postponed");
    case "called_off":
      return t("matches.detail.no_data_called_off");
  }
}

/** The Résumé tab with no key events. */
export function noEventsMessage(phase: MatchDataPhase, t: Translate): string {
  switch (phase) {
    case "upcoming":
      return t("matches.detail.no_events");
    case "awaiting":
    case "live":
      return t("matches.detail.no_events_updating");
    case "finished":
    case "unreported":
      return t("matches.detail.no_events_unavailable");
    case "postponed":
      return t("matches.detail.no_data_postponed");
    case "called_off":
      return t("matches.detail.no_data_called_off");
  }
}

/** The Compos tab with no lineup for either side. */
export function noLineupsMessage(phase: MatchDataPhase, t: Translate): string {
  switch (phase) {
    case "upcoming":
      return t("matches.detail.no_lineups");
    case "awaiting":
    case "live":
      return t("matches.detail.no_lineups_updating");
    case "finished":
    case "unreported":
      return t("matches.detail.no_lineups_unavailable");
    case "postponed":
      return t("matches.detail.no_data_postponed");
    case "called_off":
      return t("matches.detail.no_data_called_off");
  }
}
