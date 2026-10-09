import type { HistoryRowDto, MomentDto, MyCardDto } from "@/backend/manager-card/contracts";
import { TIER_CODES, type HeroSpec, type LineSpec, type ReplayItem, type TierCode } from "../types";

/**
 * Picking the one hero (plan sections 5.3 and 7.6). Pure: what is pending, what the card says,
 * and the state of the session go in; the one hero, the one-line states and the keys to
 * acknowledge on display come out. Nothing here reads storage, the clock or the DOM, so every rule
 * is tested as a table.
 *
 * The rules, in the order they are applied:
 *
 *  1. Launch gate. Until the splash is over, the dictionary hydrated and the language chosen,
 *     nothing expands and no view is counted (`launchGateOpen`).
 *  2. One hero per session. A hero or the born panel was already shown in this session, on any
 *     surface: no hero (`heroShownThisSession`). The lines still show: they are not heroes.
 *  3. Nothing while the import prompt or the step-up notice is on screen (`blocked`).
 *  4. Priority: the born panel (`card_created`, no number yet) > the first rating (fresh,
 *     arrival, coalesced) > the founder mark > a new tier > the closed season. The new season and
 *     the cleared provisional label are lines, never heroes.
 *  5. Deadline first. Within 60 minutes before a Fantasy deadline the heroes stay collapsed (the
 *     number still shows on every surface); the born panel is exempt, it is the save's own
 *     continuation.
 *  6. The team page shows only the born panel: every other hero plays in Gradins (plan 5.2).
 */

/** Within this many minutes before a deadline, a hero (not the born panel) stays collapsed. */
export const DEADLINE_WINDOW_MINUTES = 60;

export interface PickHeroContext {
  /** The screen asking: the team page shows only the born panel, Gradins shows the rest. */
  surface: "gradins" | "team";
  card: MyCardDto;
  /** Minutes to the next Fantasy deadline, or null when it is not known. Negative once passed. */
  minutesToDeadline: number | null;
  /** A hero or the born panel was already shown in this session. */
  heroShownThisSession: boolean;
  /** The splash is over, hydration is done and the language is chosen. */
  launchGateOpen: boolean;
  /** The latest journée the server has evaluated (`card.throughGameweekSeq`). */
  latestEvaluatedGameweekSeq: number | null;
  /** The import prompt or the step-up notice is on screen: no hero now. */
  blocked?: boolean;
}

export interface PickedMoments {
  hero: HeroSpec | null;
  lines: LineSpec[];
  /** The keys of `lines` that are acknowledged the moment the line is displayed. */
  ackOnDisplay: string[];
}

const NOTHING: PickedMoments = { hero: null, lines: [], ackOnDisplay: [] };

const tierRank = (tier: TierCode): number => TIER_CODES.indexOf(tier);

function ofKind<K extends MomentDto["kind"]>(
  moments: readonly MomentDto[],
  kind: K,
): Extract<MomentDto, { kind: K }>[] {
  return moments.filter(
    (moment): moment is Extract<MomentDto, { kind: K }> => moment.kind === kind,
  );
}

/** Whether the next deadline is close enough that a hero must wait (plan 5.3, "Deadline first"). */
export function withinDeadlineWindow(minutesToDeadline: number | null): boolean {
  return (
    minutesToDeadline !== null &&
    minutesToDeadline >= 0 &&
    minutesToDeadline <= DEADLINE_WINDOW_MINUTES
  );
}

/** The born panel's kind for a card with no number yet, or null when the card is rated. */
function bornKind(card: MyCardDto): "born_new" | "born_arrival" | null {
  if (card.ovr !== null) return null;
  return card.gameweeksCounted === 0 ? "born_new" : "born_arrival";
}

