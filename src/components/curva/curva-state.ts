/**
 * What Curva' home shows, decided in one place and with no React (plan section 4.1, the state
 * table, and the M3b sub-states of the approved onboarding plan).
 *
 * Two questions, both pure:
 *
 *   1. `homeState`: which screen is this? The Fantasy hub already answers who is looking
 *      (`fantasyHubLayout`: signed out, signed in with no team, owner), so this takes that answer
 *      and the card read, and says: loading, the guest's proposition, the no-team proposition,
 *      the error panel, "not available for this account", or a card.
 *   2. `cardView` and `roundBlock`: for a card, what "Cette journée" says, from the card's own
 *      data and the gameweek the Fantasy screens already read. The browser never computes a
 *      rating and never invents a date: a line that needs a round it does not know falls back to
 *      the sentence that names the rating journées the server listed.
 *
 * Nothing here knows a tier threshold or a formula. A number is the server's, or it is a dash.
 */
import type { MyCardDto } from "@/backend/manager-card/contracts";
import type { FantasyHubAudience } from "@/components/fantasy/fantasy-hub-layout";
import { nextDeadlineAfter } from "@/components/fantasy/gameweek-presentation";
import type { FantasyScreenPhase } from "@/components/fpl/useFantasyScreen";
import { filledStats } from "@/components/manager-card/copy";
import { STAT_CODES, TIER_CODES, type TierCode } from "@/components/manager-card/types";
import type { Gameweek } from "@/types/domain";

/* ------------------------------------------------------------------------------------------ */
/* Which screen is this                                                                         */
/* ------------------------------------------------------------------------------------------ */

/** The card read, as the screens need it: not asked yet, asked, failed, or answered. */
export type CardRead =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; code: string | null }
  | { status: "success"; card: MyCardDto | null };

export interface HomeStateInput {
  audience: FantasyHubAudience;
  phase: FantasyScreenPhase;
  /** Registration is closed: no enrolment gameweek, or the Fantasy season is not open. */
  registrationClosed: boolean;
  read: CardRead;
}

export type HomeState =
  | { kind: "loading" }
  | { kind: "guest"; closed: boolean }
  | { kind: "no_team"; closed: boolean }
  /** The card read failed (`stepUp`: the one-time code is owed; the notice says so). */
  | { kind: "error"; stepUp: boolean; retry: "card" | "screen" }
  /** An owner whose read says there is no card: a deleted-pending profile. */
  | { kind: "unavailable" }
  | { kind: "card"; card: MyCardDto };

/** The phases in which a visitor cannot create a team, whatever the gameweek says. */
const CLOSED_PHASES: ReadonlySet<FantasyScreenPhase> = new Set([
  "season_closed",
  "awaiting_gameweek",
]);

export function registrationIsClosed(
  phase: FantasyScreenPhase,
  gameweek: Pick<Gameweek, "enrolment"> | null,
): boolean {
  if (CLOSED_PHASES.has(phase)) return true;
  return phase === "ready" && gameweek !== null && gameweek.enrolment === null;
}

export function homeState(input: HomeStateInput): HomeState {
  const { audience, phase, registrationClosed, read } = input;
  if (audience === "pending") return { kind: "loading" };
  if (audience === "signed_out") return { kind: "guest", closed: registrationClosed };

  // Signed in. The card read is the truth about the card; the Fantasy screen only says whether
  // there is a team to ask about.
  if (read.status === "success") {
    if (read.card) return { kind: "card", card: read.card };
    return audience === "owner"
      ? { kind: "unavailable" }
      : { kind: "no_team", closed: registrationClosed };
  }
  if (read.status === "error") {
    return { kind: "error", stepUp: read.code === "mfa_required", retry: "card" };
  }
  if (audience === "no_team") return { kind: "no_team", closed: registrationClosed };
  if (audience === "signed_in") {
    if (phase === "error") return { kind: "error", stepUp: false, retry: "screen" };
    if (phase === "season_closed" || phase === "awaiting_gameweek") {
      return { kind: "no_team", closed: true };
    }
  }
  return { kind: "loading" };
}

/* ------------------------------------------------------------------------------------------ */
/* What kind of card                                                                            */
/* ------------------------------------------------------------------------------------------ */

export type CardPhase = "forming" | "insufficient" | "provisional" | "rated";

