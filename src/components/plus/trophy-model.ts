import {
  TROPHY_FAMILIES,
  type EarnedTrophy,
  type PendingTrophy,
  type TrophiesCabinet,
  type TrophyFamily,
  type TrophyProgress,
} from "@/backend/trophies/contracts";

/** One place on a shelf: earned (lit), waiting for a publication (dashed) or still to earn (flat). */
export type Plaque =
  | { state: "earned"; code: string; family: TrophyFamily; label: string; earned: EarnedTrophy }
  | { state: "pending"; code: string; family: TrophyFamily; label: string; pending: PendingTrophy }
  | {
      state: "todo";
      code: string;
      family: TrophyFamily;
      label: string;
      progress: TrophyProgress | null;
    };

export interface Shelf {
  family: TrophyFamily;
  plaques: Plaque[];
  /** Trophies earned on this shelf and how many it holds (a founder trophy nobody earned is not counted). */
  earned: number;
  total: number;
}

/** How a figure reads: the big number and which unit goes under it. */
export type Figure =
  | { kind: "number"; big: string; unit: "rating" | "pts" | "gameweeks" | null }
  | { kind: "rank"; rank: number; of: number }
  | { kind: "year"; big: string };

const text = (lang: string, fr: string, ar: string) => (lang === "ar" ? ar : fr);
const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** The figure that earned a trophy, from the facts the database stored when it was earned. */
export function figureOf(earned: EarnedTrophy): Figure {
  const { code, facts } = earned;
  if (code === "winning_transfer") {
    const gain = num(facts.gain);
    return { kind: "number", big: gain === null ? "+" : `+${gain}`, unit: "pts" };
  }
  if (code === "gw_80") return { kind: "number", big: String(num(facts.score) ?? ""), unit: "pts" };
  if (code === "ten_gameweeks" || code === "thirty_gameweeks")
    return { kind: "number", big: String(num(facts.played) ?? ""), unit: "gameweeks" };
  if (code === "league_podium" || code === "league_leader")
    return { kind: "rank", rank: num(facts.rank) ?? 1, of: num(facts.of) ?? 0 };
  if (code === "founder_2026") return { kind: "year", big: code.replace(/\D/g, "") };
  return { kind: "number", big: String(num(facts.ovr) ?? ""), unit: "rating" };
}

/** Builds the shelves of the cabinet, in the catalogue's order, for the reader's language. */
export function buildShelves(cabinet: TrophiesCabinet, lang: string): Shelf[] {
  const earnedBy = new Map(cabinet.earned.map((e) => [e.code, e]));
  const pendingBy = new Map(cabinet.pending.map((p) => [p.code, p]));
  const progressBy = new Map(cabinet.progress.map((p) => [p.code, p]));
  const shelves: Shelf[] = [];
  for (const family of TROPHY_FAMILIES) {
    const plaques: Plaque[] = [];
    for (const item of cabinet.catalog.filter((c) => c.family === family)) {
      const label = text(lang, item.labelFr, item.labelAr);
      const earned = earnedBy.get(item.code);
      if (earned) {
        plaques.push({ state: "earned", code: item.code, family, label, earned });
      } else if (item.scope === "card") {
        // earned once, ever, by the founding cohort: nothing to show for anyone else
      } else if (pendingBy.has(item.code)) {
        plaques.push({
          state: "pending",
          code: item.code,
          family,
          label,
          pending: pendingBy.get(item.code)!,
        });
      } else {
        plaques.push({
          state: "todo",
          code: item.code,
          family,
          label,
          progress: progressBy.get(item.code) ?? null,
        });
      }
    }
    if (plaques.length === 0) continue;
    // lit plaques first, then the one waiting, then the silhouettes
    const order = { earned: 0, pending: 1, todo: 2 } as const;
    plaques.sort((a, b) => order[a.state] - order[b.state]);
    shelves.push({
      family,
      plaques,
      earned: plaques.filter((p) => p.state === "earned").length,
      total: plaques.length,
    });
  }
  return shelves;
}

/** The trophies earned and shown (this season's and the card's). */
export function earnedCount(cabinet: TrophiesCabinet): number {
  return cabinet.earned.length;
}

/** The most recently earned trophy, when it was earned within `days` of `now`. */
export function newestWithin(cabinet: TrophiesCabinet, now: Date, days = 7): string | null {
  const newest = [...cabinet.earned].sort((a, b) => b.earnedAt.localeCompare(a.earnedAt))[0];
  if (!newest) return null;
  const age = now.getTime() - new Date(newest.earnedAt).getTime();
  return age >= 0 && age <= days * 86_400_000 ? newest.code : null;
}

/** The latest journée a trophy of the season was earned in (the kicker's « après la journée n »). */
export function latestGameweek(cabinet: TrophiesCabinet): number | null {
  return cabinet.journeesPlayed > 0 ? cabinet.journeesPlayed : null;
}

const SHORT = {
  fr: new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Casablanca",
  }),
  ar: new Intl.DateTimeFormat("ar-u-nu-latn-ca-gregory", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Casablanca",
  }),
};

/** « 3 oct. » / « 3 أكتوبر »: the day a result was published, in Morocco's time. */
export function shortDate(iso: string, lang: string): string {
  return (lang === "ar" ? SHORT.ar : SHORT.fr).format(new Date(iso));
}

/** Frames that reward a trophy and are still to earn, with their trophy's progress. */
export function framesToEarn(cabinet: TrophiesCabinet) {
  const progressBy = new Map(cabinet.progress.map((p) => [p.code, p]));
  return cabinet.frames
    .filter((f) => !f.earned && f.trophyCode !== null)
    .map((frame) => ({ frame, progress: progressBy.get(frame.trophyCode!) ?? null }));
}
