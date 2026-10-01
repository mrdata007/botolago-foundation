/**
 * Reconciler for the Sofascore + Flashscore Fantasy plan
 * (docs/backend/FANTASY_SOFASCORE_FLASHSCORE_PLAN.md, section 4).
 *
 * Pure function: it takes what the Phase 1 adapters already parsed and returns
 * per-player stats, the evidence behind every field, and a list of
 * discrepancies. No database, no network, no clock (the caller supplies
 * `observedAt`). It never creates players: it only pairs the two providers'
 * lineup entries and reports what it could not pair.
 *
 * Rules it enforces:
 * - Players are paired by team side and shirt number, with position as a veto
 *   (a Flashscore keeper cannot be a Sofascore outfield player). Never by name.
 * - Goals come from the incident lists of both providers. They must agree on
 *   who scored and when (+/- 2 minutes), and add up to the final score. Any
 *   disagreement sends the whole match to review and scores nothing.
 * - Saves come from Sofascore player statistics on a full-coverage match only.
 *   Otherwise they are "unknown". Nothing is derived from shots on target.
 * - On a limited-coverage Sofascore match, `goalAssist: 0` is unknown, not
 *   zero. Assists are filled from Flashscore.
 * - Sofascore ratings are display only.
 */
import type {
  LineupPosition,
  MatchSide,
  PerformanceIncident,
  PerformanceLineupPlayer,
  PerformanceLineups,
  PerformanceMatchSummary,
  PerformanceStatisticLine,
} from "../football/provider/performance-contracts";
import { deriveParticipation, readiness } from "./adaptive-scoring";
import type {
  CertifiedStats,
  EvidenceState,
  FieldEvidence,
  ScoringField,
} from "./adaptive-scoring";
import type { FantasyPosition } from "./contracts";

export interface ProviderMatchData {
  readonly summary: PerformanceMatchSummary;
  readonly lineups: PerformanceLineups;
  readonly incidents: readonly PerformanceIncident[];
  readonly statistics: readonly PerformanceStatisticLine[];
}

export interface ReconcileInput {
  /** When the data was read; stamped on every evidence record. */
  readonly observedAt: string;
  readonly sofascore: ProviderMatchData | null;
  readonly flashscore: ProviderMatchData | null;
  /** Payload digests of the raw responses, added to each evidence reference. */
  readonly digests?: { readonly sofascore?: string; readonly flashscore?: string };
}

export type DiscrepancyCode =
  | "provider_missing"
  | "match_not_finished"
  | "score_mismatch"
  | "goal_mismatch"
  | "unknown_incident"
  | "own_goal_unconfirmed"
  | "starters_count"
  | "saves_identity"
  | "unmatched_player"
  | "ambiguous_shirt"
  | "position_conflict"
  | "assist_conflict"
  | "assist_unmatched"
  | "assist_unconfirmed"
  | "card_mismatch"
  | "penalty_missed_mismatch"
  | "penalty_saved_unknown"
  | "substitution_mismatch"
  | "minutes_mismatch"
  | "participation_ambiguous"
  | "penalty_label_differs"
  | "info";

export interface Discrepancy {
  readonly code: DiscrepancyCode;
  /** `fixture`: nothing is scored. `player`: that player's fields are incomplete. `info`: noted only. */
  readonly level: "fixture" | "player" | "info";
  readonly side: MatchSide | null;
  readonly shirtNumber: number | null;
  readonly field: ScoringField | null;
  readonly message: string;
}

export interface UnmatchedPlayer {
  readonly provider: "sofascore" | "flashscore";
  readonly providerId: string;
  readonly side: MatchSide;
  readonly shirtNumber: number | null;
  readonly starter: boolean;
  /** Shown to a human reviewer only. Never used to decide a match. */
  readonly displayName: string;
  readonly reason: "no_counterpart" | "ambiguous_shirt" | "position_conflict" | "no_shirt_number";
}

export type PlayerMode = "full" | "simple" | "incomplete";

export interface ReconciledPlayer {
  readonly side: MatchSide;
  readonly shirtNumber: number | null;
  readonly displayName: string;
  readonly sofascoreId: string;
  readonly flashscoreId: string;
  readonly position: LineupPosition | null;
  readonly started: boolean;
  /** Only fields that were established. A missing field is unknown, not zero. */
  readonly stats: CertifiedStats;
  readonly evidence: FieldEvidence;
  readonly mode: PlayerMode;
  /** Sofascore rating, for display only. Never scored. */
  readonly rating: number | null;
}

