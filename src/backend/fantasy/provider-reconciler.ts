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
 * - Identity: a player is only ever Sofascore id + Flashscore id, never a name.
 *   Pairs rest on an incident both providers attribute to him, or on shirt
 *   number for a player no incident mentions (see `Basis` in provider-matching).
 * - Goals come from the incident lists of both providers. Taken in the order
 *   scored, the scorers must be the same players and both lists must add up to
 *   the final score; minutes may differ by up to 10. Otherwise the whole match
 *   goes to review and scores nothing.
 * - Cards, missed penalties and substitutions are matched per player, within 5
 *   minutes. A player the providers disagree about is held back; the match is
 *   not.
 * - Whatever a wider minute window could change (minutes played, goals
 *   conceded, clean sheet) is computed on each provider's own timeline and must
 *   come out the same on both, or the player is held back. A time difference
 *   never changes anyone's points.
 * - Saves come from Sofascore player statistics on a full-coverage match only.
 *   Otherwise they are "unknown". Nothing is derived from shots on target.
 * - On a limited-coverage Sofascore match, `goalAssist: 0` is unknown, not
 *   zero. Assists are filled from Flashscore.
 * - Sofascore ratings are display only.
 * - Reviewed identities (optional input `reviewedIdentities`): a read-only
 *   snapshot of the active, human-reviewed player mappings. Two entries mapped
 *   to the same app player are paired whatever their shirt numbers; entries
 *   mapped to different app players are never paired by a weaker signal; a pair
 *   with one mapped and one unmapped entry is NOT a reviewed identity (it keeps
 *   the legacy pairing and is labelled `partially_reviewed`). A mapping settles
 *   who a player is and nothing else: not his club on the day, his position,
 *   whether he played, or whether an event is right. Without the input the
 *   result is what it was before, with every pair labelled `unreviewed_legacy`.
 */
import type {
  LineupPosition,
  MatchSide,
  PerformanceIncident,
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
import {
  indexReviewedIdentities,
  type AppliedMapping,
  type IdentityStatus,
  type ReviewedIdentitySnapshot,
} from "./reviewed-identities";
import {
  CARD_TOLERANCE_MINUTES,
  MISSED_PENALTY_TOLERANCE_MINUTES,
  opposite,
  pairEventsByPlayer,
  pairSubstitutions,
  resolveIdentity,
  type Basis,
  type Discrepancy,
  type DiscrepancyCode,
  type GoalPair,
  type Identity,
  type MinutePair,
  type Person,
  type UnmatchedPlayer,
} from "./provider-matching";

export type { Basis, Discrepancy, DiscrepancyCode, UnmatchedPlayer };

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
  /**
   * Off by default. When the two providers number the player who scored a goal
   * differently, let the goal itself pair them (same side, same place in the
   * order scored, timed within 2 minutes). This cannot be told apart from the
   * providers genuinely disagreeing about who scored, so it is the owner's call.
   */
  readonly linkIdentityByGoal?: boolean;
  /**
   * The active reviewed mappings, `(provider, external player id) -> app player id`,
   * read by a separate reader. Read-only: the reconciler never writes it, never
   * creates a mapping or a player from it, and states the snapshot it used in
   * the result and in every evidence reference.
   */
  readonly reviewedIdentities?: ReviewedIdentitySnapshot;
}

export type PlayerMode = "full" | "simple" | "incomplete";

export interface ReconciledPlayer {
  readonly side: MatchSide;
  readonly shirtNumber: number | null;
  readonly displayName: string;
  /** Null when the player is in only one provider's lineup (the other is unusable). */
  readonly sofascoreId: string | null;
  readonly flashscoreId: string | null;
  /** What the pairing of the two providers' entries rests on. */
  readonly identity: Basis;
  /** Whether a person reviewed this identity; legacy pairs are suggestions only. */
  readonly identityStatus: IdentityStatus;
  /** The canonical app player, only when the reviewed mappings establish it; else null. */
  readonly appPlayerId: string | null;
  /** The mapping rows (id and version) behind this player's identity. */
  readonly appliedMappings: readonly AppliedMapping[];
  readonly position: LineupPosition | null;
  readonly started: boolean;
  /** Only fields that were established. A missing field is unknown, not zero. */
  readonly stats: CertifiedStats;
  readonly evidence: FieldEvidence;
  readonly mode: PlayerMode;
  /** Sofascore rating, for display only. Never scored. */
  readonly rating: number | null;
}

