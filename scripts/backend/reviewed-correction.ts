/**
 * Reviewed corrections for finished fixtures whose SportsMonks statistics never
 * arrived (owner decision 2026-10-10, "option 1"). Sofascore's lineups and
 * incidents give the eight simple-scoring facts: minutes, goals, own goals,
 * goals conceded, clean sheet, yellow cards, red cards and second-yellow
 * dismissals. A person reviews the proposal before anything is recorded, and
 * it is recorded through the existing api.service_record_fantasy_observation
 * with source `reviewed-correction`, which every database guard still checks.
 *
 * Pure functions only: no network, no database. The two entry scripts
 * (reviewed-correction-fetch.ts, reviewed-correction-prepare.ts and
 * reviewed-correction-record.ts) do the I/O.
 *
 * Identity rule: a Sofascore player becomes one of ours only through an active
 * reviewed Sofascore mapping (`linked`), or as a `suggested` match on the same
 * club, the same shirt number at kickoff and a compatible position, which the
 * owner confirms by approving the proposal. Never by name.
 */
import type {
  MatchSide,
  PerformanceIncident,
  PerformanceLineupPlayer,
} from "../../src/backend/football/provider/performance-contracts";

export const CORE_FIELDS = [
  "minutes",
  "goals",
  "cleanSheet",
  "goalsConceded",
  "yellowCards",
  "redCards",
  "secondYellowDismissals",
  "ownGoals",
] as const;
export type CoreField = (typeof CORE_FIELDS)[number];

export interface SofascoreMatchCapture {
  readonly matchId: string;
  readonly kickoffAt: string;
  readonly homeName: string;
  readonly awayName: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly players: readonly PerformanceLineupPlayer[];
  readonly incidents: readonly PerformanceIncident[];
  readonly capturedAt: string;
}

export interface SquadMember {
  readonly playerId: string;
  readonly teamId: string;
  readonly displayName: string;
  readonly position: string; // goalkeeper | defender | midfielder | forward
  readonly shirtNumber: number | null;
  readonly sofascoreId: string | null;
}

export interface FixtureSnapshot {
  readonly fixtureId: string;
  readonly fixtureExternalId: string;
  readonly kickoffAt: string;
  readonly status: string;
  readonly finalized: boolean;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeTeamName: string;
  readonly awayTeamName: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly gameweek: number | null;
  readonly gameweekStatus: string | null;
  readonly adaptiveEnabled: boolean;
  readonly latestDigest: string | null;
  readonly latestSource: string | null;
  readonly members: readonly SquadMember[];
  /** Football player ids of both clubs' Fantasy players who are members at kickoff. */
  readonly fantasyPlayerIds: readonly string[];
}

export type Identity = "linked" | "suggested" | "unmatched";

export interface ProposalRow {
  readonly playerId: string | null;
  readonly teamId: string;
  readonly sofascoreId: string;
  readonly sofascoreName: string;
  readonly ourName: string | null;
  readonly identity: Identity;
  readonly started: boolean;
  readonly stats: Readonly<Record<CoreField, number | boolean>>;
}

export interface Proposal {
  readonly schemaVersion: 1;
  readonly fixtureId: string;
  readonly fixtureExternalId: string;
  readonly gameweek: number | null;
  readonly homeTeamName: string;
  readonly awayTeamName: string;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly sofascoreMatchId: string;
  readonly capturedAt: string;
  readonly expectedDigest: string | null;
  readonly rows: readonly ProposalRow[];
  readonly verifiedNonParticipants: readonly string[];
  /** Plain-language reasons this proposal cannot be recorded as it stands. */
  readonly blockers: readonly string[];
  /** Things the reviewer should look at; they do not block. */
  readonly notes: readonly string[];
}

const POSITION_LETTER: Record<string, string> = {
  goalkeeper: "G",
  defender: "D",
  midfielder: "M",
  forward: "F",
};

/** Our fixture and the Sofascore match are the same game: kickoff within 3 h and the same score. */
export function findSofascoreMatch(
  fixture: FixtureSnapshot,
  matches: readonly SofascoreMatchCapture[],
): SofascoreMatchCapture | null {
  const kickoff = Date.parse(fixture.kickoffAt);
  const candidates = matches.filter(
    (match) =>
      Math.abs(Date.parse(match.kickoffAt) - kickoff) <= 3 * 3_600_000 &&
      match.homeScore === fixture.homeScore &&
      match.awayScore === fixture.awayScore,
  );
  return candidates.length === 1 ? candidates[0]! : null;
}

