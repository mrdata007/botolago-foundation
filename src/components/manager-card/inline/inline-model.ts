import type { MemberCardDto, MyCardDto } from "@/backend/manager-card/contracts";
import type { FantasyGameweekStatus } from "@/types/domain";

import { guestProfile, localProfile } from "../to-profile";
import type { CardClub, CardProfile, TierCode } from "../types";

/**
 * What the Fantasy screens say about the card, as pure decisions (plan sections 4.1, 5.1 and the
 * approved onboarding plan M3). Nothing here scores, ranks or invents anything: every function
 * reads what the server sent and says which of the approved sentences is true. A value the
 * server did not send is `null`, and the screen shows nothing for it rather than a guess.
 *
 * The hub block, the rankings token, the recap line, the hints and the league band all ask this
 * file; the components only draw the answer.
 */

/** The Fantasy round a screen already holds (the hub's and the team page's current gameweek). */
export interface RoundRef {
  number: number;
  /** ISO. */
  deadline: string;
  status?: FantasyGameweekStatus;
}

/* ------------------------------------------------------------------------------------------ */
/* The save step (M1b)                                                                         */
/* ------------------------------------------------------------------------------------------ */

/**
 * What the object on the save step draws (plan M1b):
 *   - a visitor: the base scarf with no name, no club, no serial and no number. The name the
 *     card will carry is chosen at sign-up, so the team name here would be wrong after saving;
 *   - a signed-in account without a team: the card name (the display name when it is not
 *     blank, else the team name, as the board reads it) and the club the profile names, if one
 *     resolves. A club that does not resolve leaves the object in its own material.
 */
export function saveLineProfile(input: {
  signedIn: boolean;
  displayName: string | null | undefined;
  teamName: string;
  club: CardClub | null;
}): CardProfile {
  if (!input.signedIn) return guestProfile();
  return localProfile({
    displayName: input.displayName?.trim() || input.teamName.trim(),
    club: input.club,
  });
}

/* ------------------------------------------------------------------------------------------ */
/* The hub block (M3a, M3b)                                                                    */
/* ------------------------------------------------------------------------------------------ */

export type HubCardHead =
  /** No number yet: « 1/3 ». */
  | { kind: "counter"; k: number; n: number }
  /** A number: « 84 OVR », its tier and whether it is still provisional. */
  | { kind: "number"; ovr: number; tier: TierCode | null; provisional: boolean };

export type HubCardLine =
  /** The next round and its deadline (forming: `m3.line`; rated: `gradins.round.line`). */
  | { kind: "next"; gameweek: number; deadline: string }
  /** `m3.first_counted`. */
  | { kind: "first_counted"; gameweek: number }
  /** `m3.eve`. */
  | { kind: "eve"; gameweek: number }
  /** `m3.over`. */
  | { kind: "over"; gameweek: number }
  /** `m3.insufficient`. */
  | { kind: "insufficient" }
  /** `m3.late`: the season ended before the first number. */
  | { kind: "late"; season: string }
  /** `m10.closed`: the season ended with a number. */
  | { kind: "closed"; season: string; ovr: number; tier: TierCode }
  | { kind: "none" };

export interface HubCardModel {
  head: HubCardHead;
  line: HubCardLine;
  /** A moment is waiting to be seen on Gradins: the block carries « Nouveau ». */
  fresh: boolean;
}

/**
 * « 2026/27 » to « 2027/28 ». Null when the label is not in that shape: the next season's name
 * is then not known, and the line that needs it is not shown.
 */
export function nextSeasonLabel(label: string): string | null {
  const match = /^(\d{4})\/(\d{2})$/.exec(label.trim());
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  // A season label is its start year and the next year's last two digits: « 2026/27 ».
  if (end !== (start + 1) % 100) return null;
  return `${start + 1}/${String((end + 1) % 100).padStart(2, "0")}`;
}

/** Whether the server lists this journée among the ones that count for the card's first number. */
function countsForRating(card: MyCardDto, gameweek: number): boolean {
  return card.ratingGameweeks !== null && card.ratingGameweeks.includes(gameweek);
}

function upcoming(round: RoundRef | null, nowMs: number): round is RoundRef {
  return round !== null && Date.parse(round.deadline) > nowMs;
}

/**
 * The hub block's head and line. The sub-states of the approved plan (M3b) are chosen by what
 * the server says about the card and by the round the hub already shows:
 *
 *   - eve: one journée short, and the round now locked or live is one of the counted ones;
 *   - over, not final: the round is played but still provisional or finalizing;
 *   - minimum reached with no number (`insufficient`);
 *   - late signer: the season closed before a first number.
 *
 * A round the server does not list as counted never produces « Dernière journée avant votre
 * note » or « pas encore définitive »: the screen cannot tell whether it counts, so it says the
 * plain next-round line instead.
 */
