/**
 * Flashscore -> app player bridge suggestions, derived in memory from the
 * already-reviewed Sofascore identities. This is evidence for a human reviewer,
 * not a mapping and not a proposal: nothing here writes, creates or approves
 * anything, and no Flashscore id becomes an app player because of it.
 *
 * Pure: no database, no network, no clock. No name is read or compared anywhere
 * in this file (a lineup entry's name is never touched), so a name cannot
 * influence a suggestion.
 *
 * A Flashscore entry F is suggested as the app player of a reviewed Sofascore
 * entry S only when the evidence is independent and unambiguous:
 * - the two are on the same side of the same finished match, and
 * - at least one match EVENT (goal scored, goal assisted, card, substitution)
 *   aligns S with F: same side, same kind, minutes within the reconciler's
 *   tolerance, and no other entry competes for the same event; and
 * - either the shirt numbers agree (a second, independent signal) or at least
 *   two different events align the same pair; and
 * - nothing contradicts it: no event aligns either of them to someone else, no
 *   position conflict, no second candidate, no other Flashscore entry for the
 *   same app player in the fixture.
 * Shirt number plus club plus position alone is NOT a bridge. One goal or one
 * substitution alone is NOT a bridge. A provisional pairing is never used as
 * proof of itself: every counted event is aligned from minutes and sides alone,
 * never from another pairing.
 *
 * What a bridge does not establish: the player's club on the match date, his
 * position, whether he took part, or that any event is right.
 */
import type {
  MatchSide,
  PerformanceIncident,
  PerformanceLineupPlayer,
} from "../football/provider/performance-contracts";
import {
  CARD_TOLERANCE_MINUTES,
  GOAL_ORDER_TOLERANCE_MINUTES,
  SUBSTITUTION_TOLERANCE_MINUTES,
  keeperConflict,
} from "./provider-matching";
import type { ProviderMatchData } from "./provider-reconciler";
import { indexReviewedIdentities, type ReviewedIdentitySnapshot } from "./reviewed-identities";

export type BridgeSignal =
  | "goal_scored"
  | "goal_assisted"
  | "yellow_card"
  | "second_yellow"
  | "red_card"
  | "substitution_in"
  | "substitution_out";

export interface IncidentReference {
  readonly provider: "sofascore" | "flashscore";
  readonly fixtureId: string;
  readonly kind: string;
  readonly rawType: string;
  readonly minute: number;
  readonly side: MatchSide;
}

export interface BridgeEvent {
  readonly signal: BridgeSignal;
  readonly sofascore: IncidentReference;
  readonly flashscore: IncidentReference;
}

export type BridgeUnresolvedReason =
  | "sofascore_partner_not_reviewed"
  | "no_event_alignment_shirt_only"
  | "single_event_shirt_disagrees"
  | "no_candidate"
  | "ambiguous_candidates"
  | "contradicting_event"
  | "position_conflict"
  | "app_player_claimed_twice"
  | "fixture_not_verified";

export interface BridgeFixtureRef {
  readonly sofascoreFixtureId: string;
  readonly flashscoreFixtureId: string;
  readonly side: MatchSide;
}

export type BridgePriority =
  | "scorer"
  | "assister"
  | "goalkeeper"
  | "carded"
  | "substituted"
  | "started"
  | "in_locked_squad"
  | "blocks_fixture";

/** What one verified match contributes to a suggestion. */
export interface BridgeFixtureEvidence {
  readonly fixture: BridgeFixtureRef;
  readonly shirtAgrees: boolean;
  /** Distinct events only: copies of one incident are counted once. */
  readonly events: readonly BridgeEvent[];
  readonly priority: readonly BridgePriority[];
}

export interface BridgeSuggestion {
  readonly flashscoreId: string;
  readonly sofascoreId: string;
  readonly appPlayerId: string;
  /** The reviewed Sofascore mapping row (and version) the suggestion rests on. */
  readonly sofascoreMapping: { readonly mappingId: string; readonly version: string | null };
  /** One entry per verified match, in a stable order. */
  readonly evidence: readonly BridgeFixtureEvidence[];
  readonly priority: readonly BridgePriority[];
  /** What this evidence cannot show. Always non-empty. */
  readonly confidenceLimits: readonly string[];
}