/** `review`: nothing scored. `incomplete`: some players cannot be scored. */
export type FixtureMode = "full" | "simple" | "incomplete" | "review";

export interface ReconcileResult {
  readonly mode: FixtureMode;
  readonly players: readonly ReconciledPlayer[];
  readonly unmatched: readonly UnmatchedPlayer[];
  readonly discrepancies: readonly Discrepancy[];
}

const TOLERANCE_MINUTES = 2;
const WITHIN = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE_MINUTES;
/**
 * Sofascore `minutesPlayed` counts the clock, so a player taken off at minute
 * 77 shows 80 when the first half ran three minutes over. The plan's flat
 * +/- 2 minutes rejected 8 of 37 players in MAS-Zemamra on this alone. The
 * check therefore allows `minutesPlayed` to run up to this many minutes over
 * the substitution time, and only the usual 2 minutes under it.
 */
const MAX_STOPPAGE_MINUTES = 6;
const GOAL_KINDS = new Set(["goal", "penalty_goal"]);
/** An unknown label that mentions one of these could change a score. */
const SCORE_RELEVANT = /goal|card|penalt|red|yellow|own/i;

const APP_POSITION: Record<LineupPosition, FantasyPosition> = {
  G: "GK",
  D: "DEF",
  M: "MID",
  F: "FWD",
};

interface Pair {
  readonly side: MatchSide;
  readonly sofa: PerformanceLineupPlayer;
  readonly flash: PerformanceLineupPlayer;
}