export interface CardView {
  phase: CardPhase;
  /** The card carries the founder mark. */
  founder: boolean;
  /** The season is over (the card shows its final values). */
  seasonClosed: boolean;
  /**
   * A new season with no number of its own yet: the card shows last season's number and tier,
   * labelled with that season (plan D7).
   */
  newSeason: boolean;
  /** The number the card shows: this season's, or last season's in a new season; null: a dash. */
  ovr: number | null;
  tier: TierCode | null;
  /** The season label the shown number belongs to. */
  numberSeason: string;
  /** How many of the four statistics this season's card has filled (the server's values). */
  statsFilled: number;
}

/** How many of the card's four statistics are filled: what an `insufficient` card is short of. */
export function cardStatsFilled(card: Pick<MyCardDto, "stats">): number {
  return filledStats(STAT_CODES.map((code) => card.stats[code].value));
}

export function cardView(card: MyCardDto): CardView {
  const newSeason = card.ratingState === "forming" && card.previousSeason !== null;
  return {
    phase: card.ratingState,
    founder: card.founder !== null,
    seasonClosed: card.seasonClosed,
    newSeason,
    ovr: newSeason ? (card.previousSeason?.ovr ?? null) : card.ovr,
    tier: newSeason ? (card.previousSeason?.tier ?? null) : card.tier,
    numberSeason: newSeason ? (card.previousSeason?.label ?? card.season.label) : card.season.label,
    statsFilled: cardStatsFilled(card),
  };
}

/** Whether the number shown is a real number (never 0, never a guess). */
export function hasNumber(view: CardView): boolean {
  return view.ovr !== null;
}

/** Whether a tier is strictly above another, by the order of the five tiers. */
export function tierIsHigher(a: TierCode, b: TierCode): boolean {
  return TIER_CODES.indexOf(a) > TIER_CODES.indexOf(b);
}

/** The card fell below the best tier it held this season (the G2 line, never a moment). */
export function tierFell(card: MyCardDto): boolean {
  return card.tier !== null && card.bestTier !== null && tierIsHigher(card.bestTier, card.tier);
}

/* ------------------------------------------------------------------------------------------ */
/* « Cette journée »                                                                            */
/* ------------------------------------------------------------------------------------------ */

/** The round the manager can still act on: the open one, else the staged next one. */
export interface NextRound {
  number: number;
  deadline: string;
}

export interface RoundContext {
  gameweek: Pick<Gameweek, "number" | "deadline" | "status" | "enrolment"> | null;
  now: number;
}

/**
 * The next deadline in the future, from the gameweek the Fantasy screens read: this gameweek's
 * while it lies ahead, else the staged next one (`nextDeadlineAfter`), else nothing.
 */
export function nextRound(ctx: RoundContext): NextRound | null {
  const gw = ctx.gameweek;
  if (!gw) return null;
  const own = Date.parse(gw.deadline);
  if (Number.isFinite(own) && own > ctx.now) return { number: gw.number, deadline: gw.deadline };
  return nextDeadlineAfter(gw, ctx.now);
}

/** What a forming card's block says under its counter. */
export type FormingLine =
  /** Nothing has been counted yet: « Première journée comptée : J5. » */
  | { kind: "first_counted"; gw: number }
  /** « Note après 3 journées terminées · prochaine : J6 · date limite sam. 16:30 » */
  | { kind: "next"; gw: number; deadline: string }
  /** The last needed journée is locked or live: « Dernière journée avant votre note : J7. » */
  | { kind: "eve"; gw: number }
  /** That journée's matches are done and it is not final: « J7 terminée, pas encore définitive. » */
  | { kind: "over"; gw: number }
  /**
   * The minimum is reached and too few statistics are filled for a number: the block counts the
   * statistics (« 2/4 »), never the full journée counter.
   */
  | { kind: "insufficient"; statsFilled: number }
  /** The season ended before the first note: it comes next season. */
  | { kind: "late"; nextSeason: string | null }
  /** No round is known: the journées the server listed (`gws`), or the first of them. */
  | { kind: "listed"; gws: number[]; from: number | null };

export type RoundBlock =
  /** Season closed with a number: « Saison 2026/27 terminée : 86, CHAMPION. » */
  | { kind: "closed"; season: string; ovr: number; tier: TierCode | null }
  /** A new season, no number yet: last season's number stays, the new counter starts. */
  | { kind: "started"; season: string; previous: string; counted: number; min: number }
  | { kind: "forming"; counted: number; min: number; season: string; line: FormingLine }
  /** Rated: « J8 · date limite sam. 16:30 », and when the note is recalculated. */
  | { kind: "rated"; round: NextRound | null };