function heroFor(moments: readonly MomentDto[], ctx: PickHeroContext): HeroSpec | null {
  const { card } = ctx;
  const created = ofKind(moments, "card_created")[0];
  const first = ofKind(moments, "first_rating")[0];
  const cleared = ofKind(moments, "provisional_cleared")[0];
  const founder = ofKind(moments, "founder_granted")[0];
  const tiers = ofKind(moments, "tier_changed");
  const closed = ofKind(moments, "season_closed")[0];

  // 1. The card was just made. No number yet: the born panel (new, or arrival while forming).
  //    Already a number: the first-rating hero in its arrival form, folding in what is pending.
  if (created) {
    const kind = bornKind(card);
    if (kind) {
      return {
        kind,
        keys: [created.key],
        beat: "make",
        gameweekSeq: null,
        tier: null,
        first: null,
      };
    }
    if (ctx.surface === "team") return null;
    return {
      kind: "first_arrival",
      keys: [created.key, ...(first ? [first.key] : []), ...(cleared ? [cleared.key] : [])],
      beat: "make",
      gameweekSeq: first?.gameweekSeq ?? ctx.latestEvaluatedGameweekSeq,
      tier: card.tier,
      first: null,
    };
  }

  // Past this point only Gradins shows a hero.
  if (ctx.surface === "team") return null;

  // 2. The first rating. Fresh when it is the latest evaluated journée; coalesced (a returning
  //    manager) when later journées have been evaluated since, folding in the cleared label.
  if (first && card.ovr !== null) {
    const latest = ctx.latestEvaluatedGameweekSeq;
    const fresh = latest === null || first.gameweekSeq >= latest;
    if (fresh) {
      return {
        kind: "first_fresh",
        keys: [first.key],
        beat: "first",
        gameweekSeq: first.gameweekSeq,
        tier: card.tier ?? first.tier,
        first: null,
      };
    }
    return {
      kind: "first_coalesced",
      keys: [first.key, ...(cleared ? [cleared.key] : [])],
      beat: null,
      gameweekSeq: latest,
      tier: card.tier,
      first: { ovr: first.ovr, gameweekSeq: first.gameweekSeq },
    };
  }

  // 3. The founder mark, once it is on the card.
  if (founder && card.founder) {
    return {
      kind: "founder",
      keys: [founder.key],
      beat: "founder",
      gameweekSeq: null,
      tier: card.tier,
      first: null,
    };
  }

  // 4. A tier above any this account has held. A jump over a tier folds the lower keys in: one
  //    hero for the highest, every key acknowledged in one call.
  if (tiers.length > 0 && card.ovr !== null) {
    const highest = tiers.reduce((best, moment) =>
      tierRank(moment.tier) > tierRank(best.tier) ? moment : best,
    );
    return {
      kind: "tier_up",
      keys: tiers.map((moment) => moment.key),
      beat: highest.tier === "legend" ? "legend" : "tier",
      gameweekSeq: highest.gameweekSeq,
      tier: highest.tier,
      first: null,
    };
  }

  // 5. The season that just closed.
  if (closed) {
    return {
      kind: "season_closed",
      keys: [closed.key],
      beat: "castoff",
      gameweekSeq: null,
      tier: closed.tier,
      first: null,
    };
  }
  return null;
}

/**
 * The one-line states that need no moment: a new season keeps its line for as long as the card
 * shows last season's number, and a tier below the season's best says so (on the card page).
 * They carry no keys.
 */
export function stateLines(card: MyCardDto): LineSpec[] {
  const lines: LineSpec[] = [];
  if (card.ratingState === "forming" && card.previousSeason) {
    lines.push({ kind: "season_started", keys: [] });
  }
  if (
    card.ovr !== null &&
    card.tier &&
    card.bestTier &&
    tierRank(card.tier) < tierRank(card.bestTier)
  ) {
    lines.push({ kind: "tier_down", keys: [] });
  }
  return lines;
}

/**
 * The lines of a card: the cleared label and the new season carry their moment's key and are
 * acknowledged on display; the state lines carry none. A key a hero already folds in is not
 * repeated.
 */
function linesFor(
  moments: readonly MomentDto[],
  card: MyCardDto,
  folded: ReadonlySet<string>,
): LineSpec[] {
  const lines: LineSpec[] = [];
  const cleared = ofKind(moments, "provisional_cleared")[0];
  if (cleared && !folded.has(cleared.key)) {
    lines.push({ kind: "provisional_cleared", keys: [cleared.key] });
  }
  const states = stateLines(card);
  const started = ofKind(moments, "season_started")[0];
  if (started) {
    lines.push({ kind: "season_started", keys: [started.key] });
  } else {
    const state = states.find((line) => line.kind === "season_started");
    if (state) lines.push(state);
  }
  const down = states.find((line) => line.kind === "tier_down");
  if (down) lines.push(down);
  return lines;
}