export function reconcileMatch(input: ReconcileInput): ReconcileResult {
  const discrepancies: Discrepancy[] = [];
  const note = (
    code: DiscrepancyCode,
    level: Discrepancy["level"],
    message: string,
    where: Partial<Pick<Discrepancy, "side" | "shirtNumber" | "field">> = {},
  ) =>
    discrepancies.push({
      code,
      level,
      message,
      side: where.side ?? null,
      shirtNumber: where.shirtNumber ?? null,
      field: where.field ?? null,
    });
  const review = (unmatched: readonly UnmatchedPlayer[] = []): ReconcileResult => ({
    mode: "review",
    players: [],
    unmatched,
    discrepancies,
  });

  const { sofascore, flashscore } = input;
  if (!sofascore || !flashscore) {
    note(
      "provider_missing",
      "fixture",
      `Both providers are needed to verify a match; ${sofascore ? "Flashscore" : "Sofascore"} is missing.`,
    );
    return review();
  }
  if (!sofascore.summary.finished || !flashscore.summary.finished) {
    note("match_not_finished", "fixture", "A provider does not report the match as finished.");
    return review();
  }
  const { homeScore, awayScore } = sofascore.summary;
  if (
    homeScore === null ||
    awayScore === null ||
    homeScore !== flashscore.summary.homeScore ||
    awayScore !== flashscore.summary.awayScore
  ) {
    note("score_mismatch", "fixture", "The two providers do not give the same final score.");
    return review();
  }

  // ---- identity: side + shirt number, position as a veto --------------------
  const { pairs, unmatched } = pairPlayers(sofascore.lineups, flashscore.lineups, note);
  const byFlashId = new Map(pairs.map((p) => [p.flash.externalId, p]));
  const bySofaId = new Map(pairs.map((p) => [p.sofa.externalId, p]));
  /** The canonical id of a provider's player: the Sofascore id of its pair. */
  const canonOfSofa = (id: string | null) => (id !== null && bySofaId.has(id) ? id : null);
  const canonOfFlash = (id: string | null) =>
    id !== null ? (byFlashId.get(id)?.sofa.externalId ?? null) : null;

  // ---- unknown incident labels that could change a score --------------------
  for (const incident of [...sofascore.incidents, ...flashscore.incidents]) {
    if (incident.kind !== "unknown") continue;
    const label = `${incident.rawType}${incident.rawClass ? `/${incident.rawClass}` : ""}`;
    if (SCORE_RELEVANT.test(label)) {
      note(
        "unknown_incident",
        "fixture",
        `${incident.provider} reports "${label}", a label not seen in Phase 0 and not safe to guess.`,
        { side: incident.side },
      );
    } else {
      note(
        "info",
        "info",
        `${incident.provider} incident "${label}" ignored: meaning not established.`,
        {
          side: incident.side,
        },
      );
    }
  }

  // ---- goals ----------------------------------------------------------------
  const sofaGoals = sofascore.incidents.filter((i) => GOAL_KINDS.has(i.kind));
  const flashGoals = flashscore.incidents.filter((i) => GOAL_KINDS.has(i.kind));
  const goals = reconcileGoals(sofaGoals, flashGoals, canonOfSofa, canonOfFlash, note);
  for (const side of ["home", "away"] as const) {
    const expected = side === "home" ? homeScore : awayScore;
    if (sofaGoals.filter((g) => g.side === side).length !== expected) {
      note("score_mismatch", "fixture", `The ${side} goals do not add up to the final score.`, {
        side,
      });
    }
  }
  if (
    sofascore.lineups.players.some((p) => (p.stats?.ownGoals ?? 0) > 0) &&
    !discrepancies.some((d) => d.code === "unknown_incident")
  ) {
    note(
      "own_goal_unconfirmed",
      "fixture",
      "Sofascore credits an own goal that no incident explains.",
    );
  }
  for (const side of ["home", "away"] as const) {
    const starters = sofascore.lineups.players.filter((p) => p.side === side && p.starter);
    if (starters.length !== 11) {
      note(
        "starters_count",
        "fixture",
        `Sofascore lists ${starters.length} starters for the ${side} side.`,
        {
          side,
        },
      );
    }
  }
  checkSavesIdentity(sofascore, homeScore, awayScore, note);

  if (discrepancies.some((d) => d.level === "fixture")) return review(unmatched);

  // ---- the rest, per player -------------------------------------------------
  const refs = (extra: readonly string[] = []) => [
    `sofascore:${sofascore.summary.externalId}`,
    `flashscore:${flashscore.summary.externalId}`,
    ...(input.digests?.sofascore ? [`sha256:${input.digests.sofascore}`] : []),
    ...(input.digests?.flashscore ? [`sha256:${input.digests.flashscore}`] : []),
    ...extra,
  ];
  const evidence = (state: EvidenceState, source: string): FieldEvidence[ScoringField] => ({
    state,
    source,
    observedAt: input.observedAt,
    references: refs(),
  });
  const BOTH = "sofascore+flashscore";

  const subs = reconcileSubstitutions(
    sofascore.incidents,
    flashscore.incidents,
    canonOfSofa,
    canonOfFlash,
    note,
  );
  const cards = reconcileCards(
    sofascore.incidents,
    flashscore.incidents,
    canonOfSofa,
    canonOfFlash,
    note,
  );
  const missed = reconcileMissedPenalties(
    sofascore.incidents,
    flashscore.incidents,
    canonOfSofa,
    canonOfFlash,
    note,
  );
  const assists = reconcileAssists(
    sofascore.lineups.fullCoverage,
    canonOfSofa,
    canonOfFlash,
    goals.paired,
    note,
  );

  const players: ReconciledPlayer[] = [];
  for (const pair of pairs) {
    const { sofa, flash, side } = pair;
    const id = sofa.externalId;
    const position = sofa.position ?? flash.position;
    const isKeeper = position === "G";
    const stats: { -readonly [K in ScoringField]?: CertifiedStats[K] } = {};
    const proof: { -readonly [K in ScoringField]?: FieldEvidence[K] } = {};
    const set = <K extends ScoringField>(
      field: K,
      value: CertifiedStats[K],
      state: EvidenceState,
      source: string,
    ) => {
      if (value !== undefined) stats[field] = value;
      proof[field] = evidence(state, source);
    };
    const unknown = <K extends ScoringField>(field: K, source: string) => {
      proof[field] = evidence("unknown", source);
    };
    const where = { side, shirtNumber: sofa.shirtNumber };

    // goals
    set("goals", goals.byPlayer.get(id) ?? 0, "verified", BOTH);
    // own goals: any label that could hide one already sent the fixture to review
    set("ownGoals", 0, "verified", BOTH);

    // cards
    const card = cards.get(id) ?? {
      yellow: 0,
      red: 0,
      secondYellow: 0,
      broken: false,
      dismissedAt: null,
    };
    if (!card.broken) {
      set("yellowCards", card.yellow, "verified", BOTH);
      set("redCards", card.red, "verified", BOTH);
      set("secondYellowDismissals", card.secondYellow, "verified", BOTH);
    } else {
      for (const f of ["yellowCards", "redCards", "secondYellowDismissals"] as const)
        unknown(f, BOTH);
    }
    const cardsKnown = !card.broken;

    // minutes, clean sheet, goals conceded
    const subIn = subs.inAt.get(id) ?? null;
    const subOut = subs.outAt.get(id) ?? null;
    const dismissed = card.dismissedAt;
    const broken = subs.broken.has(id) || !cardsKnown;
    const appeared = sofa.starter || subIn !== null;
    if (broken) {
      for (const f of ["minutes", "cleanSheet", "goalsConceded"] as const) unknown(f, BOTH);
    } else {
      const exitedAt =
        [subOut, dismissed].filter((m): m is number => m !== null).sort((a, b) => a - b)[0] ?? null;
      try {
        const against = goals.minutesAgainst[side];
        const part = deriveParticipation({
          complete: true,
          orderingVerified: true,
          appeared,
          started: sofa.starter,
          enteredAt: sofa.starter ? null : subIn,
          exitedAt: appeared ? exitedAt : null,
          concededAt: against,
        });
        const start = sofa.starter ? 0 : (subIn ?? 0);
        const played = sofa.stats?.minutesPlayed ?? null;
        const observed = played === null ? (appeared ? null : 0) : Math.min(played, 90 - start);
        if (observed === null || !minutesAgree(observed, appeared ? part.minutes : 0)) {
          note(
            "minutes_mismatch",
            "player",
            observed === null
              ? "Sofascore gives no minutes to check the substitution times against."
              : "Sofascore minutes disagree with the substitution times.",
            where,
          );
          for (const f of ["minutes", "cleanSheet", "goalsConceded"] as const) unknown(f, BOTH);
        } else {
          set("minutes", part.minutes, "verified", BOTH);
          set("goalsConceded", part.goalsConceded, "verified", BOTH);
          set("cleanSheet", part.cleanSheet, "verified", BOTH);
        }
      } catch {
        note(
          "participation_ambiguous",
          "player",
          "A goal falls on the same minute as a substitution or dismissal.",
          where,
        );
        for (const f of ["minutes", "cleanSheet", "goalsConceded"] as const) unknown(f, BOTH);
      }
    }

    // assists
    const credited = assists.byPlayer.get(id);
    if (credited && !credited.unknown) set("assists", credited.count, "verified", credited.source);
    else if (!credited && !assists.unknownSides.has(side) && !assists.unknownPlayers.has(id)) {
      set("assists", 0, "verified", assists.zeroSource);
    } else {
      unknown("assists", assists.zeroSource);
    }

    // penalties missed
    const miss = missed.byPlayer.get(id);
    if (missed.broken.has(id)) unknown("penaltiesMissed", BOTH);
    else set("penaltiesMissed", miss ?? 0, "verified", BOTH);

    // goalkeeper-only fields
    if (isKeeper) {
      const saves = sofascore.lineups.fullCoverage ? (sofa.stats?.saves ?? null) : null;
      if (saves !== null) set("saves", saves, "verified", "sofascore");
      // A keeper who never came on made no saves, and both lineups say so.
      else if (!appeared && !broken) set("saves", 0, "verified", BOTH);
      else unknown("saves", "sofascore");
      // Only an incident that says a keeper saved counts, and none has been seen.
      // A missed penalty against this keeper's team may or may not have been a save.
      if (appeared && (missed.against[side] > 0 || missed.brokenSides.has(opposite(side)))) {
        unknown("penaltiesSaved", BOTH);
        note(
          "penalty_saved_unknown",
          "player",
          "A penalty was missed against this keeper's team; no incident says whether he saved it.",
          where,
        );
      } else {
        set("penaltiesSaved", 0, "verified", BOTH);
      }
    }

    const mode = playerMode(stats, proof, position);
    players.push({
      side,
      shirtNumber: sofa.shirtNumber,
      displayName: sofa.name,
      sofascoreId: sofa.externalId,
      flashscoreId: flash.externalId,
      position,
      started: sofa.starter,
      stats,
      evidence: proof,
      mode,
      rating: sofa.stats?.rating ?? null,
    });
  }

  // A player who appeared but could not be paired makes the fixture incomplete.
  const playedUnmatched = unmatched.filter(
    (u) => u.starter || subs.inAtAny.has(`${u.provider}:${u.providerId}`),
  );
  for (const u of playedUnmatched) {
    note(
      "unmatched_player",
      "player",
      `A ${u.provider} player who appeared could not be paired (${u.reason}).`,
      {
        side: u.side,
        shirtNumber: u.shirtNumber,
      },
    );
  }

  let mode: FixtureMode;
  if (playedUnmatched.length > 0 || players.some((p) => p.mode === "incomplete"))
    mode = "incomplete";
  else mode = players.every((p) => p.mode === "full") ? "full" : "simple";
  return { mode, players, unmatched, discrepancies };
}