function minuteOf(incident: PerformanceIncident): number {
  return Math.min(incident.minute, 90);
}

function identify(
  player: PerformanceLineupPlayer,
  teamId: string,
  members: readonly SquadMember[],
): { member: SquadMember | null; identity: Identity } {
  const linked = members.find((member) => member.sofascoreId === player.externalId);
  if (linked) {
    return linked.teamId === teamId
      ? { member: linked, identity: "linked" }
      : { member: null, identity: "unmatched" };
  }
  if (player.shirtNumber === null) return { member: null, identity: "unmatched" };
  const byShirt = members.filter(
    (member) =>
      member.teamId === teamId &&
      member.sofascoreId === null &&
      member.shirtNumber === player.shirtNumber &&
      (player.position === null || POSITION_LETTER[member.position] === player.position),
  );
  return byShirt.length === 1
    ? { member: byShirt[0]!, identity: "suggested" }
    : { member: null, identity: "unmatched" };
}

export function buildProposal(fixture: FixtureSnapshot, match: SofascoreMatchCapture): Proposal {
  const blockers: string[] = [];
  const notes: string[] = [];
  if (fixture.status !== "finished" || !fixture.finalized)
    blockers.push("Our fixture is not marked finished and final yet.");
  if (!fixture.adaptiveEnabled)
    blockers.push("Adaptive scoring is not switched on for this gameweek.");
  if (
    fixture.gameweekStatus !== null &&
    ["finalizing", "finalized", "corrected"].includes(fixture.gameweekStatus)
  )
    blockers.push(`The gameweek is already ${fixture.gameweekStatus}; this path cannot change it.`);
  if (fixture.homeScore === null || fixture.awayScore === null)
    blockers.push("Our fixture has no final score.");

  const teamOf = (side: MatchSide) => (side === "home" ? fixture.homeTeamId : fixture.awayTeamId);
  const bySofascoreId = new Map(match.players.map((player) => [player.externalId, player]));

  // Who came on, went off or was sent off, and when.
  const cameOn = new Map<string, number>();
  const wentOff = new Map<string, number>();
  const sentOff = new Map<string, number>();
  for (const incident of match.incidents) {
    if (incident.kind === "substitution") {
      if (incident.playerIn?.externalId)
        cameOn.set(incident.playerIn.externalId, minuteOf(incident));
      if (incident.playerOut?.externalId)
        wentOff.set(incident.playerOut.externalId, minuteOf(incident));
    }
    if (
      (incident.kind === "red_card" || incident.kind === "second_yellow") &&
      incident.player?.externalId
    )
      sentOff.set(incident.player.externalId, minuteOf(incident));
    if (incident.kind === "unknown" && incident.rawClass !== "ownGoal")
      notes.push(
        `Sofascore event "${incident.rawType}/${incident.rawClass ?? "-"}" at ${incident.minute}' was not used.`,
      );
  }

  // Goals, credited to a side; own goals by the player's own lineup side.
  interface Goal {
    readonly creditedSide: MatchSide;
    readonly minute: number;
    readonly scorer: string | null;
    readonly own: boolean;
  }
  const goals: Goal[] = [];
  for (const incident of match.incidents) {
    const scorer = incident.player?.externalId ?? null;
    if (incident.kind === "goal" || incident.kind === "penalty_goal") {
      goals.push({ creditedSide: incident.side, minute: minuteOf(incident), scorer, own: false });
    } else if (incident.rawType === "goal" && incident.rawClass === "ownGoal") {
      const ownSide = scorer ? bySofascoreId.get(scorer)?.side : undefined;
      if (!ownSide) {
        blockers.push(`An own goal at ${incident.minute}' names nobody in the lineups.`);
        continue;
      }
      goals.push({
        creditedSide: ownSide === "home" ? "away" : "home",
        minute: minuteOf(incident),
        scorer,
        own: true,
      });
      notes.push(`Own goal at ${incident.minute}': check the player.`);
    }
  }
  const homeGoals = goals.filter((goal) => goal.creditedSide === "home").length;
  const awayGoals = goals.filter((goal) => goal.creditedSide === "away").length;
  if (homeGoals !== fixture.homeScore || awayGoals !== fixture.awayScore)
    blockers.push(
      `Sofascore's goals add up to ${homeGoals}-${awayGoals}, our final score is ${fixture.homeScore}-${fixture.awayScore}.`,
    );

  const rows: ProposalRow[] = [];
  const usedPlayers = new Set<string>();
  for (const player of match.players) {
    const appeared = player.starter || cameOn.has(player.externalId);
    if (!appeared) continue;
    const teamId = teamOf(player.side);
    const start = player.starter ? 0 : cameOn.get(player.externalId)!;
    const end = Math.min(
      wentOff.get(player.externalId) ?? 90,
      sentOff.get(player.externalId) ?? 90,
      90,
    );
    const provided = player.stats?.minutesPlayed;
    const minutes = Math.min(
      90,
      Math.max(
        1,
        typeof provided === "number" && Number.isSafeInteger(provided) && provided > 0
          ? provided
          : end - start,
      ),
    );
    const scored = goals.filter((goal) => goal.scorer === player.externalId);
    const opponentGoals = goals.filter(
      (goal) => goal.creditedSide !== player.side && goal.minute > start && goal.minute <= end,
    ).length;
    const opponentScore = player.side === "home" ? fixture.awayScore! : fixture.homeScore!;
    const goalsConceded = Math.min(opponentGoals, opponentScore ?? 0);
    const cards = (kind: PerformanceIncident["kind"]) =>
      match.incidents.filter(
        (incident) => incident.kind === kind && incident.player?.externalId === player.externalId,
      ).length;
    const secondYellow = cards("second_yellow") > 0 ? 1 : 0;
    const stats: Record<CoreField, number | boolean> = {
      minutes,
      goals: scored.filter((goal) => !goal.own).length,
      ownGoals: scored.filter((goal) => goal.own).length,
      goalsConceded,
      cleanSheet: minutes >= 60 && goalsConceded === 0,
      // The database refuses a second-yellow dismissal alongside other cards
      // (adaptive_disciplinary_overlap_review_required): it already counts both.
      yellowCards: secondYellow ? 0 : Math.min(cards("yellow_card"), 1),
      redCards: secondYellow ? 0 : Math.min(cards("red_card"), 1),
      secondYellowDismissals: secondYellow,
    };
    const { member, identity } = identify(player, teamId, fixture.members);
    if (member && usedPlayers.has(member.playerId)) {
      blockers.push(`${player.name} matches a player already used in this match.`);
    }
    if (member) usedPlayers.add(member.playerId);
    rows.push({
      playerId: member?.playerId ?? null,
      teamId,
      sofascoreId: player.externalId,
      sofascoreName: player.name,
      ourName: member?.displayName ?? null,
      identity,
      started: player.starter,
      stats,
    });
  }

  // Starters we cannot place: the database allows at most 4, counted per club.
  const unmatchedStarters = rows.filter((row) => row.playerId === null && row.started);
  if (unmatchedStarters.length > 4)
    blockers.push(
      `${unmatchedStarters.length} starters have no player of ours (at most 4 allowed).`,
    );
  for (const row of rows.filter((r) => r.playerId === null)) {
    const involved =
      (row.stats.goals as number) > 0 ||
      (row.stats.ownGoals as number) > 0 ||
      (row.stats.yellowCards as number) > 0 ||
      (row.stats.redCards as number) > 0 ||
      (row.stats.secondYellowDismissals as number) > 0;
    if (!row.started) blockers.push(`Substitute ${row.sofascoreName} has no player of ours.`);
    else if (involved)
      blockers.push(`Starter ${row.sofascoreName} scored or was booked but has no player of ours.`);
  }
  for (const side of ["home", "away"] as const) {
    const starters = match.players.filter((player) => player.side === side && player.starter);
    if (starters.length !== 11)
      blockers.push(`Sofascore lists ${starters.length} ${side} starters, not 11.`);
  }

  // Everyone else on either club did not play. Only claimed for a club whose
  // every appearing player is identified: otherwise an unplaced row could be
  // one of them.
  const clubsComplete = new Set(
    [fixture.homeTeamId, fixture.awayTeamId].filter(
      (teamId) => !rows.some((row) => row.teamId === teamId && row.playerId === null),
    ),
  );
  const played = new Set(rows.map((row) => row.playerId).filter(Boolean) as string[]);
  const memberTeam = new Map(fixture.members.map((member) => [member.playerId, member.teamId]));
  const verifiedNonParticipants = [...new Set(fixture.fantasyPlayerIds)]
    .filter((id) => !played.has(id) && clubsComplete.has(memberTeam.get(id) ?? ""))
    .sort();
  for (const teamId of [fixture.homeTeamId, fixture.awayTeamId])
    if (!clubsComplete.has(teamId))
      notes.push(
        `${teamId === fixture.homeTeamId ? fixture.homeTeamName : fixture.awayTeamName}: not every player who appeared is identified, so its other Fantasy players stay "unknown" (the match then scores only once they are).`,
      );
  if (rows.some((row) => row.identity === "suggested"))
    notes.push(
      "Rows marked SUGGESTED are matched by club and shirt number only: please confirm each.",
    );

  return {
    schemaVersion: 1,
    fixtureId: fixture.fixtureId,
    fixtureExternalId: fixture.fixtureExternalId,
    gameweek: fixture.gameweek,
    homeTeamName: fixture.homeTeamName,
    awayTeamName: fixture.awayTeamName,
    homeScore: fixture.homeScore ?? -1,
    awayScore: fixture.awayScore ?? -1,
    sofascoreMatchId: match.matchId,
    capturedAt: match.capturedAt,
    expectedDigest: fixture.latestDigest,
    rows,
    verifiedNonParticipants,
    blockers: [...new Set(blockers)],
    notes: [...new Set(notes)],
  };
}