/**
 * `review`: nothing scored. `incomplete`: scored, but some players are held
 * back (they get no points until reviewed). `simple`: every player is scorable
 * in simple mode. `full`: every player is scorable in full mode.
 */
export type FixtureMode = "full" | "simple" | "incomplete" | "review";

export interface ReconcileResult {
  readonly mode: FixtureMode;
  /**
   * The mode the scorable players reach on their own. For `incomplete` this is
   * what the match is once the held-back players are reviewed; null for `review`.
   */
  readonly scorableMode: "full" | "simple" | null;
  /** Players who get no points until reviewed (their fields are unknown, or they could not be paired). */
  readonly heldBack: number;
  readonly players: readonly ReconciledPlayer[];
  readonly unmatched: readonly UnmatchedPlayer[];
  readonly discrepancies: readonly Discrepancy[];
  /** Which reviewed-mapping snapshot this result used; null when none was given. */
  readonly mappingSnapshot: {
    readonly digest: string;
    readonly capturedAt: string;
    readonly entries: number;
  } | null;
}

const TOLERANCE_MINUTES = 2;
/**
 * Sofascore `minutesPlayed` counts the clock, so a player taken off at minute
 * 77 shows 80 when the first half ran three minutes over. The plan's flat
 * +/- 2 minutes rejected 8 of 37 players in MAS-Zemamra on this alone. The
 * check therefore allows `minutesPlayed` to run up to this many minutes over
 * the substitution time, and only the usual 2 minutes under it.
 */
const MAX_STOPPAGE_MINUTES = 6;
/** Appearance and clean-sheet points both turn on 60 official minutes (FANTASY_RULES_V1). */
const FULL_APPEARANCE_MINUTES = 60;
const GOAL_KINDS = new Set(["goal", "penalty_goal"]);
/** An unknown label that mentions one of these could change a score. */
const SCORE_RELEVANT = /goal|card|penalt|red|yellow|own/i;
const BOTH = "sofascore+flashscore";

const APP_POSITION: Record<LineupPosition, FantasyPosition> = {
  G: "GK",
  D: "DEF",
  M: "MID",
  F: "FWD",
};

const minutesAgree = (observed: number, computed: number) =>
  observed - computed >= -TOLERANCE_MINUTES && observed - computed <= MAX_STOPPAGE_MINUTES;
const bracket = (minutes: number) =>
  minutes === 0 ? 0 : minutes >= FULL_APPEARANCE_MINUTES ? 2 : 1;