export interface BridgeUnresolved {
  readonly flashscoreId: string;
  readonly fixture: BridgeFixtureRef;
  readonly reason: BridgeUnresolvedReason;
  /** Sofascore entries that had some signal with this entry (ids only). */
  readonly alternatives: readonly string[];
  readonly events: readonly BridgeEvent[];
  readonly priority: readonly BridgePriority[];
  readonly detail: string;
}

/** The match pair, confirmed from committed evidence, that the bridge may be used for. */
export interface BridgeFixtureLink {
  readonly sofascoreFixtureId: string;
  readonly flashscoreFixtureId: string;
}

export interface BridgeFixtureInput {
  readonly link: BridgeFixtureLink;
  readonly sofascore: ProviderMatchData;
  readonly flashscore: ProviderMatchData;
  /** Locked-squad app player ids, for ranking only. */
  readonly lockedSquadAppPlayerIds?: ReadonlySet<string>;
}

/**
 * Two identities that cannot both be right. Neither is suggested, and no winner
 * is chosen, so the result never depends on the order the matches were given in.
 */
export interface BridgeConflict {
  readonly kind: "flashscore_id_two_app_players" | "app_player_two_flashscore_ids";
  readonly flashscoreIds: readonly string[];
  readonly appPlayerIds: readonly string[];
  readonly fixtures: readonly BridgeFixtureRef[];
}

export interface BridgeRejectedFixture {
  readonly link: BridgeFixtureLink;
  readonly reasons: readonly string[];
}

export interface BridgeReviewSet {
  readonly snapshotDigest: string;
  readonly suggestions: readonly BridgeSuggestion[];
  readonly conflicts: readonly BridgeConflict[];
  readonly unresolved: readonly BridgeUnresolved[];
  readonly rejectedFixtures: readonly BridgeRejectedFixture[];
  readonly summary: {
    readonly flashscoreEntriesAppeared: number;
    readonly suggested: number;
    readonly conflicts: number;
    readonly unresolved: number;
    readonly unresolvedByReason: Readonly<Record<string, number>>;
    readonly suggestionsByPriority: Readonly<Record<string, number>>;
  };
}

const LIMITS: readonly string[] = [
  "Evidence from one finished match only; no second match confirms it.",
  "Both providers' data can be wrong in the same way; this is not an independent third source.",
  "Shows who the player is, not his club on the match date, his position, or that his events are right.",
  "A person must review it; it is not a mapping until proposed, approved and executed.",
];

const LIMITS_MULTI: readonly string[] = [
  "Evidence from more than one finished match, all read from the same two providers.",
  "Both providers' data can be wrong in the same way; this is not an independent third source.",
  "Shows who the player is, not his club on a match date, his position, or that his events are right.",
  "A person must review it; it is not a mapping until proposed, approved and executed.",
];

const within = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;
const GOAL_KINDS = new Set(["goal", "penalty_goal"]);
const CARD_KINDS = ["yellow_card", "second_yellow", "red_card"] as const;

const ref = (i: PerformanceIncident, fixtureId: string): IncidentReference => ({
  provider: i.provider,
  fixtureId,
  kind: i.kind,
  rawType: i.rawType,
  minute: i.minute,
  side: i.side,
});

const byMinute = <T extends { minute: number }>(list: readonly T[]): T[] =>
  list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.minute - b.item.minute || a.index - b.index)
    .map((x) => x.item);

/** Which sofascore/flashscore ids an event aligns, with the signal kind. */
interface Alignment {
  readonly sId: string;
  readonly fId: string;
  readonly event: BridgeEvent;
}

function alignGoals(
  sofa: ProviderMatchData,
  flash: ProviderMatchData,
  sofaFixtureId: string,
  flashFixtureId: string,
): Alignment[] {
  const out: Alignment[] = [];
  for (const side of ["home", "away"] as const) {
    const sg = byMinute(sofa.incidents.filter((i) => GOAL_KINDS.has(i.kind) && i.side === side));
    const fg = byMinute(flash.incidents.filter((i) => GOAL_KINDS.has(i.kind) && i.side === side));
    // Aligned by order only when both providers list the same number of goals.
    if (sg.length !== fg.length) continue;
    sg.forEach((s, index) => {
      const f = fg[index];
      if (!f || !within(s.minute, f.minute, GOAL_ORDER_TOLERANCE_MINUTES)) return;
      const sRef = ref(s, sofaFixtureId);
      const fRef = ref(f, flashFixtureId);
      if (s.player?.externalId && f.player?.externalId) {
        out.push({
          sId: s.player.externalId,
          fId: f.player.externalId,
          event: { signal: "goal_scored", sofascore: sRef, flashscore: fRef },
        });
      }
      // A penalty has no assister.
      if (s.kind === "penalty_goal" || f.kind === "penalty_goal") return;
      if (s.assist?.externalId && f.assist?.externalId) {
        out.push({
          sId: s.assist.externalId,
          fId: f.assist.externalId,
          event: { signal: "goal_assisted", sofascore: sRef, flashscore: fRef },
        });
      }
    });
  }
  return out;
}

