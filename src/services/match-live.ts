import type { LocalizedString, Match } from "@/types/domain";

/**
 * Deterministic live-detail generator.
 *
 * The football read model does not (yet) expose per-match events, team stats
 * or momentum. This module derives a believable, *stable* set of them from the
 * match id and the current scoreline so the UI can be built and reviewed
 * without any backend change. Everything here is pure: same input → same
 * output, on server and client (no Date.now, no Math.random).
 */

export type MatchEventType =
  | "goal"
  | "own_goal"
  | "penalty"
  | "yellow"
  | "red"
  | "sub"
  | "var";

export interface MatchEvent {
  readonly id: string;
  readonly minute: number;
  readonly type: MatchEventType;
  readonly clubId: string;
  readonly side: "home" | "away";
  readonly player: LocalizedString;
  /** Assist provider for goals, or the incoming player for substitutions. */
  readonly secondary?: LocalizedString;
  /** Running score after the event, goals only. */
  readonly homeScore?: number;
  readonly awayScore?: number;
}

export interface MatchTeamStats {
  readonly possession: number;
  readonly shots: number;
  readonly shotsOnTarget: number;
  readonly corners: number;
  readonly fouls: number;
  readonly offsides: number;
  readonly saves: number;
  readonly passAccuracy: number;
}

export interface MatchStats {
  readonly home: MatchTeamStats;
  readonly away: MatchTeamStats;
}

export interface MatchMomentumPoint {
  /** Minute bucket (0, 5, 10 … elapsed). */
  readonly minute: number;
  /** -100 (away pressing) … +100 (home pressing). */
  readonly value: number;
}

export interface MatchLiveDetail {
  readonly elapsed: number;
  readonly events: readonly MatchEvent[];
  readonly stats: MatchStats;
  readonly momentum: readonly MatchMomentumPoint[];
}

