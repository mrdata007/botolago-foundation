/**
 * One-time SportsMonks to SofaScore mapping of the club and player catalog
 * (pure logic, no I/O). Plan and owner steps: docs/backend/SOFASCORE_CATALOG_ID_MAPPING.md.
 *
 * THE RULE: nothing here reads a name to decide anything. Names appear only as
 * optional `displayName` fields that are copied through to the report for the
 * owner to read; no function compares, normalises or searches them.
 *
 * Clubs. A SportsMonks team id and a SofaScore team id are the same club when
 * they sit on the SAME SIDE (home with home, away with away) of the same
 * fixtures, where each fixture is mapped on both providers (the ID bridge), and
 * they never sit on different sides or with different partners anywhere.
 *
 * Players. A SportsMonks player and a SofaScore player are the same person when,
 * in a fixture mapped on both providers, they are on the same side, wear the
 * same shirt number and have a compatible position, the club they play for is
 * the mapped club of that side, and the pairing is the only one either of them
 * has anywhere. Anything else is unmapped with a reason code.
 */

/**
 * Clubs: how many distinct fixtures must agree. One fixture shows only one home
 * and one away pairing; two agreeing fixtures show the pairing is not a one-off
 * (a team cannot be home in both fixtures against the same opponent by accident
 * of a swapped side).
 */
export const CLUB_MIN_AGREEING_FIXTURES = 2;

/**
 * Players: a pairing backed by this many distinct fixtures is "multi_match",
 * the confidence the apply script writes by default.
 */
export const PLAYER_STRONG_MATCHES = 2;

/**
 * Players: the least evidence that can ever be proposed. One match qualifies
 * ONLY when nothing anywhere contradicts it (no second candidate for either
 * person, no match where both appear but disagree, no duplicate shirt, club
 * agrees). It is reported as "single_match" and the apply script leaves it out
 * unless the owner asks for it with --include-single-match. Within one match the
 * side plus shirt pair is a bijection (two players cannot share a shirt on one
 * side), so the residual risk is a wrong shirt number in one provider's data,
 * which a second match would expose.
 */
export const PLAYER_MIN_MATCHES = 1;

export type Side = "home" | "away";
export type Pos = "G" | "D" | "M" | "F";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** A fixture mapped on both providers, with the SofaScore event's team ids. */
export interface MappedFixture {
  readonly fixtureId: string;
  /** SportsMonks team ids of the internal home and away team (via team mappings). */
  readonly smHomeTeamId: string | null;
  readonly smAwayTeamId: string | null;
  /** SofaScore team ids of the event mapped to this fixture. */
  readonly sofaHomeTeamId: string;
  readonly sofaAwayTeamId: string;
}

export interface CatalogClub {
  readonly internalId: string;
  readonly sportsmonksId: string | null;
  /** Active SofaScore team mapping that exists today, if any. */
  readonly existingSofascoreId: string | null;
  /** Report only. Never compared. */
  readonly displayName?: string | null;
}

export interface SportsmonksLineupEntry {
  readonly fixtureId: string;
  readonly side: Side;
  readonly internalTeamId: string;
  readonly internalPlayerId: string;
  readonly shirt: number | null;
  readonly position: Pos | null;
}

export interface SofascoreLineupEntry {
  readonly fixtureId: string;
  readonly side: Side;
  readonly sofascorePlayerId: string;
  readonly shirt: number | null;
  readonly position: Pos | null;
  /** Report only. Never compared. */
  readonly displayName?: string | null;
}