/** Cards: one Flashscore card of the same kind and side near the minute, and no other competing. */
function alignCards(
  sofa: ProviderMatchData,
  flash: ProviderMatchData,
  sofaFixtureId: string,
  flashFixtureId: string,
): Alignment[] {
  const out: Alignment[] = [];
  for (const kind of CARD_KINDS) {
    for (const side of ["home", "away"] as const) {
      const sc = sofa.incidents.filter((i) => i.kind === kind && i.side === side);
      const fc = flash.incidents.filter((i) => i.kind === kind && i.side === side);
      for (const s of sc) {
        const near = fc.filter((f) => within(s.minute, f.minute, CARD_TOLERANCE_MINUTES));
        const back = near[0]
          ? sc.filter((x) => within(x.minute, near[0]?.minute ?? 0, CARD_TOLERANCE_MINUTES))
          : [];
        const f = near[0];
        // Unique both ways, else the minute alone cannot tell who is who.
        if (near.length !== 1 || back.length !== 1 || !f) continue;
        if (!s.player?.externalId || !f.player?.externalId) continue;
        out.push({
          sId: s.player.externalId,
          fId: f.player.externalId,
          event: {
            signal: kind,
            sofascore: ref(s, sofaFixtureId),
            flashscore: ref(f, flashFixtureId),
          },
        });
      }
    }
  }
  return out;
}

function alignSubstitutions(
  sofa: ProviderMatchData,
  flash: ProviderMatchData,
  sofaFixtureId: string,
  flashFixtureId: string,
): Alignment[] {
  const out: Alignment[] = [];
  const moves = (data: ProviderMatchData) =>
    data.incidents
      .filter((i) => i.kind === "substitution")
      .flatMap((i) =>
        (["in", "out"] as const).map((role) => ({
          incident: i,
          role,
          id: (role === "in" ? i.playerIn : i.playerOut)?.externalId ?? null,
        })),
      );
  const sm = moves(sofa);
  const fm = moves(flash);
  for (const role of ["in", "out"] as const) {
    for (const side of ["home", "away"] as const) {
      const sr = sm.filter((m) => m.role === role && m.incident.side === side);
      const fr = fm.filter((m) => m.role === role && m.incident.side === side);
      for (const s of sr) {
        const near = fr.filter((f) =>
          within(s.incident.minute, f.incident.minute, SUBSTITUTION_TOLERANCE_MINUTES),
        );
        const f = near[0];
        const back = f
          ? sr.filter((x) =>
              within(x.incident.minute, f.incident.minute, SUBSTITUTION_TOLERANCE_MINUTES),
            )
          : [];
        // Unique both ways: two substitutions close together cannot be told apart by minute.
        if (near.length !== 1 || back.length !== 1 || !f || !s.id || !f.id) continue;
        out.push({
          sId: s.id,
          fId: f.id,
          event: {
            signal: role === "in" ? "substitution_in" : "substitution_out",
            sofascore: ref(s.incident, sofaFixtureId),
            flashscore: ref(f.incident, flashFixtureId),
          },
        });
      }
    }
  }
  return out;
}

/** Kickoff times of one match, as the two providers give them, may differ by at most this. */
const KICKOFF_TOLERANCE_MS = 3 * 60 * 60 * 1000;

/**
 * Whether these two payloads are the same finished match, from evidence the
 * bridge can check: the confirmed link ids, both finished, the same final
 * score, the same kickoff, and incident lists that add up to that score on each
 * side. A team or player name is never used. Events from two arbitrary matches
 * that happen to be similarly timed fail this and are never aligned.
 */
