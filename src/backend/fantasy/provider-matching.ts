/**
 * Matching helpers for the provider reconciler: who is who across Sofascore
 * and Flashscore, and which incident is which. Pure functions, no I/O.
 *
 * The rule behind all of it: only Sofascore ids and Flashscore ids identify a
 * player, names never do, and a pairing is only trusted as far as the evidence
 * behind it goes (see `Basis`).
 */
import type {
  MatchSide,
  PerformanceIncident,
  PerformanceLineupPlayer,
  PerformanceLineups,
} from "../football/provider/performance-contracts";
import {
  toAppliedMapping,
  type AppliedMapping,
  type IdentityStatus,
  type ReviewedIdentityIndex,
} from "./reviewed-identities";

/** How far apart two providers' minutes for the same card, penalty or substitution may be. */
export const CARD_TOLERANCE_MINUTES = 5;
export const SUBSTITUTION_TOLERANCE_MINUTES = 5;
export const MISSED_PENALTY_TOLERANCE_MINUTES = 5;
/**
 * Goals may differ by up to this many minutes, but only when both providers
 * name the same scorers in the same order and both add up to the final score.
 */
export const GOAL_ORDER_TOLERANCE_MINUTES = 10;
/**
 * A scorer the shirt numbers cannot pair is paired from the goal itself only
 * when the two providers time it this closely.
 */
export const GOAL_LINK_TOLERANCE_MINUTES = 2;

export type DiscrepancyCode =
  | "provider_missing"
  | "match_not_finished"
  | "score_mismatch"
  | "goal_mismatch"
  | "unknown_incident"
  | "own_goal_unconfirmed"
  | "starters_count"
  | "lineup_fallback"
  | "saves_identity"
  | "unmatched_player"
  | "ambiguous_shirt"
  | "position_conflict"
  | "identity_linked_by_goal"
  | "identity_reviewed_overrides_shirt"
  | "identity_mapping_conflict"
  | "identity_side_conflict"
  | "duplicate_canonical_identity"
  | "assist_conflict"
  | "assist_unmatched"
  | "assist_unconfirmed"
  | "card_mismatch"
  | "penalty_missed_mismatch"
  | "penalty_saved_unknown"
  | "substitution_mismatch"
  | "minutes_mismatch"
  | "minutes_differ"
  | "timeline_disagrees"
  | "participation_ambiguous"
  | "penalty_label_differs"
  | "info";

export interface Discrepancy {
  readonly code: DiscrepancyCode;
  /** `fixture`: nothing is scored. `player`: that player's fields are incomplete. `info`: noted only. */
  readonly level: "fixture" | "player" | "info";
  readonly side: MatchSide | null;
  readonly shirtNumber: number | null;
  readonly field: string | null;
  readonly message: string;
}

export type Note = (
  code: DiscrepancyCode,
  level: Discrepancy["level"],
  message: string,
  where?: { side?: MatchSide | null; shirtNumber?: number | null; field?: string | null },
) => void;

export interface UnmatchedPlayer {
  readonly provider: "sofascore" | "flashscore";
  readonly providerId: string;
  readonly side: MatchSide;
  readonly shirtNumber: number | null;
  readonly starter: boolean;
  /** Shown to a human reviewer only. Never used to decide a match. */
  readonly displayName: string;
  readonly reason:
    | "no_counterpart"
    | "ambiguous_shirt"
    | "position_conflict"
    | "no_shirt_number"
    | "mapped_to_different_players";
}

/**
 * What the pairing of two lineup entries rests on:
 * - `incident`: both providers attribute the same goal, card, penalty or
 *   substitution to the pair, so it does not depend on the shirt number.
 * - `shirt`: only the shirt number (and side, and no keeper/outfield
 *   contradiction). Used only for players neither provider mentions in any
 *   incident, so nothing can be attributed to them wrongly.
 * - `single_source`: the other provider's lineup is clearly broken and this
 *   provider's lineup is used alone for the player.
 * - `reviewed_mapping`: both provider ids are reviewed mappings of the same app
 *   player. Neither the shirt number nor an incident paired them. (Their events
 *   are checked separately, exactly as for any other pair.)
 */