/* ------------------------------------------------------------------ */
/* Seeded pseudo-randomness                                            */
/* ------------------------------------------------------------------ */

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: string) {
  let state = hashSeed(seed) || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

/** Inclusive integer in [min, max]. */
function pick(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/* ------------------------------------------------------------------ */
/* Player-name pool (mock)                                             */
/* ------------------------------------------------------------------ */

const NAME_POOL: readonly LocalizedString[] = [
  { fr: "Y. En-Nesyri", ar: "ي. النصيري" },
  { fr: "A. Hakimi", ar: "أ. حكيمي" },
  { fr: "S. Amrabat", ar: "س. أمرابط" },
  { fr: "A. Ounahi", ar: "ع. أوناحي" },
  { fr: "R. Saïss", ar: "ر. سايس" },
  { fr: "N. Aguerd", ar: "ن. أكرد" },
  { fr: "Y. Attiat-Allah", ar: "ي. عطية الله" },
  { fr: "A. Boufal", ar: "أ. بوفال" },
  { fr: "Z. Aboukhlal", ar: "ز. أبو خلال" },
  { fr: "B. Bounou", ar: "ب. بونو" },
  { fr: "M. Chibi", ar: "م. الشيبي" },
  { fr: "O. El Kaabi", ar: "ي. النصيري" },
  { fr: "H. Rahimi", ar: "س. الرحيمي" },
  { fr: "A. Bassir", ar: "ع. بصير" },
  { fr: "M. Moufid", ar: "م. مفيد" },
  { fr: "K. Zaari", ar: "خ. الزعري" },
  { fr: "T. Benhalib", ar: "ط. بنحليب" },
  { fr: "I. Khalil", ar: "إ. خليل" },
  { fr: "S. Mmaee", ar: "س. مماي" },
  { fr: "A. Jabrane", ar: "أ. جبران" },
];

function nameFor(rng: () => number, used: Set<string>): LocalizedString {
  for (let i = 0; i < 12; i++) {
    const candidate = NAME_POOL[pick(rng, 0, NAME_POOL.length - 1)]!;
    if (!used.has(candidate.fr)) {
      used.add(candidate.fr);
      return candidate;
    }
  }
  return NAME_POOL[pick(rng, 0, NAME_POOL.length - 1)]!;
}

/* ------------------------------------------------------------------ */
/* Elapsed time                                                        */
/* ------------------------------------------------------------------ */

export function elapsedMinutes(match: Pick<Match, "status" | "minute">): number {
  if (match.status === "finished") return 90;
  if (match.status === "live") return Math.max(1, Math.min(match.minute ?? 45, 90));
  return 0;
}

/* ------------------------------------------------------------------ */
/* Generator                                                           */
/* ------------------------------------------------------------------ */

export function buildMatchLiveDetail(match: Match): MatchLiveDetail {
  const elapsed = elapsedMinutes(match);
  const rng = makeRng(match.id);
  const used = new Set<string>();

  const homeGoals = elapsed > 0 ? (match.homeScore ?? 0) : 0;
  const awayGoals = elapsed > 0 ? (match.awayScore ?? 0) : 0;

  type Draft = Omit<MatchEvent, "id" | "homeScore" | "awayScore">;
  const drafts: Draft[] = [];

  const goalMinutes: { minute: number; side: "home" | "away" }[] = [];
  const spread = Math.max(elapsed - 2, 1);
  for (let i = 0; i < homeGoals; i++) {
    goalMinutes.push({ minute: pick(rng, 2, spread), side: "home" });
  }
  for (let i = 0; i < awayGoals; i++) {
    goalMinutes.push({ minute: pick(rng, 2, spread), side: "away" });
  }

  for (const g of goalMinutes) {
    const roll = rng();
    const type: MatchEventType = roll > 0.92 ? "penalty" : roll > 0.88 ? "own_goal" : "goal";
    drafts.push({
      minute: g.minute,
      type,
      side: g.side,
      clubId: g.side === "home" ? match.homeClubId : match.awayClubId,
      player: nameFor(rng, used),
      secondary: type === "goal" && rng() > 0.4 ? nameFor(rng, used) : undefined,
    });
  }

  // Cards
  const cardCount = elapsed === 0 ? 0 : pick(rng, 1, 4);
  for (let i = 0; i < cardCount; i++) {
    const side: "home" | "away" = rng() > 0.5 ? "home" : "away";
    const isRed = rng() > 0.93;
    drafts.push({
      minute: pick(rng, 8, Math.max(elapsed, 9)),
      type: isRed ? "red" : "yellow",
      side,
      clubId: side === "home" ? match.homeClubId : match.awayClubId,
      player: nameFor(rng, used),
    });
  }

  // VAR check (rare)
  if (elapsed > 30 && rng() > 0.75) {
    const side: "home" | "away" = rng() > 0.5 ? "home" : "away";
    drafts.push({
      minute: pick(rng, 25, Math.max(elapsed, 26)),
      type: "var",
      side,
      clubId: side === "home" ? match.homeClubId : match.awayClubId,
      player: nameFor(rng, used),
    });
  }

  // Substitutions from the hour mark
  if (elapsed >= 60) {
    const subCount = pick(rng, 1, 3);
    for (let i = 0; i < subCount; i++) {
      const side: "home" | "away" = rng() > 0.5 ? "home" : "away";
      drafts.push({
        minute: pick(rng, 60, Math.max(elapsed, 61)),
        type: "sub",
        side,
        clubId: side === "home" ? match.homeClubId : match.awayClubId,
        player: nameFor(rng, used),
        secondary: nameFor(rng, used),
      });
    }
  }

  drafts.sort((a, b) => a.minute - b.minute);

  let runningHome = 0;
  let runningAway = 0;
  const events: MatchEvent[] = drafts.map((d, index) => {
    const scores: { homeScore?: number; awayScore?: number } = {};
    if (d.type === "goal" || d.type === "penalty" || d.type === "own_goal") {
      if (d.side === "home") runningHome++;
      else runningAway++;
      scores.homeScore = runningHome;
      scores.awayScore = runningAway;
    }
    return { ...d, id: `${match.id}-ev-${index}`, ...scores };
  });

  return {
    elapsed,
    events,
    stats: buildStats(match, elapsed, homeGoals, awayGoals),
    momentum: buildMomentum(match, elapsed, events),
  };
}

function buildStats(
  match: Match,
  elapsed: number,
  homeGoals: number,
  awayGoals: number,
): MatchStats {
  const rng = makeRng(`${match.id}:stats`);
  const factor = Math.max(elapsed, 0) / 90;

  const homePossession = elapsed === 0 ? 50 : pick(rng, 38, 62);
  const scale = (base: number, variance: number) =>
    Math.max(0, Math.round((base + pick(rng, -variance, variance)) * factor));

  const home: MatchTeamStats = {
    possession: elapsed === 0 ? 50 : homePossession,
    shots: Math.max(homeGoals, scale(12, 4)),
    shotsOnTarget: Math.max(homeGoals, scale(5, 2)),
    corners: scale(5, 3),
    fouls: scale(11, 4),
    offsides: scale(2, 2),
    saves: scale(3, 2),
    passAccuracy: elapsed === 0 ? 0 : pick(rng, 72, 90),
  };
  const away: MatchTeamStats = {
    possession: elapsed === 0 ? 50 : 100 - homePossession,
    shots: Math.max(awayGoals, scale(11, 4)),
    shotsOnTarget: Math.max(awayGoals, scale(4, 2)),
    corners: scale(4, 3),
    fouls: scale(12, 4),
    offsides: scale(2, 2),
    saves: scale(3, 2),
    passAccuracy: elapsed === 0 ? 0 : pick(rng, 70, 89),
  };
  return { home, away };
}

function buildMomentum(
  match: Match,
  elapsed: number,
  events: readonly MatchEvent[],
): readonly MatchMomentumPoint[] {
  if (elapsed === 0) return [];
  const rng = makeRng(`${match.id}:momentum`);
  const points: MatchMomentumPoint[] = [];
  let value = 0;
  for (let minute = 0; minute <= elapsed; minute += 5) {
    value = value * 0.55 + (rng() * 2 - 1) * 70;
    // Goals pull momentum decisively toward the scoring side.
    for (const ev of events) {
      if (ev.homeScore === undefined) continue;
      if (Math.abs(ev.minute - minute) <= 3) {
        value = ev.side === "home" ? 85 : -85;
      }
    }
    points.push({ minute, value: Math.max(-100, Math.min(100, Math.round(value))) });
  }
  return points;
}