export function verifyBridgeFixture(input: BridgeFixtureInput): string[] {
  const { sofascore: sofa, flashscore: flash, link } = input;
  const reasons: string[] = [];
  if (sofa.summary.externalId !== link.sofascoreFixtureId) {
    reasons.push("The Sofascore payload is not the linked Sofascore fixture.");
  }
  if (flash.summary.externalId !== link.flashscoreFixtureId) {
    reasons.push("The Flashscore payload is not the linked Flashscore fixture.");
  }
  if (!sofa.summary.finished || !flash.summary.finished) {
    reasons.push("A provider does not report the match as finished.");
  }
  const { homeScore, awayScore } = sofa.summary;
  if (
    homeScore === null ||
    awayScore === null ||
    homeScore !== flash.summary.homeScore ||
    awayScore !== flash.summary.awayScore
  ) {
    reasons.push("The two providers do not give the same final score.");
  } else {
    for (const [name, data] of [
      ["Sofascore", sofa],
      ["Flashscore", flash],
    ] as const) {
      // An own goal raises the benefiting side's score but is not a goal or
      // penalty_goal incident: both adapters return it as `unknown`. So the known
      // goals for a side can never exceed its score, and any shortfall must be
      // covered by `unknown` incidents (each own goal is one). Requiring exact
      // equality would reject every finished match that contains one.
      let shortfall = 0;
      let tooMany = false;
      for (const side of ["home", "away"] as const) {
        const score = side === "home" ? homeScore : awayScore;
        const goals = data.incidents.filter((i) => GOAL_KINDS.has(i.kind) && i.side === side);
        if (goals.length > score) tooMany = true;
        else shortfall += score - goals.length;
      }
      const unknowns = data.incidents.filter((i) => i.kind === "unknown").length;
      if (tooMany || shortfall > unknowns) {
        reasons.push(`${name}'s goals do not add up to the final score.`);
      }
    }
  }
  const kickoffs = [Date.parse(sofa.summary.kickoffAt), Date.parse(flash.summary.kickoffAt)];
  if (
    kickoffs.some((t) => Number.isNaN(t)) ||
    Math.abs((kickoffs[0] ?? 0) - (kickoffs[1] ?? 0)) > KICKOFF_TOLERANCE_MS
  ) {
    reasons.push("The two providers do not give the same kickoff.");
  }
  return reasons;
}

/** One event aligned from one real incident however many times it was listed. */
const eventKey = (e: BridgeEvent) => JSON.stringify([e.signal, e.sofascore, e.flashscore]);

const distinct = (events: readonly BridgeEvent[]): BridgeEvent[] => {
  const seen = new Map<string, BridgeEvent>();
  for (const e of events) if (!seen.has(eventKey(e))) seen.set(eventKey(e), e);
  return [...seen.values()].sort((a, b) => (eventKey(a) < eventKey(b) ? -1 : 1));
};

interface FixtureCandidate {
  readonly flashscoreId: string;
  readonly sofascoreId: string;
  readonly appPlayerId: string;
  readonly mapping: { readonly mappingId: string; readonly version: string | null };
  readonly evidence: BridgeFixtureEvidence;
}