/** The exact payload api.service_record_fantasy_observation receives. */
export function observationPayload(
  proposal: Proposal,
  reviewer: string,
  reason: string,
): Record<string, unknown> {
  if (proposal.blockers.length > 0)
    throw new Error(`proposal_blocked: ${proposal.fixtureExternalId}`);
  const references = [
    `sofascore:match/${proposal.sofascoreMatchId}/lineups`,
    `sofascore:match/${proposal.sofascoreMatchId}/incidents`,
  ];
  const identified = proposal.rows.filter((row) => row.playerId !== null);
  const anonymousByTeam: Record<string, number> = {};
  for (const row of proposal.rows)
    if (row.playerId === null && row.started)
      anonymousByTeam[row.teamId] = (anonymousByTeam[row.teamId] ?? 0) + 1;
  const anonymousStarters = Object.values(anonymousByTeam).reduce((a, b) => a + b, 0);
  return {
    homeScore: proposal.homeScore,
    awayScore: proposal.awayScore,
    references: [...references, `botolago:reviewed-correction/${proposal.fixtureExternalId}`],
    reviewer,
    reason,
    expectedDigest: proposal.expectedDigest,
    disciplineComplete: true,
    participationComplete: true,
    ...(anonymousStarters > 0 ? { anonymousStarters, anonymousByTeam } : {}),
    verifiedNonParticipants: proposal.verifiedNonParticipants,
    players: identified.map((row) => ({
      playerId: row.playerId,
      teamId: row.teamId,
      started: row.started,
      stats: row.stats,
      evidence: Object.fromEntries(
        CORE_FIELDS.map((field) => [
          field,
          {
            state: field === "cleanSheet" ? "derived" : "verified",
            source: "reviewed-correction:sofascore",
            observedAt: proposal.capturedAt,
            references,
          },
        ]),
      ),
    })),
  };
}