export function hubCardModel(
  card: MyCardDto,
  round: RoundRef | null,
  nowMs: number = Date.now(),
): HubCardModel {
  const fresh = card.moments.length > 0;
  const rated = card.ovr !== null;
  const head: HubCardHead = rated
    ? { kind: "number", ovr: card.ovr!, tier: card.tier, provisional: card.provisional }
    : { kind: "counter", k: card.gameweeksCounted, n: card.minRated };

  if (card.seasonClosed) {
    if (rated && card.tier) {
      return {
        head,
        line: { kind: "closed", season: card.season.label, ovr: card.ovr!, tier: card.tier },
        fresh,
      };
    }
    const season = nextSeasonLabel(card.season.label);
    return { head, line: season ? { kind: "late", season } : { kind: "none" }, fresh };
  }

  const next: HubCardLine = upcoming(round, nowMs)
    ? { kind: "next", gameweek: round.number, deadline: round.deadline }
    : { kind: "none" };
  if (rated) return { head, line: next, fresh };

  if (card.ratingState === "insufficient") return { head, line: { kind: "insufficient" }, fresh };

  if (card.gameweeksCounted === 0 && card.firstCountedGameweekSeq !== null) {
    return {
      head,
      line: { kind: "first_counted", gameweek: card.firstCountedGameweekSeq },
      fresh,
    };
  }

  const throughSeq = card.throughGameweekSeq ?? 0;
  if (round && round.number > throughSeq && countsForRating(card, round.number)) {
    if (
      card.gameweeksCounted === card.minRated - 1 &&
      (round.status === "locked" || round.status === "live")
    ) {
      return { head, line: { kind: "eve", gameweek: round.number }, fresh };
    }
    if (round.status === "provisional" || round.status === "finalizing") {
      return { head, line: { kind: "over", gameweek: round.number }, fresh };
    }
  }
  return { head, line: next, fresh };
}

/* ------------------------------------------------------------------------------------------ */
/* The rankings token (M3c)                                                                    */
/* ------------------------------------------------------------------------------------------ */

/** « 1/3 » while forming, « 84 » (with OVR beside it) once there is a number. */
export function rankTokenFigure(card: MyCardDto): HubCardHead {
  return card.ovr !== null
    ? { kind: "number", ovr: card.ovr, tier: card.tier, provisional: card.provisional }
    : { kind: "counter", k: card.gameweeksCounted, n: card.minRated };
}

/* ------------------------------------------------------------------------------------------ */
/* The recap line (M3d)                                                                        */
/* ------------------------------------------------------------------------------------------ */

/**
 * « Journée comptée pour votre carte : 2/3 »: k is this round's place among the counted ones.
 * Only while the card has no number, and only for a round the server lists as counted and has
 * evaluated. Null for any other round: the line is then not shown.
 */
export function recapCounted(
  card: MyCardDto,
  recapGameweek: number,
): { k: number; n: number } | null {
  if (card.ovr !== null || card.seasonClosed) return null;
  const through = card.throughGameweekSeq;
  const list = card.ratingGameweeks;
  if (through === null || list === null) return null;
  if (!list.includes(recapGameweek) || recapGameweek > through) return null;
  const k = list.filter((gameweek) => gameweek <= recapGameweek).length;
  return k >= 1 ? { k, n: card.minRated } : null;
}

/* ------------------------------------------------------------------------------------------ */
/* The born panel (M2)                                                                         */
/* ------------------------------------------------------------------------------------------ */

/**
 * The next Fantasy deadline the born panel is given: the page's round while its deadline is
 * ahead, else null. The panel says whether its invite line is true (it names the first counted
 * round from the card itself).
 */
export function nextDeadline(round: RoundRef | null, nowMs: number = Date.now()): string | null {
  return round && Date.parse(round.deadline) > nowMs ? round.deadline : null;
}

/* ------------------------------------------------------------------------------------------ */
/* The three hints (M3e) and the first-transfer line (M3f)                                     */
/* ------------------------------------------------------------------------------------------ */

/** A hint teaches a decision that feeds a statistic, so it needs a card with no number yet. */
export function hintEligible(card: MyCardDto | null | undefined): card is MyCardDto {
  return !!card && card.ovr === null;
}

/** M3f: the transfer confirmation says TRF will measure this transfer while TRF has no transfer. */
export function firstTransferEligible(card: MyCardDto | null | undefined): card is MyCardDto {
  return !!card && card.stats.trf.nullReason === "no_transfers";
}

/* ------------------------------------------------------------------------------------------ */
/* The league band (M5a)                                                                       */
/* ------------------------------------------------------------------------------------------ */

/**
 * The members whose first number landed in the latest evaluated journée, in the league's own
 * order and without the reader. Empty when the latest journée is not known.
 */
export function newlyRated(
  cards: readonly MemberCardDto[],
  latestEvaluatedGameweek: number | null,
  ownTeamId: string | null,
): MemberCardDto[] {
  if (latestEvaluatedGameweek === null) return [];
  return cards.filter(
    (card) =>
      card.teamId !== ownTeamId &&
      card.firstRatedGameweekSeq !== null &&
      card.firstRatedGameweekSeq === latestEvaluatedGameweek,
  );
}