const minutesAgree = (observed: number, computed: number) =>
  observed - computed >= -TOLERANCE_MINUTES && observed - computed <= MAX_STOPPAGE_MINUTES;

const opposite = (side: MatchSide): MatchSide => (side === "home" ? "away" : "home");

function playerMode(
  stats: CertifiedStats,
  proof: FieldEvidence,
  position: LineupPosition | null,
): PlayerMode {
  // Only a keeper's extra fields depend on position; an unknown outfield
  // position is read as outfield.
  const state = readiness(stats, proof, position ? APP_POSITION[position] : "MID");
  return state.full ? "full" : state.simple ? "simple" : "incomplete";
}

type Note = (
  code: DiscrepancyCode,
  level: Discrepancy["level"],
  message: string,
  where?: Partial<Pick<Discrepancy, "side" | "shirtNumber" | "field">>,
) => number;

function pairPlayers(sofa: PerformanceLineups, flash: PerformanceLineups, note: Note) {
  const pairs: Pair[] = [];
  const unmatched: UnmatchedPlayer[] = [];
  const miss = (
    p: PerformanceLineupPlayer,
    reason: UnmatchedPlayer["reason"],
  ): UnmatchedPlayer => ({
    provider: p.provider,
    providerId: p.externalId,
    side: p.side,
    shirtNumber: p.shirtNumber,
    starter: p.starter,
    displayName: p.name,
    reason,
  });
  for (const side of ["home", "away"] as const) {
    const sofaSide = sofa.players.filter((p) => p.side === side);
    const flashSide = flash.players.filter((p) => p.side === side);
    const group = (list: readonly PerformanceLineupPlayer[]) => {
      const map = new Map<number, PerformanceLineupPlayer[]>();
      for (const p of list)
        if (p.shirtNumber !== null) map.set(p.shirtNumber, [...(map.get(p.shirtNumber) ?? []), p]);
      return map;
    };
    const sofaByShirt = group(sofaSide);
    const flashByShirt = group(flashSide);
    for (const p of [...sofaSide, ...flashSide]) {
      if (p.shirtNumber === null) unmatched.push(miss(p, "no_shirt_number"));
    }
    const shirts = new Set([...sofaByShirt.keys(), ...flashByShirt.keys()]);
    for (const shirt of [...shirts].sort((a, b) => a - b)) {
      const s = sofaByShirt.get(shirt) ?? [];
      const f = flashByShirt.get(shirt) ?? [];
      if (s.length > 1 || f.length > 1) {
        for (const p of [...s, ...f]) unmatched.push(miss(p, "ambiguous_shirt"));
        note("ambiguous_shirt", "info", `Shirt ${shirt} appears more than once on one side.`, {
          side,
          shirtNumber: shirt,
        });
      } else if (s.length === 1 && f.length === 1) {
        const [sp] = s;
        const [fp] = f;
        // Flashscore marks keepers only some of the time, so its silence proves
        // nothing; its keeper marker against a known outfield position does.
        if (sp && fp && fp.position === "G" && sp.position !== null && sp.position !== "G") {
          unmatched.push(miss(sp, "position_conflict"), miss(fp, "position_conflict"));
          note(
            "position_conflict",
            "info",
            `Shirt ${shirt}: Flashscore says goalkeeper, Sofascore does not.`,
            { side, shirtNumber: shirt },
          );
        } else if (sp && fp) {
          pairs.push({ side, sofa: sp, flash: fp });
        }
      } else {
        for (const p of [...s, ...f]) unmatched.push(miss(p, "no_counterpart"));
      }
    }
  }
  return { pairs, unmatched };
}