const cell = (value: unknown) => String(value).replace(/\|/g, "/");

/** The table the owner reads before approving. */
export function reviewMarkdown(proposal: Proposal): string {
  const lines = [
    `### ${proposal.homeTeamName} ${proposal.homeScore}–${proposal.awayScore} ${proposal.awayTeamName} (GW${proposal.gameweek ?? "?"}, fixture ${proposal.fixtureExternalId})`,
    "",
    `Source: Sofascore match ${proposal.sofascoreMatchId}, read ${proposal.capturedAt}.`,
    "",
    proposal.blockers.length
      ? `**Cannot be recorded yet:**\n${proposal.blockers.map((b) => `- ${b}`).join("\n")}`
      : "**Ready to record once you approve.**",
    "",
    ...(proposal.notes.length ? [...proposal.notes.map((n) => `- ${n}`), ""] : []),
    "| Club | Sofascore name | Our player | Match | XI | Min | G | OG | GC | CS | Y | R | 2Y |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...proposal.rows.map((row) =>
      [
        "",
        row.teamId === proposal.rows[0]?.teamId ? proposal.homeTeamName : proposal.awayTeamName,
        cell(row.sofascoreName),
        cell(row.ourName ?? "—"),
        row.identity === "linked"
          ? "linked"
          : row.identity === "suggested"
            ? "**SUGGESTED**"
            : "**NONE**",
        row.started ? "✓" : "",
        row.stats.minutes,
        row.stats.goals,
        row.stats.ownGoals,
        row.stats.goalsConceded,
        row.stats.cleanSheet ? "✓" : "",
        row.stats.yellowCards,
        row.stats.redCards,
        row.stats.secondYellowDismissals,
        "",
      ]
        .join(" | ")
        .trim(),
    ),
    "",
    `Fantasy players of both clubs recorded as not playing: ${proposal.verifiedNonParticipants.length}.`,
  ];
  return lines.join("\n");
}