export type Basis = "incident" | "shirt" | "single_source" | "reviewed_mapping";

export interface Person {
  /** The Sofascore id when the player is in the Sofascore lineup, else `f:` + the Flashscore id. */
  readonly key: string;
  readonly side: MatchSide;
  readonly sofa: PerformanceLineupPlayer | null;
  readonly flash: PerformanceLineupPlayer | null;
  /** Set when only this provider's lineup supplies the player. */
  readonly only: "sofascore" | "flashscore" | null;
  /**
   * The providers disagree about whether he is a goalkeeper (both give a known
   * position and exactly one says goalkeeper). Identity can be settled by a reviewed mapping and this still
   * stands: which provider is right about the position is not known, so
   * position-dependent scoring is held back for this player.
   */
  readonly positionConflict: boolean;
  /**
   * Where the identity stands. Without a reviewed-identity input every pair is
   * `unreviewed_legacy` and every single-source player `single_source_unreviewed`.
   */
  readonly status: IdentityStatus;
  /** The canonical app player, only when the reviewed mappings establish it. */
  readonly appPlayerId: string | null;
  /** The mapping rows (id and version) this person's identity used. */
  readonly applied: readonly AppliedMapping[];
}

export const opposite = (side: MatchSide): MatchSide => (side === "home" ? "away" : "home");
const SIDES = ["home", "away"] as const;
export const keyOfFlash = (id: string) => `f:${id}`;

/**
 * The two providers disagree about whether the player is a goalkeeper: both give
 * a known position and exactly one of them says goalkeeper. Checked in both
 * directions. A missing position proves nothing: Flashscore marks keepers only
 * some of the time, so its silence never counts against a Sofascore keeper.
 */
export const keeperConflict = (
  a: PerformanceLineupPlayer,
  b: PerformanceLineupPlayer | null,
): boolean =>
  b !== null &&
  a.position !== null &&
  b.position !== null &&
  (a.position === "G") !== (b.position === "G");

const within = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

const byMinute = <T extends { minute: number }>(list: readonly T[]): T[] =>
  list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.minute - b.item.minute || a.index - b.index)
    .map((x) => x.item);

export interface GoalPair {
  readonly side: MatchSide;
  readonly sofa: PerformanceIncident;
  readonly flash: PerformanceIncident;
  readonly key: string;
}

export interface Identity {
  readonly people: readonly Person[];
  readonly unmatched: readonly UnmatchedPlayer[];
  readonly goalPairs: readonly GoalPair[];
  /** Person key of a Sofascore / Flashscore player id, or null when unpaired. */
  readonly keyOfSofaId: (id: string | null) => string | null;
  readonly keyOfFlashId: (id: string | null) => string | null;
  /** Keys of people paired by an incident (not by shirt alone). */
  readonly confirmedByIncident: Set<string>;
  /** Sides where one lineup is clearly broken, and the provider whose lineup is used alone there. */
  readonly fallbackSides: ReadonlyMap<MatchSide, "sofascore" | "flashscore">;
}

function startersOf(lineups: PerformanceLineups, side: MatchSide) {
  return lineups.players.filter((p) => p.side === side && p.starter).length;
}