/** Bridge candidates for ONE finished match, or the reasons it cannot be used. */
export function bridgeFixture(
  input: BridgeFixtureInput,
  snapshot: ReviewedIdentitySnapshot,
): {
  candidates: FixtureCandidate[];
  unresolved: BridgeUnresolved[];
  appeared: number;
  rejected: BridgeRejectedFixture | null;
} {
  const { sofascore: sofa, flashscore: flash } = input;
  const problems = verifyBridgeFixture(input);
  if (problems.length > 0) {
    return {
      candidates: [],
      unresolved: [],
      appeared: 0,
      rejected: { link: input.link, reasons: problems },
    };
  }
  const index = indexReviewedIdentities(snapshot);
  const sId = sofa.summary.externalId;
  const fId = flash.summary.externalId;
  const squad = input.lockedSquadAppPlayerIds ?? new Set<string>();

  const alignments = [
    ...alignGoals(sofa, flash, sId, fId),
    ...alignCards(sofa, flash, sId, fId),
    ...alignSubstitutions(sofa, flash, sId, fId),
  ];

  const sofaById = new Map(sofa.lineups.players.map((p) => [p.externalId, p]));
  const cameOn = new Set(
    flash.incidents
      .filter((i) => i.kind === "substitution" && i.playerIn?.externalId)
      .map((i) => i.playerIn?.externalId as string),
  );

  // Events per (sofascore id, flashscore id), and every partner an entry was aligned to.
  const rawPairEvents = new Map<string, BridgeEvent[]>();
  const sPartners = new Map<string, Set<string>>();
  const fPartners = new Map<string, Set<string>>();
  for (const a of alignments) {
    const key = `${a.sId}|${a.fId}`;
    rawPairEvents.set(key, [...(rawPairEvents.get(key) ?? []), a.event]);
    sPartners.set(a.sId, (sPartners.get(a.sId) ?? new Set()).add(a.fId));
    fPartners.set(a.fId, (fPartners.get(a.fId) ?? new Set()).add(a.sId));
  }
  // Two copies of one incident are one event, never corroboration of each other.
  const pairEvents = new Map<string, BridgeEvent[]>(
    [...rawPairEvents.entries()].map(([key, events]) => [key, distinct(events)]),
  );

  const shirtCount = (list: readonly PerformanceLineupPlayer[], side: MatchSide, shirt: number) =>
    list.filter((p) => p.side === side && p.shirtNumber === shirt).length;
  const shirtAgrees = (s: PerformanceLineupPlayer, f: PerformanceLineupPlayer) =>
    s.side === f.side &&
    s.shirtNumber !== null &&
    s.shirtNumber === f.shirtNumber &&
    shirtCount(sofa.lineups.players, s.side, s.shirtNumber) === 1 &&
    shirtCount(flash.lineups.players, f.side, f.shirtNumber) === 1;

  const flashGoalScorers = new Set(
    flash.incidents
      .filter((i) => GOAL_KINDS.has(i.kind) && i.player?.externalId)
      .map((i) => i.player?.externalId as string),
  );
  const flashAssisters = new Set(
    flash.incidents.filter((i) => i.assist?.externalId).map((i) => i.assist?.externalId as string),
  );
  const flashCarded = new Set(
    flash.incidents
      .filter((i) => (CARD_KINDS as readonly string[]).includes(i.kind) && i.player?.externalId)
      .map((i) => i.player?.externalId as string),
  );
  const flashSubbed = new Set(
    flash.incidents
      .filter((i) => i.kind === "substitution")
      .flatMap((i) => [i.playerIn?.externalId, i.playerOut?.externalId])
      .filter((x): x is string => Boolean(x)),
  );

  const candidates: FixtureCandidate[] = [];
  const unresolved: BridgeUnresolved[] = [];
  const flashAppeared = flash.lineups.players.filter((p) => p.starter || cameOn.has(p.externalId));

  for (const f of flashAppeared) {
    const fixture: BridgeFixtureRef = {
      sofascoreFixtureId: sId,
      flashscoreFixtureId: fId,
      side: f.side,
    };
    // Every Sofascore entry that has some signal with f: an aligned event or the shirt.
    const found = new Set<string>(fPartners.get(f.externalId) ?? []);
    for (const s of sofa.lineups.players) if (shirtAgrees(s, f)) found.add(s.externalId);
    const sameSide = [...found].filter((id) => sofaById.get(id)?.side === f.side).sort();

    const baseTags: BridgePriority[] = [];
    if (flashGoalScorers.has(f.externalId)) baseTags.push("scorer");
    if (flashAssisters.has(f.externalId)) baseTags.push("assister");
    if (f.position === "G") baseTags.push("goalkeeper");
    if (flashCarded.has(f.externalId)) baseTags.push("carded");
    if (flashSubbed.has(f.externalId)) baseTags.push("substituted");
    if (f.starter) baseTags.push("started");

    const fail = (
      reason: BridgeUnresolvedReason,
      detail: string,
      events: readonly BridgeEvent[] = [],
      tags: readonly BridgePriority[] = baseTags,
    ) =>
      unresolved.push({
        flashscoreId: f.externalId,
        fixture,
        reason,
        alternatives: sameSide,
        events,
        priority: tags,
        detail,
      });

    if (sameSide.length === 0) {
      fail("no_candidate", "No Sofascore entry shares a shirt number or an aligned event with it.");
      continue;
    }
    // Event-supported candidates; a shirt-only candidate has no event behind it.
    const supported = sameSide.filter(
      (id) => (pairEvents.get(`${id}|${f.externalId}`) ?? []).length > 0,
    );
    const shirtOnly = sameSide.filter((id) => !supported.includes(id));
    if (supported.length === 0) {
      fail(
        "no_event_alignment_shirt_only",
        `Shirt number agrees with ${shirtOnly.length} entry but no goal, card or substitution aligns them: shirt, club and position alone are not a bridge.`,
      );
      continue;
    }
    if (supported.length > 1) {
      fail("ambiguous_candidates", "Events align this entry with more than one Sofascore entry.");
      continue;
    }
    const sid = supported[0] as string;
    const s = sofaById.get(sid) as PerformanceLineupPlayer;
    const events = pairEvents.get(`${sid}|${f.externalId}`) ?? [];
    const agrees = shirtAgrees(s, f);

    // Contradictions: either side aligned to someone else, or a different shirt partner.
    const sOthers = [...(sPartners.get(sid) ?? [])].filter((x) => x !== f.externalId);
    const fOthers = [...(fPartners.get(f.externalId) ?? [])].filter((x) => x !== sid);
    const shirtElsewhere = flash.lineups.players.some(
      (other) => other.externalId !== f.externalId && shirtAgrees(s, other),
    );
    if (sOthers.length > 0 || fOthers.length > 0 || shirtElsewhere) {
      fail(
        "contradicting_event",
        "An event or the shirt number ties one of the two entries to a different entry.",
        events,
      );
      continue;
    }
    if (keeperConflict(s, f)) {
      fail("position_conflict", "The providers disagree about whether he is a goalkeeper.", events);
      continue;
    }
    if (!agrees && events.length < 2) {
      fail(
        "single_event_shirt_disagrees",
        "One event aligns them but the shirt numbers differ or are not unique: one event alone is not a bridge.",
        events,
      );
      continue;
    }
    const entry = index.entryOf("sofascore", sid);
    if (!entry) {
      fail(
        "sofascore_partner_not_reviewed",
        "The evidence supports pairing with this Sofascore entry, but that entry has no reviewed mapping, so there is no app player to bridge to.",
        events,
      );
      continue;
    }
    const tags: BridgePriority[] = [...baseTags];
    if (squad.has(entry.appPlayerId)) tags.push("in_locked_squad");
    candidates.push({
      flashscoreId: f.externalId,
      sofascoreId: sid,
      appPlayerId: entry.appPlayerId,
      mapping: { mappingId: entry.mappingId, version: entry.version },
      evidence: { fixture, shirtAgrees: agrees, events, priority: tags },
    });
  }

  // Two Flashscore entries for one app player in one match: neither is chosen
  // (the first in the list is not more right than the second).
  const byApp = new Map<string, FixtureCandidate[]>();
  for (const c of candidates) byApp.set(c.appPlayerId, [...(byApp.get(c.appPlayerId) ?? []), c]);
  const kept: FixtureCandidate[] = [];
  for (const group of byApp.values()) {
    if (group.length === 1) {
      kept.push(...group);
      continue;
    }
    for (const c of group) {
      unresolved.push({
        flashscoreId: c.flashscoreId,
        fixture: c.evidence.fixture,
        reason: "app_player_claimed_twice",
        alternatives: [c.sofascoreId],
        events: c.evidence.events,
        priority: c.evidence.priority,
        detail:
          "More than one Flashscore entry in this match is supported for the same app player.",
      });
    }
  }
  return {
    candidates: kept.sort((a, b) => (a.flashscoreId < b.flashscoreId ? -1 : 1)),
    unresolved,
    appeared: flashAppeared.length,
    rejected: null,
  };
}