/** Pair incidents of the same side, resolved player and time (+/- 2 minutes). */
function pairIncidents<T extends PerformanceIncident>(
  sofa: readonly T[],
  flash: readonly T[],
  sofaKey: (i: T) => string | null,
  flashKey: (i: T) => string | null,
) {
  const used = new Set<number>();
  const paired: { sofa: T; flash: T }[] = [];
  const sofaLeft: T[] = [];
  for (const s of sofa) {
    const key = sofaKey(s);
    const at = flash.findIndex(
      (f, index) =>
        !used.has(index) &&
        f.side === s.side &&
        key !== null &&
        flashKey(f) === key &&
        WITHIN(f.minute, s.minute),
    );
    if (at >= 0) {
      used.add(at);
      const match = flash[at];
      if (match) paired.push({ sofa: s, flash: match });
    } else sofaLeft.push(s);
  }
  return { paired, sofaLeft, flashLeft: flash.filter((_, index) => !used.has(index)) };
}

function reconcileGoals(
  sofa: readonly PerformanceIncident[],
  flash: readonly PerformanceIncident[],
  canonOfSofa: (id: string | null) => string | null,
  canonOfFlash: (id: string | null) => string | null,
  note: Note,
) {
  const { paired, sofaLeft, flashLeft } = pairIncidents(
    sofa,
    flash,
    (i) => canonOfSofa(i.player?.externalId ?? null),
    (i) => canonOfFlash(i.player?.externalId ?? null),
  );
  for (const g of [...sofaLeft, ...flashLeft]) {
    note(
      "goal_mismatch",
      "fixture",
      `A ${g.provider} goal at minute ${g.minute} has no matching goal from the other provider.`,
      {
        side: g.side,
      },
    );
  }
  const byPlayer = new Map<string, number>();
  const minutesAgainst: Record<MatchSide, number[]> = { home: [], away: [] };
  for (const { sofa: s, flash: f } of paired) {
    const id = canonOfSofa(s.player?.externalId ?? null);
    if (id === null) continue;
    byPlayer.set(id, (byPlayer.get(id) ?? 0) + 1);
    minutesAgainst[opposite(s.side)].push(s.minute);
    if ((s.kind === "penalty_goal") !== (f.kind === "penalty_goal")) {
      note(
        "penalty_label_differs",
        "info",
        "The providers label this goal differently as a penalty (Flashscore marks penalties explicitly). It scores as a goal either way.",
        { side: s.side },
      );
    }
  }
  return { byPlayer, minutesAgainst, paired };
}