export interface CatalogPlayer {
  readonly internalId: string;
  readonly sportsmonksId: string | null;
  readonly existingSofascoreId: string | null;
  /** Report only. Never compared. */
  readonly displayName?: string | null;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export type ClubReason =
  | "no_sportsmonks_mapping"
  | "no_shared_fixtures"
  | "too_little_evidence"
  | "conflicting_sofascore_teams"
  | "sofascore_team_claimed_by_other_club"
  | "sofascore_id_mapped_to_other_club"
  | "conflicts_with_existing_mapping";

export type PlayerReason =
  | "no_sportsmonks_mapping"
  | "no_lineup_evidence"
  | "no_shirt_or_position_agreement"
  | "club_unmapped"
  | "club_mismatch"
  | "duplicate_shirt_in_lineup"
  | "contradicted_in_match"
  | "ambiguous_multiple_sofascore_candidates"
  | "sofascore_player_claimed_by_multiple"
  | "sofascore_id_mapped_to_other_player"
  | "conflicts_with_existing_mapping"
  | "below_minimum_evidence";

export interface ProposedClub {
  readonly internalId: string;
  readonly sportsmonksId: string;
  readonly sofascoreId: string;
  readonly fixtures: number;
  /** "new" or "already_mapped" (an active mapping equal to the proposal). */
  readonly status: "new" | "already_mapped";
  readonly displayName?: string | null;
}

export interface UnmappedClub {
  readonly internalId: string;
  readonly sportsmonksId: string | null;
  readonly reason: ClubReason;
  readonly bestEvidence: string;
  readonly displayName?: string | null;
}

export interface ProposedPlayer {
  readonly internalId: string;
  readonly sportsmonksId: string;
  readonly sofascoreId: string;
  readonly matches: number;
  readonly confidence: "multi_match" | "single_match";
  readonly status: "new" | "already_mapped";
  readonly shirts: readonly number[];
  readonly displayName?: string | null;
  readonly sofascoreDisplayName?: string | null;
}

export interface UnmappedPlayer {
  readonly internalId: string;
  readonly sportsmonksId: string | null;
  readonly reason: PlayerReason;
  readonly bestEvidence: string;
  readonly displayName?: string | null;
}

export interface ClubMappingResult {
  readonly proposed: readonly ProposedClub[];
  readonly unmapped: readonly UnmappedClub[];
  /** Catalog clubs that keep an existing mapping with no fixture evidence either way. */
  readonly existingUnverified: readonly string[];
  /** internal club id to the SofaScore team id the player pass will rely on. */
  readonly resolved: ReadonlyMap<string, string>;
}

export interface PlayerMappingResult {
  readonly proposed: readonly ProposedPlayer[];
  readonly unmapped: readonly UnmappedPlayer[];
  readonly existingUnverified: readonly string[];
  readonly sofascorePlayersSeen: number;
  readonly sofascorePlayersWithoutCatalogMatch: number;
}

// ---------------------------------------------------------------------------
// Clubs
// ---------------------------------------------------------------------------

const add = <K, V>(map: Map<K, Set<V>>, key: K, value: V) => {
  const set = map.get(key);
  if (set) set.add(value);
  else map.set(key, new Set([value]));
};

export function mapClubs(
  clubs: readonly CatalogClub[],
  fixtures: readonly MappedFixture[],
): ClubMappingResult {
  // sportsmonks team id to sofascore team id to the fixtures that say so.
  const votes = new Map<string, Map<string, Set<string>>>();
  const reverse = new Map<string, Set<string>>();
  const addVote = (sm: string | null, sofa: string, fixtureId: string) => {
    if (sm === null) return;
    let inner = votes.get(sm);
    if (!inner) votes.set(sm, (inner = new Map()));
    add(inner, sofa, fixtureId);
    add(reverse, sofa, sm);
  };
  for (const f of fixtures) {
    addVote(f.smHomeTeamId, f.sofaHomeTeamId, f.fixtureId);
    addVote(f.smAwayTeamId, f.sofaAwayTeamId, f.fixtureId);
  }
  const existingOwner = new Map<string, string>();
  for (const c of clubs)
    if (c.existingSofascoreId !== null) existingOwner.set(c.existingSofascoreId, c.internalId);

  const proposed: ProposedClub[] = [];
  const unmapped: UnmappedClub[] = [];
  const existingUnverified: string[] = [];
  const resolved = new Map<string, string>();

  for (const c of clubs) {
    const out = (reason: ClubReason, bestEvidence: string) =>
      unmapped.push({
        internalId: c.internalId,
        sportsmonksId: c.sportsmonksId,
        reason,
        bestEvidence,
        displayName: c.displayName,
      });
    if (c.sportsmonksId === null) {
      out("no_sportsmonks_mapping", "the club has no active SportsMonks mapping");
      continue;
    }
    const inner = votes.get(c.sportsmonksId);
    if (!inner || inner.size === 0) {
      if (c.existingSofascoreId !== null) {
        existingUnverified.push(c.internalId);
        resolved.set(c.internalId, c.existingSofascoreId);
      } else out("no_shared_fixtures", "no fixture mapped on both providers has this club");
      continue;
    }
    const summary = [...inner].map(([s, fx]) => `${s}x${fx.size}`).join(", ");
    if (inner.size > 1) {
      out("conflicting_sofascore_teams", `SofaScore teams on the same side: ${summary}`);
      continue;
    }
    const [sofa, fx] = [...inner][0];
    const others = [...(reverse.get(sofa) ?? [])].filter((x) => x !== c.sportsmonksId);
    if (others.length > 0) {
      out(
        "sofascore_team_claimed_by_other_club",
        `${sofa} also sits on the same side as SportsMonks teams ${others.join(", ")}`,
      );
      continue;
    }
    if (fx.size < CLUB_MIN_AGREEING_FIXTURES) {
      out(
        "too_little_evidence",
        `${sofa} in ${fx.size} fixture(s), need ${CLUB_MIN_AGREEING_FIXTURES}`,
      );
      continue;
    }
    if (c.existingSofascoreId !== null && c.existingSofascoreId !== sofa) {
      out(
        "conflicts_with_existing_mapping",
        `fixtures say ${sofa}, the active mapping says ${c.existingSofascoreId}`,
      );
      continue;
    }
    const owner = existingOwner.get(sofa);
    if (owner !== undefined && owner !== c.internalId) {
      out(
        "sofascore_id_mapped_to_other_club",
        `${sofa} is already mapped to another internal club`,
      );
      continue;
    }
    proposed.push({
      internalId: c.internalId,
      sportsmonksId: c.sportsmonksId,
      sofascoreId: sofa,
      fixtures: fx.size,
      status: c.existingSofascoreId === sofa ? "already_mapped" : "new",
      displayName: c.displayName,
    });
    resolved.set(c.internalId, sofa);
  }
  return { proposed, unmapped, existingUnverified, resolved };
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

/**
 * Same line, or neighbouring lines (D-M, M-F). A goalkeeper is only compatible
 * with a goalkeeper. A missing position on either side does not disagree.
 */
export function positionsCompatible(a: Pos | null, b: Pos | null): boolean {
  if (a === null || b === null) return true;
  if (a === b) return true;
  const order = { G: 0, D: 1, M: 2, F: 3 } as const;
  if (a === "G" || b === "G") return false;
  return Math.abs(order[a] - order[b]) === 1;
}

const key = (a: string, b: string) => `${a}\u0000${b}`;

export function mapPlayers(input: {
  readonly players: readonly CatalogPlayer[];
  readonly fixtures: readonly MappedFixture[];
  readonly smLineups: readonly SportsmonksLineupEntry[];
  readonly sofaLineups: readonly SofascoreLineupEntry[];
  /** Internal club id to SofaScore team id (ClubMappingResult.resolved). */
  readonly resolvedClubs: ReadonlyMap<string, string>;
  /** Internal player id that every active SofaScore player mapping already points at. */
  readonly existingSofaOwners: ReadonlyMap<string, string>;
}): PlayerMappingResult {
  const { players, fixtures, smLineups, sofaLineups, resolvedClubs, existingSofaOwners } = input;
  const fixtureById = new Map(fixtures.map((f) => [f.fixtureId, f]));

  const group = <T extends { fixtureId: string; side: Side }>(rows: readonly T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const k = key(r.fixtureId, r.side);
      const list = m.get(k);
      if (list) list.push(r);
      else m.set(k, [r]);
    }
    return m;
  };
  const smBySide = group(smLineups);
  const sofaBySide = group(sofaLineups);

  // pair key -> evidence
  const agree = new Map<
    string,
    { p: string; s: string; fixtures: Set<string>; shirts: Set<number> }
  >();
  const contradicted = new Set<string>(); // internal player ids
  const contradictedSofa = new Set<string>();
  const duplicateShirt = new Set<string>(); // internal player ids
  const duplicateShirtSofa = new Set<string>();
  const clubIssue = new Map<string, "club_unmapped" | "club_mismatch">();
  const seenSm = new Set<string>();
  const seenSofa = new Set<string>();
  const sofaNames = new Map<string, string | null | undefined>();

  for (const [k, smRows] of smBySide) {
    const sofaRows = sofaBySide.get(k) ?? [];
    const sample = smRows[0];
    const fixture = fixtureById.get(sample.fixtureId);
    if (!fixture) continue;
    for (const r of smRows) seenSm.add(r.internalPlayerId);
    for (const r of sofaRows) {
      seenSofa.add(r.sofascorePlayerId);
      sofaNames.set(r.sofascorePlayerId, r.displayName);
    }

    // Shirt numbers must be unique on a side, or the pairing is not decidable.
    const smShirt = new Map<number, SportsmonksLineupEntry[]>();
    for (const r of smRows)
      if (r.shirt !== null) smShirt.set(r.shirt, [...(smShirt.get(r.shirt) ?? []), r]);
    const sofaShirt = new Map<number, SofascoreLineupEntry[]>();
    for (const r of sofaRows)
      if (r.shirt !== null) sofaShirt.set(r.shirt, [...(sofaShirt.get(r.shirt) ?? []), r]);
    for (const [, list] of smShirt)
      if (list.length > 1) for (const r of list) duplicateShirt.add(r.internalPlayerId);
    for (const [, list] of sofaShirt)
      if (list.length > 1) for (const r of list) duplicateShirtSofa.add(r.sofascorePlayerId);

    const sofaTeam = sample.side === "home" ? fixture.sofaHomeTeamId : fixture.sofaAwayTeamId;
    for (const [shirt, smList] of smShirt) {
      const sofaList = sofaShirt.get(shirt);
      if (smList.length !== 1 || !sofaList || sofaList.length !== 1) continue;
      const sm = smList[0];
      const sofa = sofaList[0];
      if (!positionsCompatible(sm.position, sofa.position)) continue; // handled as a contradiction below
      const mapped = resolvedClubs.get(sm.internalTeamId);
      if (mapped === undefined) {
        clubIssue.set(sm.internalPlayerId, "club_unmapped");
        continue;
      }
      if (mapped !== sofaTeam) {
        clubIssue.set(sm.internalPlayerId, "club_mismatch");
        continue;
      }
      const pk = key(sm.internalPlayerId, sofa.sofascorePlayerId);
      const e = agree.get(pk) ?? {
        p: sm.internalPlayerId,
        s: sofa.sofascorePlayerId,
        fixtures: new Set<string>(),
        shirts: new Set<number>(),
      };
      e.fixtures.add(sm.fixtureId);
      e.shirts.add(shirt);
      agree.set(pk, e);
    }
  }

  // Second pass: a match where BOTH of an agreed pair appear but do not agree there.
  const pairsByPlayer = new Map<string, Set<string>>();
  const pairsBySofa = new Map<string, Set<string>>();
  for (const e of agree.values()) {
    add(pairsByPlayer, e.p, e.s);
    add(pairsBySofa, e.s, e.p);
  }
  for (const e of agree.values()) {
    for (const [k, smRows] of smBySide) {
      const mine = smRows.find((r) => r.internalPlayerId === e.p);
      if (!mine) continue;
      const sofaRows = sofaBySide.get(k) ?? [];
      const theirs = sofaRows.find((r) => r.sofascorePlayerId === e.s);
      const wrongSide = sofaBySide.get(key(mine.fixtureId, mine.side === "home" ? "away" : "home"));
      const onOtherSide = wrongSide?.some((r) => r.sofascorePlayerId === e.s) ?? false;
      if (onOtherSide) {
        contradicted.add(e.p);
        contradictedSofa.add(e.s);
      } else if (
        theirs &&
        (mine.shirt === null ||
          theirs.shirt === null ||
          mine.shirt !== theirs.shirt ||
          !positionsCompatible(mine.position, theirs.position))
      ) {
        contradicted.add(e.p);
        contradictedSofa.add(e.s);
      }
    }
  }

  const proposed: ProposedPlayer[] = [];
  const unmapped: UnmappedPlayer[] = [];
  const existingUnverified: string[] = [];
  const matchedSofa = new Set<string>();

  for (const c of players) {
    const fail = (reason: PlayerReason, bestEvidence: string) =>
      unmapped.push({
        internalId: c.internalId,
        sportsmonksId: c.sportsmonksId,
        reason,
        bestEvidence,
        displayName: c.displayName,
      });
    if (c.sportsmonksId === null) {
      fail("no_sportsmonks_mapping", "the player has no active SportsMonks mapping");
      continue;
    }
    const cands = [...(pairsByPlayer.get(c.internalId) ?? [])];
    const evidenceOf = (s: string) => agree.get(key(c.internalId, s))!;
    const summary = cands.map((s) => `${s}x${evidenceOf(s).fixtures.size}`).join(", ");
    if (cands.length === 0) {
      if (c.existingSofascoreId !== null) {
        existingUnverified.push(c.internalId);
        continue;
      }
      if (duplicateShirt.has(c.internalId))
        fail("duplicate_shirt_in_lineup", "two lineup entries share a shirt on one side");
      else if (contradicted.has(c.internalId)) fail("contradicted_in_match", "see another pairing");
      else if (clubIssue.has(c.internalId))
        fail(clubIssue.get(c.internalId)!, "the club of the lineup is not resolved to this side");
      else if (seenSm.has(c.internalId))
        fail(
          "no_shirt_or_position_agreement",
          "in a mapped lineup, but no SofaScore player on that side with the same shirt and a compatible position",
        );
      else fail("no_lineup_evidence", "not in any lineup of a fixture mapped on both providers");
      continue;
    }
    if (duplicateShirt.has(c.internalId)) {
      fail("duplicate_shirt_in_lineup", `candidates ${summary}; a lineup repeats a shirt`);
      continue;
    }
    if (cands.length > 1) {
      fail("ambiguous_multiple_sofascore_candidates", `candidates ${summary}`);
      continue;
    }
    const s = cands[0];
    const ev = evidenceOf(s);
    if (contradicted.has(c.internalId) || contradictedSofa.has(s)) {
      fail("contradicted_in_match", `candidate ${s}x${ev.fixtures.size}, but a match disagrees`);
      continue;
    }
    if (duplicateShirtSofa.has(s)) {
      fail("duplicate_shirt_in_lineup", `candidate ${s}; a SofaScore lineup repeats a shirt`);
      continue;
    }
    const claimants = [...(pairsBySofa.get(s) ?? [])].filter((x) => x !== c.internalId);
    if (claimants.length > 0) {
      fail(
        "sofascore_player_claimed_by_multiple",
        `${s} also pairs with ${claimants.length} other SportsMonks player(s)`,
      );
      continue;
    }
    const owner = existingSofaOwners.get(s);
    if (owner !== undefined && owner !== c.internalId) {
      fail(
        "sofascore_id_mapped_to_other_player",
        `${s} already carries a mapping to another player`,
      );
      continue;
    }
    if (c.existingSofascoreId !== null && c.existingSofascoreId !== s) {
      fail(
        "conflicts_with_existing_mapping",
        `lineups say ${s}, the active mapping says ${c.existingSofascoreId}`,
      );
      continue;
    }
    if (ev.fixtures.size < PLAYER_MIN_MATCHES) {
      fail("below_minimum_evidence", `${s}x${ev.fixtures.size}`);
      continue;
    }
    matchedSofa.add(s);
    proposed.push({
      internalId: c.internalId,
      sportsmonksId: c.sportsmonksId,
      sofascoreId: s,
      matches: ev.fixtures.size,
      confidence: ev.fixtures.size >= PLAYER_STRONG_MATCHES ? "multi_match" : "single_match",
      status: c.existingSofascoreId === s ? "already_mapped" : "new",
      shirts: [...ev.shirts].sort((a, b) => a - b),
      displayName: c.displayName,
      sofascoreDisplayName: sofaNames.get(s),
    });
  }
  return {
    proposed,
    unmapped,
    existingUnverified,
    sofascorePlayersSeen: seenSofa.size,
    sofascorePlayersWithoutCatalogMatch: [...seenSofa].filter((s) => !matchedSofa.has(s)).length,
  };
}