export function pickHero(moments: readonly MomentDto[], ctx: PickHeroContext): PickedMoments {
  if (!ctx.launchGateOpen) return NOTHING;

  const held = ctx.heroShownThisSession || ctx.blocked === true;
  let hero = held ? null : heroFor(moments, ctx);
  // Heroes wait out the deadline window; the born panel does not.
  if (
    hero &&
    withinDeadlineWindow(ctx.minutesToDeadline) &&
    hero.kind !== "born_new" &&
    hero.kind !== "born_arrival"
  ) {
    hero = null;
  }

  if (ctx.surface === "team") return { hero, lines: [], ackOnDisplay: [] };

  const lines = linesFor(moments, ctx.card, new Set(hero?.keys ?? []));
  return { hero, lines, ackOnDisplay: lines.flatMap((line) => line.keys) };
}

/* ------------------------------------------------------------------------------------------ */
/* The replay list                                                                              */
/* ------------------------------------------------------------------------------------------ */

const time = (iso: string): number => {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : 0;
};

/**
 * What « Revoir » may replay: only what happened, derived and never invented (plan 4.6). The
 * season's first rating (the earliest stored journée with a number), the first time at each tier
 * above HOMA (the earliest stored journée at it, across seasons), the founder mark (from the
 * card) and each closed season (its last stored journée). Newest first.
 *
 * `rows` are the stored journées the page has read, in any order. A thing whose journée has not
 * been read is still listed where the card itself knows it (the founder mark, a closed season).
 */
export function deriveReplayItems(card: MyCardDto, rows: readonly HistoryRowDto[]): ReplayItem[] {
  const dated: { at: number; item: ReplayItem }[] = [];
  const bySeason = new Map<string, HistoryRowDto[]>();
  for (const row of rows) bySeason.set(row.seasonId, [...(bySeason.get(row.seasonId) ?? []), row]);
  const byTime = (a: HistoryRowDto, b: HistoryRowDto) =>
    time(a.calculatedAt) - time(b.calculatedAt) || a.gameweekSeq - b.gameweekSeq;

  const seasonRows = (bySeason.get(card.season.id) ?? []).slice().sort(byTime);
  const firstRated = seasonRows.find((row) => row.ovr !== null) ?? null;
  if (firstRated) {
    dated.push({
      at: time(firstRated.calculatedAt),
      item: {
        kind: "first_rating",
        seasonId: firstRated.seasonId,
        gameweekSeq: firstRated.gameweekSeq,
        tier: firstRated.tier,
        beat: "first",
        row: firstRated,
      },
    });
  }

  const everything = [...rows].sort(byTime);
  for (const tier of TIER_CODES.slice(1)) {
    const row = everything.find((candidate) => candidate.tier === tier && candidate.ovr !== null);
    if (!row) continue;
    // The journée of the first rating is already listed as that.
    if (
      firstRated &&
      row.seasonId === firstRated.seasonId &&
      row.gameweekSeq === firstRated.gameweekSeq
    ) {
      continue;
    }
    dated.push({
      at: time(row.calculatedAt),
      item: {
        kind: "tier",
        seasonId: row.seasonId,
        gameweekSeq: row.gameweekSeq,
        tier,
        beat: tier === "legend" ? "legend" : "tier",
        row,
      },
    });
  }

  if (card.founder) {
    dated.push({
      at: time(card.founder.grantedAt),
      item: {
        kind: "founder",
        seasonId: null,
        gameweekSeq: null,
        tier: null,
        beat: "founder",
        row: null,
      },
    });
  }

  for (const season of card.seasons) {
    if (!season.closedAt) continue;
    const last = (bySeason.get(season.seasonId) ?? []).slice().sort(byTime).at(-1) ?? null;
    dated.push({
      at: time(season.closedAt),
      item: {
        kind: "season",
        seasonId: season.seasonId,
        gameweekSeq: last?.gameweekSeq ?? null,
        tier: season.tier,
        beat: "castoff",
        row: last,
      },
    });
  }

  return dated.sort((a, b) => b.at - a.at).map((entry) => entry.item);
}