/**
 * Pair the two lineups. Order of evidence:
 * 1. Shirt number within a side, with a keeper marker as a veto, for every
 *    shirt that is unique on both sides.
 * 2. The goals. Per side, both providers' goals are taken in the order scored.
 *    The scorers at each position must be the same player, as the shirt
 *    numbers pair them. When they do not, it is a disagreement and the match
 *    goes to review (a `fixture` discrepancy): a goal cannot be what proves
 *    that two differently numbered players are one person, because that would
 *    also hide a real disagreement about who scored.
 *    Only with `linkIdentityByGoal` (off by default, a decision for the owner)
 *    does the goal itself pair them, if the two providers time it within
 *    `GOAL_LINK_TOLERANCE_MINUTES`; the shirt pairing that this contradicts is
 *    dropped. It never pairs two entries whose reviewed mappings are different
 *    app players.
 *    With a reviewed-identity input (`reviewed`), step 1 is preceded by the
 *    reviewed pairs: two entries mapped to the same app player are paired
 *    whatever their shirt numbers, and two entries mapped to different app
 *    players are never paired by any weaker signal.
 * 3. A side whose lineup is clearly broken (not 11 starters) is replaced, for
 *    that side, by the other provider's lineup.
 */
export function resolveIdentity(
  sofa: PerformanceLineups,
  flash: PerformanceLineups,
  sofaGoals: readonly PerformanceIncident[],
  flashGoals: readonly PerformanceIncident[],
  note: Note,
  linkIdentityByGoal = false,
  reviewed: ReviewedIdentityIndex | null = null,
): Identity {
  const sofaById = new Map(sofa.players.map((p) => [p.externalId, p]));
  const flashById = new Map(flash.players.map((p) => [p.externalId, p]));
  const blocked = new Map<string, UnmatchedPlayer["reason"]>();

  // ---- 1. shirt candidates ----------------------------------------------------
  const shirtPairs = new Map<string, string>(); // sofa id -> flash id
  for (const side of SIDES) {
    const group = (list: readonly PerformanceLineupPlayer[]) => {
      const map = new Map<number, PerformanceLineupPlayer[]>();
      for (const p of list.filter((x) => x.side === side)) {
        if (p.shirtNumber === null) blocked.set(`${p.provider}:${p.externalId}`, "no_shirt_number");
        else map.set(p.shirtNumber, [...(map.get(p.shirtNumber) ?? []), p]);
      }
      return map;
    };
    const s = group(sofa.players);
    const f = group(flash.players);
    for (const shirt of [...new Set([...s.keys(), ...f.keys()])].sort((a, b) => a - b)) {
      const sp = s.get(shirt) ?? [];
      const fp = f.get(shirt) ?? [];
      if (sp.length > 1 || fp.length > 1) {
        for (const p of [...sp, ...fp])
          blocked.set(`${p.provider}:${p.externalId}`, "ambiguous_shirt");
        note("ambiguous_shirt", "info", `Shirt ${shirt} appears more than once on one side.`, {
          side,
          shirtNumber: shirt,
        });
      } else if (sp[0] && fp[0]) {
        if (keeperConflict(sp[0], fp[0])) {
          blocked.set(`sofascore:${sp[0].externalId}`, "position_conflict");
          blocked.set(`flashscore:${fp[0].externalId}`, "position_conflict");
          note(
            "position_conflict",
            "info",
            `Shirt ${shirt}: the providers disagree about whether he is a goalkeeper.`,
            { side, shirtNumber: shirt },
          );
        } else shirtPairs.set(sp[0].externalId, fp[0].externalId);
      }
    }
  }

  // ---- 1b. reviewed identities -------------------------------------------------
  // A reviewed mapping settles who is who without the shirt number. It overrides
  // a shirt pairing it contradicts, and it vetoes a shirt pairing between two
  // entries reviewed as different people. An entry with no mapping is not
  // touched: it keeps the legacy rules and is labelled unreviewed.
  const appOf = (p: PerformanceLineupPlayer) =>
    reviewed?.appPlayerOf(p.provider, p.externalId) ?? null;
  const mappedApart = (sId: string, fId: string) => {
    const a = reviewed?.appPlayerOf("sofascore", sId) ?? null;
    const b = reviewed?.appPlayerOf("flashscore", fId) ?? null;
    return a !== null && b !== null && a !== b;
  };
  if (reviewed) {
    const holders = new Map<string, PerformanceLineupPlayer[]>();
    for (const p of [...sofa.players, ...flash.players]) {
      const app = appOf(p);
      if (app !== null) holders.set(app, [...(holders.get(app) ?? []), p]);
    }
    for (const app of [...holders.keys()].sort()) {
      const list = holders.get(app) ?? [];
      const ss = list.filter((p) => p.provider === "sofascore");
      const ff = list.filter((p) => p.provider === "flashscore");
      const s = ss[0];
      const f = ff[0];
      if (ss.length > 1 || ff.length > 1) {
        note(
          "duplicate_canonical_identity",
          "fixture",
          "One app player is the reviewed identity of more than one lineup entry of the same provider.",
          { side: list[0]?.side ?? null },
        );
      } else if (s && f && s.side !== f.side) {
        note(
          "identity_side_conflict",
          "fixture",
          "The providers put one reviewed app player on opposite sides of the fixture.",
          { side: s.side },
        );
      } else if (s && f) {
        for (const [sKey, fKey] of [...shirtPairs.entries()]) {
          if ((sKey === s.externalId) !== (fKey === f.externalId)) {
            shirtPairs.delete(sKey);
            note(
              "identity_reviewed_overrides_shirt",
              "info",
              "A reviewed mapping contradicts a shirt-number pairing; the reviewed identity wins.",
              { side: s.side },
            );
          }
        }
        shirtPairs.set(s.externalId, f.externalId);
        blocked.delete(`sofascore:${s.externalId}`);
        blocked.delete(`flashscore:${f.externalId}`);
      }
    }
    // Two entries reviewed as different people are never paired by shirt number.
    for (const [sKey, fKey] of [...shirtPairs.entries()]) {
      if (!mappedApart(sKey, fKey)) continue;
      shirtPairs.delete(sKey);
      blocked.set(`sofascore:${sKey}`, "mapped_to_different_players");
      blocked.set(`flashscore:${fKey}`, "mapped_to_different_players");
      const side = sofaById.get(sKey)?.side ?? null;
      note(
        "identity_mapping_conflict",
        "player",
        "Two lineup entries with the same shirt number are reviewed mappings of different app players, so they are not paired.",
        { side, shirtNumber: sofaById.get(sKey)?.shirtNumber ?? null },
      );
    }
  }

  // ---- 2. goals, in the order scored ------------------------------------------
  const eventLinks = new Map<string, string>(); // sofa id -> flash id, from a goal
  const flashLinked = new Map<string, string>(); // flash id -> sofa id
  const partnerOfSofa = (id: string) => eventLinks.get(id) ?? shirtPairs.get(id) ?? null;
  const partnerOfFlash = (id: string) =>
    flashLinked.get(id) ?? [...shirtPairs.entries()].find(([, f]) => f === id)?.[0] ?? null;
  const goalMismatch = (message: string, side: MatchSide) =>
    note("goal_mismatch", "fixture", message, { side });
  const goalPairs: {
    side: MatchSide;
    sofa: PerformanceIncident;
    flash: PerformanceIncident;
    sId: string;
    fId: string;
  }[] = [];
  for (const side of SIDES) {
    const sg = byMinute(sofaGoals.filter((g) => g.side === side));
    const fg = byMinute(flashGoals.filter((g) => g.side === side));
    if (sg.length !== fg.length) {
      goalMismatch(`The providers list ${sg.length} and ${fg.length} ${side} goals.`, side);
      continue;
    }
    sg.forEach((s, i) => {
      const f = fg[i];
      const sId = s.player?.externalId ?? null;
      const fId = f?.player?.externalId ?? null;
      if (!f || sId === null || fId === null || !sofaById.has(sId) || !flashById.has(fId)) {
        goalMismatch(
          `A ${side} goal at minute ${s.minute} has a scorer that is not in both lineups.`,
          side,
        );
        return;
      }
      if (!within(s.minute, f.minute, GOAL_ORDER_TOLERANCE_MINUTES)) {
        goalMismatch(
          `A ${side} goal is at minute ${s.minute} in Sofascore and ${f.minute} in Flashscore.`,
          side,
        );
        return;
      }
      if (partnerOfSofa(sId) === fId && partnerOfFlash(fId) === sId) {
        goalPairs.push({ side, sofa: s, flash: f, sId, fId });
        return;
      }
      const sPartner = partnerOfSofa(sId);
      const fPartner = partnerOfFlash(fId);
      const sFree = sPartner === null || !eventLinks.has(sId);
      const fFree = fPartner === null || !flashLinked.has(fId);
      if (
        linkIdentityByGoal &&
        !mappedApart(sId, fId) &&
        within(s.minute, f.minute, GOAL_LINK_TOLERANCE_MINUTES) &&
        sFree &&
        fFree
      ) {
        // The providers number this player differently: the goal pairs them, and
        // the shirt pairings that this contradicts are dropped.
        for (const [sKey, fKey] of [...shirtPairs.entries()]) {
          if (sKey === sId || fKey === fId) shirtPairs.delete(sKey);
        }
        eventLinks.set(sId, fId);
        flashLinked.set(fId, sId);
        blocked.delete(`sofascore:${sId}`);
        blocked.delete(`flashscore:${fId}`);
        note(
          "identity_linked_by_goal",
          "info",
          `A ${side} scorer is paired by the goal at minute ${s.minute}, not by shirt number.`,
          { side },
        );
        goalPairs.push({ side, sofa: s, flash: f, sId, fId });
        return;
      }
      goalMismatch(
        `The providers do not name the same ${side} scorer for the goal at minute ${s.minute}.`,
        side,
      );
    });
  }

  // ---- 3. final pairs, rosters, fallback --------------------------------------
  const pairs = new Map<string, string>([...shirtPairs, ...eventLinks]);
  const pairedFlash = new Set(pairs.values());
  const people: Person[] = [];
  const unmatched: UnmatchedPlayer[] = [];
  const miss = (
    p: PerformanceLineupPlayer,
    fallback: UnmatchedPlayer["reason"],
  ): UnmatchedPlayer => ({
    provider: p.provider,
    providerId: p.externalId,
    side: p.side,
    shirtNumber: p.shirtNumber,
    starter: p.starter,
    displayName: p.name,
    reason: blocked.get(`${p.provider}:${p.externalId}`) ?? fallback,
  });
  const fallbackSides = new Map<MatchSide, "sofascore" | "flashscore">();
  const describe = (
    sp: PerformanceLineupPlayer | null,
    fp: PerformanceLineupPlayer | null,
    only: Person["only"],
  ): Pick<Person, "status" | "appPlayerId" | "applied"> => {
    const sEntry = sp ? (reviewed?.entryOf("sofascore", sp.externalId) ?? null) : null;
    const fEntry = fp ? (reviewed?.entryOf("flashscore", fp.externalId) ?? null) : null;
    const applied = [sEntry, fEntry].flatMap((e) => (e ? [toAppliedMapping(e)] : []));
    if (only) {
      const entry = sEntry ?? fEntry;
      return entry
        ? { status: "reviewed_single_source", appPlayerId: entry.appPlayerId, applied }
        : { status: "single_source_unreviewed", appPlayerId: null, applied };
    }
    if (sEntry && fEntry && sEntry.appPlayerId === fEntry.appPlayerId) {
      return { status: "reviewed_pair", appPlayerId: sEntry.appPlayerId, applied };
    }
    return {
      status: sEntry || fEntry ? "partially_reviewed" : "unreviewed_legacy",
      appPlayerId: null,
      applied,
    };
  };
  for (const side of SIDES) {
    const sStart = startersOf(sofa, side);
    const fStart = startersOf(flash, side);
    // The provider whose lineup is used alone for players the other cannot pair.
    let sole: "sofascore" | "flashscore" | null = null;
    if (sStart === 11 && fStart !== 11) sole = "sofascore";
    else if (sStart !== 11 && fStart === 11) sole = "flashscore";
    else if (sStart !== 11 && fStart !== 11) {
      note(
        "starters_count",
        "fixture",
        `Neither lineup has 11 starters for the ${side} side (Sofascore ${sStart}, Flashscore ${fStart}).`,
        { side },
      );
    }
    if (sole) {
      fallbackSides.set(side, sole);
      note(
        "lineup_fallback",
        "info",
        `The ${side} ${sole === "sofascore" ? "Flashscore" : "Sofascore"} lineup lists ${sole === "sofascore" ? fStart : sStart} starters, so the ${sole} lineup is used for players the other cannot pair.`,
        { side },
      );
    }
    for (const p of sofa.players.filter((x) => x.side === side)) {
      const partner = pairs.get(p.externalId);
      if (partner) {
        const flashEntry = flashById.get(partner) ?? null;
        people.push({
          key: p.externalId,
          side,
          sofa: p,
          flash: flashEntry,
          only: null,
          positionConflict: keeperConflict(p, flashEntry),
          ...describe(p, flashEntry, null),
        });
      } else if (sole === "sofascore" && !blocked.has(`sofascore:${p.externalId}`)) {
        people.push({
          key: p.externalId,
          side,
          sofa: p,
          flash: null,
          only: "sofascore",
          positionConflict: false,
          ...describe(p, null, "sofascore"),
        });
      } else unmatched.push(miss(p, "no_counterpart"));
    }
    for (const p of flash.players.filter((x) => x.side === side)) {
      if (pairedFlash.has(p.externalId)) continue;
      if (sole === "flashscore" && !blocked.has(`flashscore:${p.externalId}`)) {
        people.push({
          key: keyOfFlash(p.externalId),
          side,
          sofa: null,
          flash: p,
          only: "flashscore",
          positionConflict: false,
          ...describe(null, p, "flashscore"),
        });
      } else unmatched.push(miss(p, "no_counterpart"));
    }
  }

  // One app player appears in at most one reconciled record per fixture. The
  // lineup fallback can otherwise produce the same person twice (once paired, once
  // from the other lineup alone); two records of him would score him twice.
  if (reviewed) {
    const owner = new Map<string, string>();
    const duplicate = (side: MatchSide | null) =>
      note(
        "duplicate_canonical_identity",
        "fixture",
        "One reviewed app player comes out as more than one record in this fixture.",
        { side },
      );
    for (const person of people) {
      const apps = new Set(
        [person.sofa, person.flash].flatMap((p) => {
          const app = p ? appOf(p) : null;
          return app === null ? [] : [app];
        }),
      );
      for (const app of apps) {
        const held = owner.get(app);
        if (held !== undefined && held !== person.key) duplicate(person.side);
        else owner.set(app, person.key);
      }
    }
    for (const u of unmatched) {
      const app = reviewed.appPlayerOf(u.provider, u.providerId);
      if (app !== null && owner.has(app)) duplicate(u.side);
    }
  }

  const keyBySofa = new Map<string, string>();
  const keyByFlash = new Map<string, string>();
  for (const person of people) {
    if (person.sofa) keyBySofa.set(person.sofa.externalId, person.key);
    if (person.flash) keyByFlash.set(person.flash.externalId, person.key);
  }
  const confirmedByIncident = new Set<string>();
  const finalGoalPairs: GoalPair[] = [];
  for (const g of goalPairs) {
    const key = keyBySofa.get(g.sId);
    if (key === undefined || keyByFlash.get(g.fId) !== key) {
      goalMismatch(`A ${g.side} scorer could not be paired.`, g.side);
      continue;
    }
    confirmedByIncident.add(key);
    finalGoalPairs.push({ side: g.side, sofa: g.sofa, flash: g.flash, key });
  }
  return {
    people,
    unmatched,
    goalPairs: finalGoalPairs,
    keyOfSofaId: (id) => (id === null ? null : (keyBySofa.get(id) ?? null)),
    keyOfFlashId: (id) => (id === null ? null : (keyByFlash.get(id) ?? null)),
    confirmedByIncident,
    fallbackSides,
  };
}