function checkSavesIdentity(
  sofa: ProviderMatchData,
  homeScore: number,
  awayScore: number,
  note: Note,
) {
  if (!sofa.lineups.fullCoverage) return;
  const line = sofa.statistics.find((l) => l.period === "ALL" && l.key === "shotsOnGoal");
  if (!line || line.home === null || line.away === null) return;
  for (const side of ["home", "away"] as const) {
    const keepers = sofa.lineups.players.filter((p) => p.side === side && p.position === "G");
    if (
      keepers.some(
        (k) => k.stats !== null && k.stats.saves === null && (k.stats.minutesPlayed ?? 0) > 0,
      )
    )
      continue;
    const saves = keepers.reduce((sum, k) => sum + (k.stats?.saves ?? 0), 0);
    const conceded = side === "home" ? awayScore : homeScore;
    const shotsFaced = side === "home" ? line.away : line.home;
    if (saves + conceded !== shotsFaced) {
      note(
        "saves_identity",
        "fixture",
        `Sofascore keeper saves plus goals conceded does not equal the shots on target faced (${side}).`,
        { side },
      );
    }
  }
}

/**
 * Each player's way on and way off is checked on its own, not as a swap: when
 * two substitutions share a minute the providers sometimes pair the incoming
 * and outgoing players differently, which changes no player's minutes.
 */
