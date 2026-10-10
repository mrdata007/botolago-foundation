/**
 * SofaScore team pairing PROPOSAL (pure logic, no I/O).
 *
 * Suggests which internal team each SofaScore team is, using only fixtures that
 * both sides already agree on. It never decides: the owner reads the proposal
 * and passes the approved JSON to the bridge as `--teams`.
 *
 * A fixture counts as evidence only when it pairs with exactly one event:
 * same season round, same Africa/Casablanca kickoff date and, when several
 * events share that date, the same kickoff instant. An event wanted by two
 * fixtures, a fixture with two candidate events, and postponed or cancelled
 * events (their date is not the real one) are left out and counted.
 */
import { casablancaDate, type InternalFixture, type SofascoreEvent } from "./sofascore-id-bridge";

export const MIN_EVIDENCE = 3;

export type ProposalStatus =
  | "proposed"
  | "too_little_evidence"
  | "conflict"
  | "duplicate_internal_team"
  | "no_evidence";

export interface TeamEvidence {
  readonly sofascoreTeamId: number;
  /** Internal team uuid to the number of matched fixtures that put it on this team's side. */
  readonly votes: Readonly<Record<string, number>>;
  readonly status: ProposalStatus;
}

export interface TeamProposal {
  /** `{sofascoreTeamId: internalUuid}`, only teams with status `proposed`. */
  readonly proposal: Readonly<Record<string, string>>;
  readonly evidence: readonly TeamEvidence[];
  readonly matchedFixtures: number;
  readonly fixturesTotal: number;
  readonly fixturesAmbiguous: number;
  readonly fixturesWithoutEvent: number;
  readonly eventsIgnoredStatus: number;
  /** Internal teams in the fixtures that no proposal covers. */
  readonly internalTeamsUnpaired: readonly string[];
}

const EXCLUDED_STATUS = new Set(["postponed", "canceled", "cancelled"]);

export function proposeTeams(
  events: readonly SofascoreEvent[],
  fixtures: readonly InternalFixture[],
  minEvidence = MIN_EVIDENCE,
): TeamProposal {
  const usable = events.filter((e) => !EXCLUDED_STATUS.has(e.status.type));
  const eventsIgnoredStatus = events.length - usable.length;

  const picks = new Map<string, SofascoreEvent>();
  let fixturesAmbiguous = 0;
  let fixturesWithoutEvent = 0;
  for (const fixture of fixtures) {
    if (fixture.roundNumber === null) {
      fixturesWithoutEvent += 1;
      continue;
    }
    const kickoff = Date.parse(fixture.kickoffAt);
    const date = casablancaDate(new Date(kickoff));
    let candidates = usable.filter(
      (e) =>
        (e.roundInfo?.round ?? null) === fixture.roundNumber &&
        casablancaDate(new Date(e.startTimestamp * 1000)) === date,
    );
    if (candidates.length > 1)
      candidates = candidates.filter((e) => e.startTimestamp * 1000 === kickoff);
    if (candidates.length === 0) fixturesWithoutEvent += 1;
    else if (candidates.length > 1) fixturesAmbiguous += 1;
    else picks.set(fixture.id, candidates[0]);
  }

  // An event wanted by two fixtures proves nothing about either.
  const wantedBy = new Map<number, string[]>();
  for (const [fixtureId, event] of picks)
    wantedBy.set(event.id, [...(wantedBy.get(event.id) ?? []), fixtureId]);
  for (const ids of wantedBy.values())
    if (ids.length > 1)
      for (const id of ids) {
        picks.delete(id);
        fixturesAmbiguous += 1;
      }

  const votes = new Map<number, Map<string, number>>();
  const vote = (teamId: number, internal: string) => {
    const tally = votes.get(teamId) ?? new Map<string, number>();
    tally.set(internal, (tally.get(internal) ?? 0) + 1);
    votes.set(teamId, tally);
  };
  const fixtureById = new Map(fixtures.map((f) => [f.id, f]));
  for (const [fixtureId, event] of picks) {
    const fixture = fixtureById.get(fixtureId)!;
    vote(event.homeTeam.id, fixture.homeTeamId);
    vote(event.awayTeam.id, fixture.awayTeamId);
  }
  // Teams seen in any event, evidence or not, so a silent team is reported.
  for (const e of events) {
    if (!votes.has(e.homeTeam.id)) votes.set(e.homeTeam.id, new Map());
    if (!votes.has(e.awayTeam.id)) votes.set(e.awayTeam.id, new Map());
  }

  const ranked = [...votes.entries()]
    .sort(([a], [b]) => a - b)
    .map(([sofascoreTeamId, tally]) => {
      const entries = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      let status: ProposalStatus;
      if (entries.length === 0) status = "no_evidence";
      else if (entries.length > 1) status = "conflict";
      else if (entries[0][1] < minEvidence) status = "too_little_evidence";
      else status = "proposed";
      return { sofascoreTeamId, entries, status: status as ProposalStatus };
    });

  // Two SofaScore teams cannot both be the same internal team.
  const claimed = new Map<string, number>();
  for (const r of ranked)
    if (r.status === "proposed")
      claimed.set(r.entries[0][0], (claimed.get(r.entries[0][0]) ?? 0) + 1);
  for (const r of ranked)
    if (r.status === "proposed" && (claimed.get(r.entries[0][0]) ?? 0) > 1)
      r.status = "duplicate_internal_team";

  const proposal: Record<string, string> = {};
  for (const r of ranked)
    if (r.status === "proposed") proposal[String(r.sofascoreTeamId)] = r.entries[0][0];

  const covered = new Set(Object.values(proposal));
  const internalTeams = new Set(fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId]));
  return {
    proposal,
    evidence: ranked.map((r) => ({
      sofascoreTeamId: r.sofascoreTeamId,
      votes: Object.fromEntries(r.entries),
      status: r.status,
    })),
    matchedFixtures: picks.size,
    fixturesTotal: fixtures.length,
    fixturesAmbiguous,
    fixturesWithoutEvent,
    eventsIgnoredStatus,
    internalTeamsUnpaired: [...internalTeams].filter((t) => !covered.has(t)).sort(),
  };
}
