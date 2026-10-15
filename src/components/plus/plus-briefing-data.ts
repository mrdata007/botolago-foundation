import type { BriefingMember, BriefingPlayer, FormCell } from "@/backend/premium/briefing";
import { computeTransferCost } from "@/lib/fantasy-engine";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";

/**
 * The pure part of the deadline briefing screen: what the answer says, arranged for the four
 * decision cards, and what changed since this device last opened it. Nothing here predicts: every
 * figure is one the database returned, and a figure that is not there stays not there.
 */

// ---------------------------------------------------------------------------
// Numbers and dates
// ---------------------------------------------------------------------------

/** Western digits in both languages; the decimal is a comma in French and a point in Arabic. */
const locale = (lang: string) => (lang === "ar" ? "en-US" : "fr-FR");

/** A price in millions, one decimal, Western digits: « 7,8 » / « 7.8 ». */
export function formatMillions(lang: string, value: number): string {
  return new Intl.NumberFormat(locale(lang), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

/** « 12 oct. » in Morocco's time, Gregorian, Western digits in Arabic too. */
export function formatDay(lang: string, iso: string): string {
  return moroccoDateTimeFormat(lang === "ar" ? "ar-MA-u-nu-latn-ca-gregory" : "fr-FR", {
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

/** The deadline as a date (« ven. 17 oct. ») and a time (« 18:00 »), in Morocco's time. */
export function formatDeadlineParts(lang: string, iso: string): { date: string; time: string } {
  const date = moroccoDateTimeFormat(lang === "ar" ? "ar-MA-u-nu-latn-ca-gregory" : "fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
  const time = moroccoDateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
  return { date, time };
}

// ---------------------------------------------------------------------------
// The squad, sorted into what is known
// ---------------------------------------------------------------------------

/** Minutes in the most recent journée that is published for the player; null when none is. */
export function lastMinutes(player: BriefingPlayer): { sequence: number; minutes: number } | null {
  const cells = [...player.form]
    .filter((cell) => cell.minutes !== null)
    .sort((a, b) => b.gameweekSequence - a.gameweekSequence);
  const last = cells[0];
  return last ? { sequence: last.gameweekSequence, minutes: last.minutes ?? 0 } : null;
}

export interface SquadFacts {
  /** The provider lists them as injured or suspended: the one thing called « absent ». */
  absent: BriefingPlayer[];
  /** Not listed, but 0 minutes in the last published journée: a fact, not a diagnosis. */
  noInfo: BriefingPlayer[];
  /** Everyone else. */
  others: BriefingPlayer[];
  /** Whether the provider listed any absence for the gameweek at all. */
  feedListed: number;
}

export function squadFacts(view: BriefingMember): SquadFacts {
  const absent = view.squad.filter((p) => p.absence !== null);
  const noInfo = view.squad.filter((p) => p.absence === null && lastMinutes(p)?.minutes === 0);
  const flagged = new Set([...absent, ...noInfo].map((p) => p.fantasyPlayerId));
  return {
    absent,
    noInfo,
    others: view.squad.filter((p) => !flagged.has(p.fantasyPlayerId)),
    feedListed: view.absenceFeed.listed,
  };
}

/** The player the « Remplacer » card opens on: the first absent, else the first with no minutes. */
export function defaultReplace(facts: SquadFacts, view: BriefingMember): string | null {
  return (
    facts.absent[0]?.fantasyPlayerId ??
    facts.noInfo[0]?.fantasyPlayerId ??
    view.squad[0]?.fantasyPlayerId ??
    null
  );
}

// ---------------------------------------------------------------------------
// Published points
// ---------------------------------------------------------------------------

/** The published points of a player, with how many journées they come from. */
export function publishedTotal(player: BriefingPlayer): { total: number; journees: number } {
  const published = player.form.filter((cell) => cell.state === "published");
  return {
    total: published.reduce((sum, cell) => sum + (cell.points ?? 0), 0),
    journees: published.length,
  };
}

/**
 * The captain's candidates for the card: the current captain and vice-captain, then the starters
 * with the most published points, three at most. Ordered by published total, no one preselected and
 * no « best pick »: the screen says that the past does not predict the next journée.
 */
export function captainCandidates(view: BriefingMember, max = 3): BriefingPlayer[] {
  const starters = view.squad.filter((p) => p.role === "starter" && p.absence === null);
  const own = starters.filter((p) => p.captain || p.viceCaptain);
  const rest = starters
    .filter((p) => !p.captain && !p.viceCaptain)
    .sort((a, b) => publishedTotal(b).total - publishedTotal(a).total);
  return [...own, ...rest]
    .slice(0, max)
    .sort((a, b) => publishedTotal(b).total - publishedTotal(a).total);
}

/** How many squad players have a published figure for a journée, and how many are still waiting. */
export function journeeCounts(
  view: BriefingMember,
  sequence: number,
): { rated: number; waiting: number; noRating: number } {
  let rated = 0;
  let waiting = 0;
  let noRating = 0;
  for (const player of view.squad) {
    const cell = player.form.find((c) => c.gameweekSequence === sequence);
    if (!cell || cell.state === "pending") waiting += 1;
    else if (cell.state === "no_rating") noRating += 1;
    else rated += 1;
  }
  return { rated, waiting, noRating };
}

export function cellFor(player: { form: FormCell[] }, sequence: number): FormCell | null {
  return player.form.find((cell) => cell.gameweekSequence === sequence) ?? null;
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export interface TransferRow {
  transfers: number;
  paid: number;
  hitPoints: number;
}

/** The cost of 1, 2 and 3 transfers, by the same function the transfer screen uses. */
export function transferRows(freeTransfers: number): TransferRow[] {
  return [1, 2, 3].map((transfers) => {
    const { paid, hitPoints } = computeTransferCost({ totalTransfers: transfers, freeTransfers });
    return { transfers, paid, hitPoints };
  });
}

// ---------------------------------------------------------------------------
// « Depuis votre visite »: kept on this device, nowhere else
// ---------------------------------------------------------------------------

/** What the briefing showed the last time this device opened it. */
export interface VisitSnapshot {
  at: string;
  gameweek: number;
  /** The state of each journée shown, by sequence. */
  published: Record<string, string>;
  absentIds: string[];
  rank: number | null;
  size: number | null;
  ahead: string[];
}

export function snapshotOf(view: BriefingMember, at: string): VisitSnapshot {
  return {
    at,
    gameweek: view.gameweek.sequence,
    published: Object.fromEntries(view.published.map((g) => [String(g.sequence), g.state])),
    absentIds: view.squad.filter((p) => p.absence !== null).map((p) => p.fantasyPlayerId),
    rank: view.league?.rank ?? null,
    size: view.league?.size ?? null,
    ahead: view.league?.ahead ?? [],
  };
}

export type VisitChange =
  | {
      kind: "published";
      sequence: number;
      publishedAt: string | null;
      rated: number;
      waiting: number;
    }
  | { kind: "absent"; names: string[] }
  | { kind: "overtaken"; names: string[]; rank: number; size: number }
  | { kind: "rank"; from: number; rank: number; size: number };

/**
 * What changed between the last visit and now: a journée that became published (or published more
 * of its players), players the provider newly lists as absent, and the caller's place in their
 * league. A first visit has no « before », so no change is claimed.
 */
export function visitChanges(previous: VisitSnapshot | null, view: BriefingMember): VisitChange[] {
  if (!previous) return [];
  const changes: VisitChange[] = [];
  for (const g of view.published) {
    const before = previous.published[String(g.sequence)];
    if (before !== undefined && before !== g.state && g.state !== "pending") {
      const counts = journeeCounts(view, g.sequence);
      changes.push({
        kind: "published",
        sequence: g.sequence,
        publishedAt: g.publishedAt,
        rated: counts.rated,
        waiting: counts.waiting,
      });
    }
  }
  const known = new Set(previous.absentIds);
  const added = view.squad
    .filter((p) => p.absence !== null && !known.has(p.fantasyPlayerId))
    .map((p) => p.name);
  if (added.length > 0) changes.push({ kind: "absent", names: added });
  if (view.league && previous.rank !== null && view.league.rank !== previous.rank) {
    const passed = view.league.ahead.filter((name) => !previous.ahead.includes(name));
    if (passed.length > 0 && view.league.rank > previous.rank) {
      changes.push({
        kind: "overtaken",
        names: passed,
        rank: view.league.rank,
        size: view.league.size,
      });
    } else {
      changes.push({
        kind: "rank",
        from: previous.rank,
        rank: view.league.rank,
        size: view.league.size,
      });
    }
  }
  return changes;
}

const VISIT_KEY = (userId: string) => `bg.briefing.visit.${userId}`;

/** The device's own memory of the last visit. Every access guards against storage that throws. */
export function readVisit(userId: string): VisitSnapshot | null {
  try {
    const raw = window.localStorage.getItem(VISIT_KEY(userId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<VisitSnapshot>;
    if (
      typeof value.at !== "string" ||
      typeof value.gameweek !== "number" ||
      typeof value.published !== "object" ||
      value.published === null ||
      !Array.isArray(value.absentIds) ||
      !Array.isArray(value.ahead)
    )
      return null;
    return {
      at: value.at,
      gameweek: value.gameweek,
      published: value.published as Record<string, string>,
      absentIds: value.absentIds.filter((id): id is string => typeof id === "string"),
      rank: typeof value.rank === "number" ? value.rank : null,
      size: typeof value.size === "number" ? value.size : null,
      ahead: value.ahead.filter((name): name is string => typeof name === "string"),
    };
  } catch {
    return null;
  }
}

export function writeVisit(userId: string, snapshot: VisitSnapshot): void {
  try {
    window.localStorage.setItem(VISIT_KEY(userId), JSON.stringify(snapshot));
  } catch {
    // Storage blocked or full: the briefing works the same, it just remembers nothing.
  }
}