function reconcileSubstitutions(
  sofa: readonly PerformanceIncident[],
  flash: readonly PerformanceIncident[],
  canonOfSofa: (id: string | null) => string | null,
  canonOfFlash: (id: string | null) => string | null,
  note: Note,
) {
  interface Move {
    readonly side: MatchSide;
    readonly role: "in" | "out";
    readonly minute: number;
    /** Canonical id, or null when the provider gave an id that is not paired, or none. */
    readonly canon: string | null;
    readonly hasId: boolean;
  }
  const moves = (
    incidents: readonly PerformanceIncident[],
    canon: (id: string | null) => string | null,
  ): Move[] =>
    incidents
      .filter((i) => i.kind === "substitution")
      .flatMap((i) =>
        (["in", "out"] as const).map((role) => {
          const who = role === "in" ? i.playerIn : i.playerOut;
          return {
            side: i.side,
            role,
            minute: i.minute,
            canon: canon(who?.externalId ?? null),
            hasId: who?.externalId != null,
          };
        }),
      );
  const sofaMoves = moves(sofa, canonOfSofa);
  const flashMoves = moves(flash, canonOfFlash);
  const inAt = new Map<string, number>();
  const outAt = new Map<string, number>();
  const broken = new Set<string>();
  /** Provider ids of substitutes who came on, whether or not they could be paired. */
  const inAtAny = new Set<string>();
  for (const i of sofa)
    if (i.kind === "substitution" && i.playerIn?.externalId)
      inAtAny.add(`sofascore:${i.playerIn.externalId}`);
  for (const i of flash)
    if (i.kind === "substitution" && i.playerIn?.externalId)
      inAtAny.add(`flashscore:${i.playerIn.externalId}`);

  const used = new Set<number>();
  const claim = (match: (f: Move) => boolean) => {
    const at = flashMoves.findIndex((f, index) => !used.has(index) && match(f));
    if (at >= 0) used.add(at);
    return at >= 0;
  };
  // Moves with a paired player first, then moves the other provider left without an id.
  const order = [...sofaMoves].sort((a, b) => Number(b.canon !== null) - Number(a.canon !== null));
  for (const s of order) {
    const found =
      s.canon !== null &&
      (claim(
        (f) =>
          f.canon === s.canon &&
          f.role === s.role &&
          f.side === s.side &&
          WITHIN(f.minute, s.minute),
      ) ||
        claim(
          (f) => !f.hasId && f.role === s.role && f.side === s.side && WITHIN(f.minute, s.minute),
        ));
    if (!found) {
      note(
        "substitution_mismatch",
        "player",
        `A Sofascore substitution (${s.role}) at minute ${s.minute} is not confirmed by Flashscore.`,
        { side: s.side },
      );
      if (s.canon !== null) broken.add(s.canon);
      continue;
    }
    if (s.canon === null) continue;
    (s.role === "in" ? inAt : outAt).set(s.canon, s.minute);
  }
  flashMoves.forEach((f, index) => {
    if (used.has(index)) return;
    note(
      "substitution_mismatch",
      "player",
      `A Flashscore substitution (${f.role}) at minute ${f.minute} is not confirmed by Sofascore.`,
      { side: f.side },
    );
    if (f.canon !== null) broken.add(f.canon);
  });
  return { inAt, outAt, broken, inAtAny };
}

interface CardCount {
  yellow: number;
  red: number;
  secondYellow: number;
  broken: boolean;
  /** Minute a red card or second yellow ended the player's match. */
  dismissedAt: number | null;
}

function reconcileCards(
  sofa: readonly PerformanceIncident[],
  flash: readonly PerformanceIncident[],
  canonOfSofa: (id: string | null) => string | null,
  canonOfFlash: (id: string | null) => string | null,
  note: Note,
) {
  const kinds = ["yellow_card", "second_yellow", "red_card"] as const;
  const out = new Map<string, CardCount>();
  const entry = (id: string): CardCount => {
    const existing = out.get(id);
    if (existing) return existing;
    const created: CardCount = {
      yellow: 0,
      red: 0,
      secondYellow: 0,
      broken: false,
      dismissedAt: null,
    };
    out.set(id, created);
    return created;
  };
  for (const kind of kinds) {
    const { paired, sofaLeft, flashLeft } = pairIncidents(
      sofa.filter((i) => i.kind === kind),
      flash.filter((i) => i.kind === kind),
      (i) => canonOfSofa(i.player?.externalId ?? null),
      (i) => canonOfFlash(i.player?.externalId ?? null),
    );
    for (const { sofa: s } of paired) {
      const id = canonOfSofa(s.player?.externalId ?? null);
      if (id === null) continue;
      const c = entry(id);
      if (kind === "yellow_card") c.yellow += 1;
      if (kind === "red_card") c.red += 1;
      if (kind === "second_yellow") c.secondYellow += 1;
      if (kind !== "yellow_card") c.dismissedAt = s.minute;
    }
    for (const lone of [...sofaLeft, ...flashLeft]) {
      const id =
        lone.provider === "sofascore"
          ? canonOfSofa(lone.player?.externalId ?? null)
          : canonOfFlash(lone.player?.externalId ?? null);
      note(
        "card_mismatch",
        "player",
        `A ${lone.provider} ${kind.replace("_", " ")} at minute ${lone.minute} has no match in the other provider.`,
        { side: lone.side },
      );
      if (id !== null) entry(id).broken = true;
    }
  }
  return out;
}