export function reconcileMatch(input: ReconcileInput): ReconcileResult {
  const discrepancies: Discrepancy[] = [];
  const note = (
    code: DiscrepancyCode,
    level: Discrepancy["level"],
    message: string,
    where: { side?: MatchSide | null; shirtNumber?: number | null; field?: string | null } = {},
  ) => {
    discrepancies.push({
      code,
      level,
      message,
      side: where.side ?? null,
      shirtNumber: where.shirtNumber ?? null,
      field: where.field ?? null,
    });
  };
  const reviewedIndex = input.reviewedIdentities
    ? indexReviewedIdentities(input.reviewedIdentities)
    : null;
  const mappingSnapshot: ReconcileResult["mappingSnapshot"] = input.reviewedIdentities
    ? {
        digest: input.reviewedIdentities.digest,
        capturedAt: input.reviewedIdentities.capturedAt,
        entries: input.reviewedIdentities.entries.length,
      }
    : null;
  const review = (unmatched: readonly UnmatchedPlayer[] = []): ReconcileResult => ({
    mode: "review",
    scorableMode: null,
    heldBack: 0,
    players: [],
    unmatched,
    discrepancies,
    mappingSnapshot,
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
        { side: incident.side },
      );
    }
  }

  // ---- both goal lists add up to the final score -----------------------------
  const sofaGoals = sofascore.incidents.filter((i) => GOAL_KINDS.has(i.kind));
  const flashGoals = flashscore.incidents.filter((i) => GOAL_KINDS.has(i.kind));
  for (const [name, goals] of [
    ["Sofascore", sofaGoals],
    ["Flashscore", flashGoals],
  ] as const) {
    for (const side of ["home", "away"] as const) {
      const expected = side === "home" ? homeScore : awayScore;
      if (goals.filter((g) => g.side === side).length !== expected) {
        note(
          "score_mismatch",
          "fixture",
          `${name}'s ${side} goals do not add up to the final score.`,
          {
            side,
          },
        );
      }
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
  checkSavesIdentity(sofascore, homeScore, awayScore, note);

  // ---- identity, goals in order ----------------------------------------------
  const identity = resolveIdentity(
    sofascore.lineups,
    flashscore.lineups,
    sofaGoals,
    flashGoals,
    note,
    input.linkIdentityByGoal === true,
    reviewedIndex,
  );
  if (discrepancies.some((d) => d.level === "fixture")) return review(identity.unmatched);

  // ---- the rest, per player -------------------------------------------------
  const subs = pairSubstitutions(sofascore.incidents, flashscore.incidents, identity, note);
  const cards = pairEventsByPlayer(
    ["yellow_card", "second_yellow", "red_card"],
    sofascore.incidents,
    flashscore.incidents,
    identity,
    CARD_TOLERANCE_MINUTES,
  );
  const missed = pairEventsByPlayer(
    ["penalty_missed"],
    sofascore.incidents,
    flashscore.incidents,
    identity,
    MISSED_PENALTY_TOLERANCE_MINUTES,
  );
  const assists = reconcileAssists(sofascore.lineups.fullCoverage, identity, note);

  // A side's lone incident (a player neither lineup pairing knows) cannot be
  // attributed, so players supplied by one provider alone on that side cannot be
  // cleared of it.
  const loneSides = (list: readonly PerformanceIncident[]) => new Set(list.map((i) => i.side));
  const loneCards = loneSides(cards.lone);
  const loneMissed = loneSides(missed.lone);
  for (const lone of [...cards.lone, ...missed.lone]) {
    note(
      lone.kind === "penalty_missed" ? "penalty_missed_mismatch" : "card_mismatch",
      "player",
      `A ${lone.provider} ${lone.kind.replace(/_/g, " ")} at minute ${lone.minute} is by a player the lineups do not pair.`,
      { side: lone.side },
    );
  }
  const missedBySide: Record<MatchSide, number> = { home: 0, away: 0 };
  for (const i of [...sofascore.incidents, ...flashscore.incidents]) {
    if (i.kind === "penalty_missed") missedBySide[i.side] += 1;
  }
  const concededBy: Record<MatchSide, MinutePair[]> = { home: [], away: [] };
  for (const g of identity.goalPairs) {
    concededBy[opposite(g.side)].push({ sofa: g.sofa.minute, flash: g.flash.minute });
  }
  const goalsBy = new Map<string, number>();
  for (const g of identity.goalPairs) goalsBy.set(g.key, (goalsBy.get(g.key) ?? 0) + 1);

  for (const g of identity.goalPairs) {
    if ((g.sofa.kind === "penalty_goal") !== (g.flash.kind === "penalty_goal")) {
      note(
        "penalty_label_differs",
        "info",
        "The providers label this goal differently as a penalty (Flashscore marks penalties explicitly). It scores as a goal either way.",
        { side: g.side },
      );
    }
  }
  const confirmed = new Set(identity.confirmedByIncident);
  const players: ReconciledPlayer[] = [];
  for (const person of identity.people) {
    const { sofa, flash, side } = person;
    const key = person.key;
    const only = person.only;
    const source = only ?? BOTH;
    const lead = sofa ?? flash;
    if (!lead) continue;
    const position = sofa?.position ?? flash?.position ?? null;
    const started = sofa ? sofa.starter : (flash?.starter ?? false);
    const shirt = sofa?.shirtNumber ?? flash?.shirtNumber ?? null;
    const where = { side, shirtNumber: shirt };

    const stats: { -readonly [K in ScoringField]?: CertifiedStats[K] } = {};
    const proof: { -readonly [K in ScoringField]?: FieldEvidence[K] } = {};
    const extraRefs: string[] = [];
    const evidence = (state: EvidenceState, from: string): FieldEvidence[ScoringField] => ({
      state,
      source: from,
      observedAt: input.observedAt,
      references: [
        `sofascore:${sofascore.summary.externalId}`,
        `flashscore:${flashscore.summary.externalId}`,
        ...(input.digests?.sofascore ? [`sha256:${input.digests.sofascore}`] : []),
        ...(input.digests?.flashscore ? [`sha256:${input.digests.flashscore}`] : []),
        ...extraRefs,
      ],
    });
    const set = <K extends ScoringField>(
      field: K,
      value: CertifiedStats[K],
      state: EvidenceState,
      from: string,
    ) => {
      if (value !== undefined) stats[field] = value;
      proof[field] = evidence(state, from);
    };
    const unknown = <K extends ScoringField>(field: K, from: string) => {
      proof[field] = evidence("unknown", from);
    };
    const fallback = identity.fallbackSides.get(side);
    if (fallback) extraRefs.push(`lineup-fallback-side:${side}:${fallback}`);
    if (input.reviewedIdentities) {
      extraRefs.push(`mapping-snapshot:sha256:${input.reviewedIdentities.digest}`);
      for (const m of person.applied) {
        extraRefs.push(`mapping:${m.provider}:${m.externalId}:${m.mappingId}`);
      }
      extraRefs.push(`identity-status:${person.status}`);
    }
    if (only) {
      extraRefs.push(
        `lineup-used-alone:${only}:${side}`,
        `other-lineup-broken:${only === "sofascore" ? "flashscore" : "sofascore"}`,
      );
    }

    // identity basis
    const eventsOf = (map: Map<string, Map<string, { pairs: readonly MinutePair[] }>>) =>
      map.get(key);
    const usedInIncident =
      identity.confirmedByIncident.has(key) ||
      [...(eventsOf(cards.byKey)?.values() ?? [])].some((e) => e.pairs.length > 0) ||
      [...(eventsOf(missed.byKey)?.values() ?? [])].some((e) => e.pairs.length > 0) ||
      subs.inAt.has(key) ||
      subs.outAt.has(key) ||
      assists.credited.has(key);
    if (usedInIncident && !only) confirmed.add(key);
    const basis: Basis = only
      ? "single_source"
      : person.status === "reviewed_pair"
        ? "reviewed_mapping"
        : usedInIncident
          ? "incident"
          : "shirt";
    if (basis === "shirt") extraRefs.push("identity:shirt-only");

    // goals, own goals
    set("goals", goalsBy.get(key) ?? 0, "verified", source);
    // Any label that could hide an own goal already sent the match to review.
    set("ownGoals", 0, "verified", source);

    // cards
    const cardEvents = eventsOf(cards.byKey);
    const cardBroken =
      [...(cardEvents?.values() ?? [])].some((e) => (e as { broken?: boolean }).broken === true) ||
      (only !== null && loneCards.has(side));
    const cardPairs = (kind: string): readonly MinutePair[] =>
      (cardEvents?.get(kind) as { pairs: readonly MinutePair[] } | undefined)?.pairs ?? [];
    if (cardBroken) {
      for (const f of ["yellowCards", "redCards", "secondYellowDismissals"] as const) {
        unknown(f, source);
      }
      note("card_mismatch", "player", "The providers disagree on this player's cards.", where);
    } else {
      set("yellowCards", cardPairs("yellow_card").length, "verified", source);
      set("redCards", cardPairs("red_card").length, "verified", source);
      set("secondYellowDismissals", cardPairs("second_yellow").length, "verified", source);
    }
    const dismissals = [...cardPairs("red_card"), ...cardPairs("second_yellow")].sort(
      (a, b) => a.sofa - b.sofa,
    );
    const dismissed: MinutePair | null = dismissals[0] ?? null;

    // minutes, clean sheet, goals conceded: on each provider's own timeline
    const subIn = subs.inAt.get(key) ?? null;
    const subOut = subs.outAt.get(key) ?? null;
    const starterConflict = sofa !== null && flash !== null && sofa.starter !== flash.starter;
    const timelineBroken =
      subs.broken.has(key) ||
      cardBroken ||
      starterConflict ||
      (only !== null && subs.loneSides.has(side));
    const appeared = started || subIn !== null;
    const outcome = (() => {
      if (timelineBroken) {
        if (starterConflict) {
          note(
            "substitution_mismatch",
            "player",
            "The providers disagree on whether he started.",
            where,
          );
        }
        return null;
      }
      const run = (t: "sofa" | "flash") => {
        const exits = [subOut?.[t] ?? null, dismissed?.[t] ?? null].filter(
          (m): m is number => m !== null,
        );
        return deriveParticipation({
          complete: true,
          orderingVerified: true,
          appeared,
          started,
          enteredAt: started ? null : (subIn?.[t] ?? null),
          exitedAt: appeared && exits.length > 0 ? Math.min(...exits) : null,
          concededAt: concededBy[side].map((m) => m[t]),
        });
      };
      try {
        const timelines = (
          only === "flashscore" ? ["flash"] : only === "sofascore" ? ["sofa"] : ["sofa", "flash"]
        ).map((t) => run(t as "sofa" | "flash"));
        const [first, second] = timelines;
        if (!first) return null;
        if (
          second &&
          (bracket(first.minutes) !== bracket(second.minutes) ||
            first.goalsConceded !== second.goalsConceded ||
            first.cleanSheet !== second.cleanSheet)
        ) {
          note(
            "timeline_disagrees",
            "player",
            "The providers' times put him on a different side of a scoring line (60 minutes, a goal conceded).",
            where,
          );
          return null;
        }
        if (second && second.minutes !== first.minutes) {
          note(
            "minutes_differ",
            "info",
            "The providers' times differ slightly; points are the same either way.",
            where,
          );
        }
        return first;
      } catch {
        note(
          "participation_ambiguous",
          "player",
          "A goal falls on the same minute as a substitution or dismissal.",
          where,
        );
        return null;
      }
    })();
    if (outcome === null) {
      for (const f of ["minutes", "cleanSheet", "goalsConceded"] as const) unknown(f, source);
    } else {
      // Sofascore's own minutes are a second check where the player is in its lineup.
      const start = started ? 0 : (subIn?.sofa ?? 0);
      const played = sofa?.stats?.minutesPlayed ?? null;
      const observed =
        sofa === null
          ? null
          : played === null
            ? appeared
              ? null
              : 0
            : Math.min(played, 90 - start);
      if (
        sofa !== null &&
        (observed === null || !minutesAgree(observed, appeared ? outcome.minutes : 0))
      ) {
        note(
          "minutes_mismatch",
          "player",
          observed === null
            ? "Sofascore gives no minutes to check the substitution times against."
            : "Sofascore minutes disagree with the substitution times.",
          where,
        );
        for (const f of ["minutes", "cleanSheet", "goalsConceded"] as const) unknown(f, source);
      } else {
        set("minutes", outcome.minutes, "verified", source);
        set("goalsConceded", outcome.goalsConceded, "verified", source);
        set("cleanSheet", outcome.cleanSheet, "verified", source);
      }
    }

    // assists
    const credit = assists.credited.get(key);
    if (credit && !assists.unknownPlayers.has(key)) {
      set("assists", credit.count, "verified", credit.source);
    } else if (!credit && !assists.unknownSides.has(side) && !assists.unknownPlayers.has(key)) {
      set("assists", 0, "verified", assists.zeroSource);
    } else {
      unknown("assists", assists.zeroSource);
    }

    // penalties missed
    const missedEvents = eventsOf(missed.byKey)?.get("penalty_missed") as
      | { pairs: readonly MinutePair[]; broken?: boolean }
      | undefined;
    if (missedEvents?.broken || (only !== null && loneMissed.has(side))) {
      unknown("penaltiesMissed", source);
      note(
        "penalty_missed_mismatch",
        "player",
        "The providers disagree on his missed penalties.",
        where,
      );
    } else set("penaltiesMissed", missedEvents?.pairs.length ?? 0, "verified", source);

    // goalkeeper-only fields
    if (person.positionConflict) {
      // A reviewed mapping settles who he is, not his position: one provider says
      // goalkeeper, the other says outfield. Nothing keeper-specific is scored.
      unknown("saves", "sofascore");
      unknown("penaltiesSaved", source);
      note(
        "position_conflict",
        "player",
        "The providers disagree about whether he is a goalkeeper; his position-dependent fields are held back.",
        where,
      );
    } else if (position === "G") {
      const saves = sofascore.lineups.fullCoverage ? (sofa?.stats?.saves ?? null) : null;
      if (saves !== null) set("saves", saves, "verified", "sofascore");
      // A keeper who never came on made no saves, and the lineups say so.
      else if (!appeared && outcome !== null) set("saves", 0, "verified", source);
      else unknown("saves", "sofascore");
      // Only an incident that says a keeper saved counts, and none has been seen.
      // A missed penalty against this keeper's team may or may not have been a save.
      if (appeared && missedBySide[opposite(side)] > 0) {
        unknown("penaltiesSaved", source);
        note(
          "penalty_saved_unknown",
          "player",
          "A penalty was missed against this keeper's team; no incident says whether he saved it.",
          where,
        );
      } else set("penaltiesSaved", 0, "verified", source);
    }

    players.push({
      side,
      shirtNumber: shirt,
      displayName: lead.name,
      sofascoreId: sofa?.externalId ?? null,
      flashscoreId: flash?.externalId ?? null,
      identity: basis,
      identityStatus: person.status,
      appPlayerId: person.appPlayerId,
      appliedMappings: person.applied,
      position,
      started,
      stats,
      evidence: proof,
      mode: playerMode(stats, proof, person.positionConflict ? "G" : position),
      rating: sofa?.stats?.rating ?? null,
    });
  }

  // A player who appeared but could not be paired is held back.
  // A broken lineup's leftover entries cannot hold anyone back: the other
  // provider's lineup is already used for that side.
  const playedUnmatched = identity.unmatched.filter(
    (u) =>
      (u.starter || subs.cameOn.has(`${u.provider}:${u.providerId}`)) &&
      identity.fallbackSides.get(u.side) !==
        (u.provider === "sofascore" ? "flashscore" : "sofascore"),
  );
  for (const u of playedUnmatched) {
    note(
      "unmatched_player",
      "player",
      `A ${u.provider} player who appeared could not be paired (${u.reason}).`,
      { side: u.side, shirtNumber: u.shirtNumber },
    );
  }

  const scorable = players.filter((p) => p.mode !== "incomplete");
  const heldBack = players.length - scorable.length + playedUnmatched.length;
  const scorableMode = scorable.every((p) => p.mode === "full") ? "full" : "simple";
  return {
    mode: heldBack > 0 ? "incomplete" : scorableMode,
    scorableMode,
    heldBack,
    players,
    unmatched: identity.unmatched,
    discrepancies,
    mappingSnapshot,
  };
}

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

function checkSavesIdentity(
  sofa: ProviderMatchData,
  homeScore: number,
  awayScore: number,
  note: (
    code: DiscrepancyCode,
    level: Discrepancy["level"],
    message: string,
    where?: { side?: MatchSide | null },
  ) => void,
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
    ) {
      continue;
    }
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

interface Credit {
  count: number;
  source: string;
}

function reconcileAssists(
  fullCoverage: boolean,
  identity: Identity,
  note: (
    code: DiscrepancyCode,
    level: Discrepancy["level"],
    message: string,
    where?: { side?: MatchSide | null; field?: string | null },
  ) => void,
) {
  const credited = new Map<string, Credit>();
  const unknownSides = new Set<MatchSide>();
  const unknownPlayers = new Set<string>();
  const credit = (key: string, source: string) => {
    const existing = credited.get(key);
    if (existing) existing.count += 1;
    else credited.set(key, { count: 1, source });
  };
  for (const pair of identity.goalPairs as readonly GoalPair[]) {
    const { sofa: s, flash: f, side } = pair;
    // A penalty has no assister.
    if (s.kind === "penalty_goal" || f.kind === "penalty_goal") continue;
    const sKey = s.assist ? identity.keyOfSofaId(s.assist.externalId) : null;
    const fKey = f.assist ? identity.keyOfFlashId(f.assist.externalId) : null;
    const sNamed = s.assist !== null;
    const fNamed = f.assist !== null;
    if ((sNamed && sKey === null) || (fNamed && fKey === null)) {
      note(
        "assist_unmatched",
        "player",
        "A named assister could not be paired between the providers.",
        {
          side,
          field: "assists",
        },
      );
      unknownSides.add(side);
      continue;
    }
    if (sNamed && fNamed) {
      if (sKey === fKey && sKey !== null) credit(sKey, BOTH);
      else {
        note(
          "assist_conflict",
          "player",
          "The providers name different assisters for the same goal.",
          {
            side,
            field: "assists",
          },
        );
        for (const key of [sKey, fKey]) if (key !== null) unknownPlayers.add(key);
      }
    } else if (fNamed && fKey !== null) {
      // Sofascore is silent (full coverage) or unknown (limited): Flashscore alone names him.
      credit(fKey, "flashscore");
    } else if (sNamed && sKey !== null) {
      credit(sKey, "sofascore");
    } else if (!fullCoverage) {
      // Flashscore silent and Sofascore's zero means nothing on a limited match.
      note(
        "assist_unconfirmed",
        "info",
        "No provider names an assister and Sofascore coverage is limited: whether there was none is unknown.",
        { side, field: "assists" },
      );
      unknownSides.add(side);
    }
  }
  return {
    credited,
    unknownSides,
    unknownPlayers,
    zeroSource: fullCoverage ? BOTH : "flashscore",
  };
}

export type { Person };