const tally = (items: readonly string[]) => {
  const out: Record<string, number> = {};
  for (const item of items) out[item] = (out[item] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
};

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const refKey = (r: BridgeFixtureRef) =>
  `${r.sofascoreFixtureId}|${r.flashscoreFixtureId}|${r.side}`;

/**
 * ONE consolidated review set over several finished matches.
 *
 * The same Flashscore id suggested for the same app player in more than one
 * match is one suggestion with every match's evidence. A Flashscore id suggested
 * for two app players, or two Flashscore ids for one app player, is a conflict:
 * neither side is suggested and the input order decides nothing.
 */
export function buildBridgeReviewSet(
  fixtures: readonly BridgeFixtureInput[],
  snapshot: ReviewedIdentitySnapshot,
): BridgeReviewSet {
  const all: FixtureCandidate[] = [];
  const unresolved: BridgeUnresolved[] = [];
  const rejectedFixtures: BridgeRejectedFixture[] = [];
  let appeared = 0;
  for (const fixture of fixtures) {
    const one = bridgeFixture(fixture, snapshot);
    all.push(...one.candidates);
    unresolved.push(...one.unresolved);
    appeared += one.appeared;
    if (one.rejected) {
      rejectedFixtures.push(one.rejected);
      unresolved.push({
        flashscoreId: "",
        fixture: {
          sofascoreFixtureId: fixture.link.sofascoreFixtureId,
          flashscoreFixtureId: fixture.link.flashscoreFixtureId,
          side: "home",
        },
        reason: "fixture_not_verified",
        alternatives: [],
        events: [],
        priority: [],
        detail: one.rejected.reasons.join(" "),
      });
    }
  }

  const appsOfFlash = new Map<string, Set<string>>();
  const flashesOfApp = new Map<string, Set<string>>();
  for (const c of all) {
    appsOfFlash.set(
      c.flashscoreId,
      (appsOfFlash.get(c.flashscoreId) ?? new Set()).add(c.appPlayerId),
    );
    flashesOfApp.set(
      c.appPlayerId,
      (flashesOfApp.get(c.appPlayerId) ?? new Set()).add(c.flashscoreId),
    );
  }
  const badFlash = new Set([...appsOfFlash].filter(([, s]) => s.size > 1).map(([k]) => k));
  const badApp = new Set([...flashesOfApp].filter(([, s]) => s.size > 1).map(([k]) => k));

  const conflicts: BridgeConflict[] = [];
  for (const id of [...badFlash].sort()) {
    conflicts.push({
      kind: "flashscore_id_two_app_players",
      flashscoreIds: [id],
      appPlayerIds: [...(appsOfFlash.get(id) ?? [])].sort(),
      fixtures: all
        .filter((c) => c.flashscoreId === id)
        .map((c) => c.evidence.fixture)
        .sort((a, b) => cmp(refKey(a), refKey(b))),
    });
  }
  for (const app of [...badApp].sort()) {
    conflicts.push({
      kind: "app_player_two_flashscore_ids",
      flashscoreIds: [...(flashesOfApp.get(app) ?? [])].sort(),
      appPlayerIds: [app],
      fixtures: all
        .filter((c) => c.appPlayerId === app)
        .map((c) => c.evidence.fixture)
        .sort((a, b) => cmp(refKey(a), refKey(b))),
    });
  }

  // Merge what is left: same Flashscore id and same app player, across matches.
  const merged = new Map<string, FixtureCandidate[]>();
  for (const c of all) {
    if (badFlash.has(c.flashscoreId) || badApp.has(c.appPlayerId)) continue;
    const key = `${c.flashscoreId}|${c.appPlayerId}`;
    merged.set(key, [...(merged.get(key) ?? []), c]);
  }
  const suggestions: BridgeSuggestion[] = [...merged.values()]
    .map((group) => {
      const first = group[0] as FixtureCandidate;
      const evidence = group
        .map((c) => c.evidence)
        .sort((a, b) => cmp(refKey(a.fixture), refKey(b.fixture)));
      return {
        flashscoreId: first.flashscoreId,
        sofascoreId: first.sofascoreId,
        appPlayerId: first.appPlayerId,
        sofascoreMapping: first.mapping,
        evidence,
        priority: [...new Set(evidence.flatMap((e) => e.priority))].sort(),
        confidenceLimits: evidence.length > 1 ? LIMITS_MULTI : LIMITS,
      };
    })
    .sort((a, b) => cmp(a.flashscoreId, b.flashscoreId));

  const sortedUnresolved = [...unresolved].sort(
    (a, b) => cmp(a.flashscoreId, b.flashscoreId) || cmp(refKey(a.fixture), refKey(b.fixture)),
  );
  return {
    snapshotDigest: snapshot.digest,
    suggestions,
    conflicts,
    unresolved: sortedUnresolved,
    rejectedFixtures,
    summary: {
      flashscoreEntriesAppeared: appeared,
      suggested: suggestions.length,
      conflicts: conflicts.length,
      unresolved: sortedUnresolved.length,
      unresolvedByReason: tally(sortedUnresolved.map((u) => u.reason)),
      suggestionsByPriority: tally(suggestions.flatMap((s) => s.priority)),
    },
  };
}