// ---- incidents of one player ----------------------------------------------------

export interface MinutePair {
  readonly sofa: number;
  readonly flash: number;
}

export interface PlayerEvents {
  /** Matched pairs, in time order. */
  readonly pairs: readonly MinutePair[];
  /** True when the providers do not give this player the same events. */
  readonly broken: boolean;
}

/**
 * Per player: the minutes of one kind of incident in each provider. The counts
 * must be equal and, taken in time order, each pair within `tolerance`.
 * Otherwise the player's events are `broken` and nothing is credited.
 * An incident whose player is not paired at all is reported through `lone`.
 * A player supplied by only one provider (`only`) has nothing to cross-check:
 * that provider's list is used as it is.
 */
export function pairEventsByPlayer(
  kinds: readonly PerformanceIncident["kind"][],
  sofa: readonly PerformanceIncident[],
  flash: readonly PerformanceIncident[],
  identity: Identity,
  tolerance: number,
): { byKey: Map<string, Map<string, PlayerEvents>>; lone: PerformanceIncident[] } {
  const byKey = new Map<string, Map<string, PlayerEvents>>();
  const lone: PerformanceIncident[] = [];
  const gather = (
    list: readonly PerformanceIncident[],
    keyOf: (id: string | null) => string | null,
  ) => {
    const out = new Map<string, number[]>();
    for (const incident of list) {
      if (!kinds.includes(incident.kind)) continue;
      const key = keyOf(incident.player?.externalId ?? null);
      if (key === null) lone.push(incident);
      else
        out.set(`${key}|${incident.kind}`, [
          ...(out.get(`${key}|${incident.kind}`) ?? []),
          incident.minute,
        ]);
    }
    for (const [name, minutes] of out)
      out.set(
        name,
        minutes.sort((a, b) => a - b),
      );
    return out;
  };
  const s = gather(sofa, identity.keyOfSofaId);
  const f = gather(flash, identity.keyOfFlashId);
  const people = new Map(identity.people.map((p) => [p.key, p]));
  for (const name of new Set([...s.keys(), ...f.keys()])) {
    const [key = "", kind = ""] = name.split("|");
    const sm = s.get(name) ?? [];
    const fm = f.get(name) ?? [];
    const only = people.get(key)?.only ?? null;
    let events: PlayerEvents;
    if (only === "sofascore")
      events = { pairs: sm.map((m) => ({ sofa: m, flash: m })), broken: false };
    else if (only === "flashscore")
      events = { pairs: fm.map((m) => ({ sofa: m, flash: m })), broken: false };
    else if (
      sm.length !== fm.length ||
      sm.some((m, i) => !within(m, fm[i] ?? Number.NaN, tolerance))
    ) {
      events = { pairs: [], broken: true };
    } else events = { pairs: sm.map((m, i) => ({ sofa: m, flash: fm[i] ?? m })), broken: false };
    const forPlayer = byKey.get(key) ?? new Map<string, PlayerEvents>();
    forPlayer.set(kind, events);
    byKey.set(key, forPlayer);
  }
  return { byKey, lone };
}

