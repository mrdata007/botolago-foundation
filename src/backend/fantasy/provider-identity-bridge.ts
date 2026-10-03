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
  LineupPosition,
  MatchSide,
  PerformanceIncident,
  PerformanceLineupPlayer,
} from "../football/provider/performance-contracts";
import {
  CARD_TOLERANCE_MINUTES,
  GOAL_ORDER_TOLERANCE_MINUTES,
  SUBSTITUTION_TOLERANCE_MINUTES,
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
  | "app_player_claimed_twice";

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

export interface BridgeSuggestion {
  readonly flashscoreId: string;
  readonly sofascoreId: string;
  readonly appPlayerId: string;
  /** The reviewed Sofascore mapping row (and version) the suggestion rests on. */
  readonly sofascoreMapping: { readonly mappingId: string; readonly version: string | null };
  readonly fixture: BridgeFixtureRef;
  readonly shirtAgrees: boolean;
  readonly events: readonly BridgeEvent[];
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

export interface BridgeFixtureInput {
  readonly sofascore: ProviderMatchData;
  readonly flashscore: ProviderMatchData;
  /** Locked-squad app player ids, for ranking only. */
  readonly lockedSquadAppPlayerIds?: ReadonlySet<string>;
}

export interface BridgeReviewSet {
  readonly snapshotDigest: string;
  readonly suggestions: readonly BridgeSuggestion[];
  readonly unresolved: readonly BridgeUnresolved[];
  readonly summary: {
    readonly flashscoreEntriesAppeared: number;
    readonly suggested: number;
    readonly unresolved: number;
    readonly unresolvedByReason: Readonly<Record<string, number>>;
    readonly suggestionsByPriority: Readonly<Record<string, number>>;
    /** Flashscore ids suggested in more than one fixture or for more than one app player. */
    readonly crossFixtureConflicts: readonly string[];
  };
}

const LIMITS: readonly string[] = [
  "Evidence from one finished match only; no second match confirms it.",
  "Both providers' data can be wrong in the same way; this is not an independent third source.",
  "Shows who the player is, not his club on the match date, his position, or that his events are right.",
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

const positionConflict = (s: PerformanceLineupPlayer, f: PerformanceLineupPlayer) => {
  const a: LineupPosition | null = s.position;
  const b: LineupPosition | null = f.position;
  // Flashscore marks keepers only some of the time: its silence proves nothing.
  return b === "G" && a !== null && a !== "G";
};

/** Bridge suggestions for ONE finished match. */
export function bridgeFixture(
  input: BridgeFixtureInput,
  snapshot: ReviewedIdentitySnapshot,
): { suggestions: BridgeSuggestion[]; unresolved: BridgeUnresolved[]; appeared: number } {
  const { sofascore: sofa, flashscore: flash } = input;
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
  const flashById = new Map(flash.lineups.players.map((p) => [p.externalId, p]));
  const cameOn = new Set(
    flash.incidents
      .filter((i) => i.kind === "substitution" && i.playerIn?.externalId)
      .map((i) => i.playerIn?.externalId as string),
  );

  // Events per (sofascore id, flashscore id), and every partner an entry was aligned to.
  const pairEvents = new Map<string, BridgeEvent[]>();
  const sPartners = new Map<string, Set<string>>();
  const fPartners = new Map<string, Set<string>>();
  for (const a of alignments) {
    const key = `${a.sId}|${a.fId}`;
    pairEvents.set(key, [...(pairEvents.get(key) ?? []), a.event]);
    sPartners.set(a.sId, (sPartners.get(a.sId) ?? new Set()).add(a.fId));
    fPartners.set(a.fId, (fPartners.get(a.fId) ?? new Set()).add(a.sId));
  }

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

  const suggestions: BridgeSuggestion[] = [];
  const unresolved: BridgeUnresolved[] = [];
  const claimed = new Map<string, string>(); // app player id -> flashscore id
  const flashAppeared = flash.lineups.players.filter((p) => p.starter || cameOn.has(p.externalId));

  for (const f of flashAppeared) {
    const fixture: BridgeFixtureRef = {
      sofascoreFixtureId: sId,
      flashscoreFixtureId: fId,
      side: f.side,
    };
    // Every Sofascore entry that has some signal with f: an aligned event or the shirt.
    const candidates = new Set<string>(fPartners.get(f.externalId) ?? []);
    for (const s of sofa.lineups.players) if (shirtAgrees(s, f)) candidates.add(s.externalId);
    const sameSide = [...candidates].filter((id) => sofaById.get(id)?.side === f.side);

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
        alternatives: [...sameSide].sort(),
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
    if (positionConflict(s, f)) {
      fail("position_conflict", "Flashscore marks a goalkeeper where Sofascore does not.", events);
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
    const claimedBy = claimed.get(entry.appPlayerId);
    if (claimedBy !== undefined && claimedBy !== f.externalId) {
      fail(
        "app_player_claimed_twice",
        "Another Flashscore entry is already suggested for this app player in this fixture.",
        events,
        tags,
      );
      continue;
    }
    claimed.set(entry.appPlayerId, f.externalId);
    suggestions.push({
      flashscoreId: f.externalId,
      sofascoreId: sid,
      appPlayerId: entry.appPlayerId,
      sofascoreMapping: { mappingId: entry.mappingId, version: entry.version },
      fixture,
      shirtAgrees: agrees,
      events,
      priority: tags,
      confidenceLimits: LIMITS,
    });
  }
  return { suggestions, unresolved, appeared: flashAppeared.length };
}

const tally = (items: readonly string[]) => {
  const out: Record<string, number> = {};
  for (const item of items) out[item] = (out[item] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
};

/** ONE consolidated review set over several finished matches. */
export function buildBridgeReviewSet(
  fixtures: readonly BridgeFixtureInput[],
  snapshot: ReviewedIdentitySnapshot,
): BridgeReviewSet {
  const suggestions: BridgeSuggestion[] = [];
  const unresolved: BridgeUnresolved[] = [];
  let appeared = 0;
  for (const fixture of fixtures) {
    const one = bridgeFixture(fixture, snapshot);
    suggestions.push(...one.suggestions);
    unresolved.push(...one.unresolved);
    appeared += one.appeared;
  }
  // The same Flashscore id suggested for two different app players, or twice from
  // two fixtures, is a conflict a reviewer must see first.
  const apps = new Map<string, Set<string>>();
  for (const s of suggestions) {
    apps.set(s.flashscoreId, (apps.get(s.flashscoreId) ?? new Set()).add(s.appPlayerId));
  }
  const counts = tally(suggestions.map((s) => s.flashscoreId));
  const crossFixtureConflicts = [...apps.entries()]
    .filter(([id, set]) => set.size > 1 || (counts[id] ?? 0) > 1)
    .map(([id]) => id)
    .sort();
  return {
    snapshotDigest: snapshot.digest,
    suggestions,
    unresolved,
    summary: {
      flashscoreEntriesAppeared: appeared,
      suggested: suggestions.length,
      unresolved: unresolved.length,
      unresolvedByReason: tally(unresolved.map((u) => u.reason)),
      suggestionsByPriority: tally(suggestions.flatMap((s) => s.priority)),
      crossFixtureConflicts,
    },
  };
}