/** « 2026/27 » to « 2027/28 »; null for a label that is not that shape. */
export function nextSeasonLabel(label: string): string | null {
  const match = /^(\d{4})\/(\d{2})$/.exec(label.trim());
  if (!match) return null;
  const start = Number(match[1]) + 1;
  const end = (Number(match[2]) + 1) % 100;
  return `${start}/${String(end).padStart(2, "0")}`;
}

/** The rating journées the server listed, only when it listed them all (or at least one). */
function listedRounds(card: MyCardDto): number[] {
  return (card.ratingGameweeks ?? []).filter((n) => Number.isInteger(n));
}

function formingLine(card: MyCardDto, ctx: RoundContext): FormingLine {
  const counted = card.gameweeksCounted;
  const min = card.minRated;
  // A season that is over keeps no forming display: it says so (« elle viendra en 2027/28 »).
  if (card.seasonClosed) return { kind: "late", nextSeason: nextSeasonLabel(card.season.label) };
  if (card.ratingState === "insufficient") {
    return { kind: "insufficient", statsFilled: cardStatsFilled(card) };
  }

  const listed = listedRounds(card);
  if (counted === 0 && listed.length > 0) return { kind: "first_counted", gw: listed[0]! };

  // The last journée the rating waits for: its state says "eve" or "over".
  const gw = ctx.gameweek;
  const last = counted === min - 1 ? (listed[counted] ?? null) : null;
  if (gw && last !== null && gw.number === last) {
    if (gw.status === "provisional" || gw.status === "finalizing")
      return { kind: "over", gw: last };
    const pastDeadline =
      Number.isFinite(Date.parse(gw.deadline)) && Date.parse(gw.deadline) <= ctx.now;
    if (gw.status === "locked" || gw.status === "live" || (gw.status === "open" && pastDeadline)) {
      return { kind: "eve", gw: last };
    }
  }

  const next = nextRound(ctx);
  if (next) return { kind: "next", gw: next.number, deadline: next.deadline };
  return { kind: "listed", gws: listed, from: listed[0] ?? card.firstCountedGameweekSeq };
}

/**
 * A forming card whose season is over has nothing left to form: its screens drop the counter and
 * the « Carte en formation » label and say what happened (the late signer's sentence), keeping
 * « 1/3 · 2026/27 » as a quiet secondary line.
 */
export function isOverForming(block: RoundBlock): boolean {
  return block.kind === "forming" && block.line.kind === "late";
}

/** The block under the stage: what this journée means for the card. */
export function roundBlock(card: MyCardDto, ctx: RoundContext): RoundBlock {
  const view = cardView(card);
  if (card.seasonClosed && view.ovr !== null && !view.newSeason) {
    return { kind: "closed", season: card.season.label, ovr: view.ovr, tier: view.tier };
  }
  if (view.newSeason) {
    return {
      kind: "started",
      season: card.season.label,
      previous: card.previousSeason?.label ?? "",
      counted: card.gameweeksCounted,
      min: card.minRated,
    };
  }
  if (card.ratingState === "forming" || card.ratingState === "insufficient") {
    return {
      kind: "forming",
      counted: card.gameweeksCounted,
      min: card.minRated,
      season: card.season.label,
      line: formingLine(card, ctx),
    };
  }
  return { kind: "rated", round: nextRound(ctx) };
}

/**
 * The one-line round summary under the identity line (WP6b, plan 5.2 item 6): the next round and
 * its deadline, from the same read as « Cette journée », while there is still something to play
 * (the same cases in which that block offers « Composer l'équipe »). Null when the season is over
 * or no round is known: the line is then not shown.
 */
export function roundGlance(block: RoundBlock, ctx: RoundContext): NextRound | null {
  if (block.kind === "closed") return null;
  if (block.kind === "forming" && block.line.kind === "late") return null;
  return block.kind === "rated" ? block.round : nextRound(ctx);
}

/** The identity line's journée: « Depuis la J5 », when the server knows the first counted journée. */
export function sinceRound(card: MyCardDto): number | null {
  return card.firstCountedGameweekSeq;
}