export interface SubstitutionMoves {
  /** Per person: how and when each way on / way off is known. */
  readonly inAt: Map<string, MinutePair>;
  readonly outAt: Map<string, MinutePair>;
  readonly broken: Set<string>;
  /** Provider ids of substitutes who came on, whether or not they could be paired. */
  readonly cameOn: Set<string>;
  /** Sides with a substitution whose player is in neither lineup pairing. */
  readonly loneSides: Set<MatchSide>;
}

/**
 * Each player's way on and way off is paired on its own (not as a swap),
 * within `SUBSTITUTION_TOLERANCE_MINUTES`. Two providers that give different
 * players for the same substitution send only those players to `broken`.
 */
export function pairSubstitutions(
  sofa: readonly PerformanceIncident[],
  flash: readonly PerformanceIncident[],
  identity: Identity,
  note: Note,
): SubstitutionMoves {
  interface Move {
    readonly side: MatchSide;
    readonly role: "in" | "out";
    readonly minute: number;
    readonly key: string | null;
    readonly hasId: boolean;
  }
  const moves = (
    list: readonly PerformanceIncident[],
    keyOf: (id: string | null) => string | null,
  ): Move[] =>
    list
      .filter((i) => i.kind === "substitution")
      .flatMap((i) =>
        (["in", "out"] as const).map((role) => {
          const who = role === "in" ? i.playerIn : i.playerOut;
          return {
            side: i.side,
            role,
            minute: i.minute,
            key: keyOf(who?.externalId ?? null),
            hasId: who?.externalId != null,
          };
        }),
      );
  const sm = moves(sofa, identity.keyOfSofaId);
  const fm = moves(flash, identity.keyOfFlashId);
  const people = new Map(identity.people.map((p) => [p.key, p]));
  const inAt = new Map<string, MinutePair>();
  const outAt = new Map<string, MinutePair>();
  const broken = new Set<string>();
  const cameOn = new Set<string>();
  const loneSides = new Set<MatchSide>();
  for (const i of sofa)
    if (i.kind === "substitution" && i.playerIn?.externalId)
      cameOn.add(`sofascore:${i.playerIn.externalId}`);
  for (const i of flash)
    if (i.kind === "substitution" && i.playerIn?.externalId)
      cameOn.add(`flashscore:${i.playerIn.externalId}`);

  const record = (role: "in" | "out", key: string, pair: MinutePair) =>
    (role === "in" ? inAt : outAt).set(key, pair);
  const used = new Set<number>();
  const claim = (match: (m: Move) => boolean) => {
    const at = fm.findIndex((m, index) => !used.has(index) && match(m));
    if (at >= 0) used.add(at);
    return at >= 0 ? fm[at] : undefined;
  };
  const near = (a: number, b: number) => within(a, b, SUBSTITUTION_TOLERANCE_MINUTES);
  // Moves with a paired player first, then moves Flashscore gave no id for.
  for (const s of [...sm].sort((a, b) => Number(b.key !== null) - Number(a.key !== null))) {
    const only = s.key !== null ? (people.get(s.key)?.only ?? null) : null;
    if (s.key !== null && only === "sofascore") {
      record(s.role, s.key, { sofa: s.minute, flash: s.minute });
      continue;
    }
    const found =
      s.key === null
        ? undefined
        : (claim(
            (f) =>
              f.key === s.key && f.role === s.role && f.side === s.side && near(f.minute, s.minute),
          ) ??
          claim(
            (f) => !f.hasId && f.role === s.role && f.side === s.side && near(f.minute, s.minute),
          ));
    if (!found) {
      note(
        "substitution_mismatch",
        "player",
        `A Sofascore substitution (${s.role}) at minute ${s.minute} is not confirmed by Flashscore.`,
        { side: s.side },
      );
      if (s.key !== null) broken.add(s.key);
      else loneSides.add(s.side);
      continue;
    }
    if (s.key !== null) record(s.role, s.key, { sofa: s.minute, flash: found.minute });
  }
  fm.forEach((f, index) => {
    if (used.has(index)) return;
    if (f.key !== null && people.get(f.key)?.only === "flashscore") {
      record(f.role, f.key, { sofa: f.minute, flash: f.minute });
      return;
    }
    note(
      "substitution_mismatch",
      "player",
      `A Flashscore substitution (${f.role}) at minute ${f.minute} is not confirmed by Sofascore.`,
      { side: f.side },
    );
    if (f.key !== null) broken.add(f.key);
    else loneSides.add(f.side);
  });
  return { inAt, outAt, broken, cameOn, loneSides };
}