function reconcileMissedPenalties(
  sofa: readonly PerformanceIncident[],
  flash: readonly PerformanceIncident[],
  canonOfSofa: (id: string | null) => string | null,
  canonOfFlash: (id: string | null) => string | null,
  note: Note,
) {
  const { paired, sofaLeft, flashLeft } = pairIncidents(
    sofa.filter((i) => i.kind === "penalty_missed"),
    flash.filter((i) => i.kind === "penalty_missed"),
    (i) => canonOfSofa(i.player?.externalId ?? null),
    (i) => canonOfFlash(i.player?.externalId ?? null),
  );
  const byPlayer = new Map<string, number>();
  const broken = new Set<string>();
  const brokenSides = new Set<MatchSide>();
  /** Penalties missed by a side's own players, i.e. faced by the other side's keeper. */
  const against: Record<MatchSide, number> = { home: 0, away: 0 };
  for (const { sofa: s } of paired) {
    const id = canonOfSofa(s.player?.externalId ?? null);
    if (id !== null) byPlayer.set(id, (byPlayer.get(id) ?? 0) + 1);
    against[opposite(s.side)] += 1;
  }
  for (const lone of [...sofaLeft, ...flashLeft]) {
    note(
      "penalty_missed_mismatch",
      "player",
      `A ${lone.provider} missed penalty at minute ${lone.minute} has no match in the other provider.`,
      { side: lone.side },
    );
    const id =
      lone.provider === "sofascore"
        ? canonOfSofa(lone.player?.externalId ?? null)
        : canonOfFlash(lone.player?.externalId ?? null);
    if (id !== null) broken.add(id);
    brokenSides.add(lone.side);
  }
  return { byPlayer, broken, brokenSides, against };
}

interface Credit {
  count: number;
  source: string;
  unknown: boolean;
}

function reconcileAssists(
  fullCoverage: boolean,
  canonOfSofa: (id: string | null) => string | null,
  canonOfFlash: (id: string | null) => string | null,
  paired: readonly { sofa: PerformanceIncident; flash: PerformanceIncident }[],
  note: Note,
) {
  const byPlayer = new Map<string, Credit>();
  const unknownSides = new Set<MatchSide>();
  const unknownPlayers = new Set<string>();
  const credit = (id: string, source: string) => {
    const existing = byPlayer.get(id);
    if (existing) existing.count += 1;
    else byPlayer.set(id, { count: 1, source, unknown: false });
  };
  for (const { sofa: s, flash: f } of paired) {
    // A penalty has no assister.
    if (s.kind === "penalty_goal" || f.kind === "penalty_goal") continue;
    const sId = s.assist ? canonOfSofa(s.assist.externalId) : null;
    const fId = f.assist ? canonOfFlash(f.assist.externalId) : null;
    const sNamed = s.assist !== null;
    const fNamed = f.assist !== null;
    if ((sNamed && sId === null) || (fNamed && fId === null)) {
      note(
        "assist_unmatched",
        "player",
        "A named assister could not be paired between the providers.",
        { side: s.side, field: "assists" },
      );
      unknownSides.add(s.side);
      continue;
    }
    if (sNamed && fNamed) {
      if (sId === fId && sId !== null) credit(sId, "sofascore+flashscore");
      else {
        note(
          "assist_conflict",
          "player",
          "The providers name different assisters for the same goal.",
          { side: s.side, field: "assists" },
        );
        for (const id of [sId, fId]) if (id !== null) unknownPlayers.add(id);
      }
    } else if (fNamed && fId !== null) {
      // Sofascore is silent (full coverage) or unknown (limited): Flashscore alone names him.
      credit(fId, "flashscore");
    } else if (sNamed && sId !== null) {
      credit(sId, "sofascore");
    } else if (!fullCoverage) {
      // Flashscore silent and Sofascore's zero means nothing on a limited match.
      note(
        "assist_unconfirmed",
        "info",
        "No provider names an assister and Sofascore coverage is limited: whether there was none is unknown.",
        { side: s.side, field: "assists" },
      );
      unknownSides.add(s.side);
    }
  }
  return {
    byPlayer,
    unknownSides,
    unknownPlayers,
    zeroSource: fullCoverage ? "sofascore+flashscore" : "flashscore",
  };
}
