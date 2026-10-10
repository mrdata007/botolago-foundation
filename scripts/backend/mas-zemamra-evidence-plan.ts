/**
 * LOCAL, READ-ONLY. The evidence plan for the Maghreb Fes - Zemamra match, built from committed
 * payloads and saved read-only production reads. It opens no database or network connection and
 * writes only the file it is told to. Ids, flags, codes and counts only: no name, no date of birth.
 *
 *   bun scripts/backend/mas-zemamra-evidence-plan.ts [--out plan.json]
 *
 * What it adds to resolve-mas-zemamra-identities.ts: a second source for the birth-date question.
 * SportsMonks (SM) is tied to the canonical players by ESTABLISHED mappings, so an SM date is
 * independent of the Sofascore match under test. A Sofascore date is never copied anywhere here.
 *
 * It never upgrades a class on its own say-so: a class changes only when a row of SM evidence
 * (exactly one SM player with the same date, no collision in the Sofascore candidates) supports it,
 * and the change is a statement about what the evidence supports, not something applied anywhere.
 * A link (mapping) would not move any player's Fantasy club, position, price, locked-lineup
 * association or historical scoring.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  AttributeConflict,
  ResolutionClass,
} from "../../src/backend/fantasy/provider-identity-resolution";
import type { SofaCandidateRow } from "../../src/backend/fantasy/provider-identity-worklist";
import { resolveMasZemamra } from "./resolve-mas-zemamra-identities";

const root = resolve(import.meta.dir, "../..");
const DIR = "tests/fixtures/identity/";
const read = <T>(path: string): T => JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;

export type SmTeam = "F" | "Z" | "other";
export interface SmHit {
  smId: string;
  appPlayerId: string | null;
  vsCatalogue: "equal" | "differs" | "catalogue_null" | "no_player";
  smTeam: SmTeam;
  matchesSmLatest: boolean;
}
interface SmLineupRow {
  team: "F" | "Z";
  position: string | null;
  shirt: number;
  smId: string;
  appPlayerId: string | null;
  smDate: "valid" | "null" | "jan1";
  vsCatalogue: string;
}
interface CanonicalRead {
  sofascoreExt: string;
  appPlayerId: string;
  role: string;
  catalogueDobState: string;
  position: string;
  fantasy: {
    fantasyPlayerId: string;
    footballTeamId?: string;
    positionCode?: string;
    price?: string;
    status?: string;
  } | null;
  squadsOpen: number;
  lockedLineups: number;
  gw1PointsRows: number;
  gw1ProvisionalPointsSum: number;
  performanceRowsThisFixture: number;
}
interface PoolRead {
  appPlayerId: string;
  club: "F" | "Z";
  catalogueDob: "null" | "jan1";
  position: string;
  smId: string | null;
  smEntries: number;
  smValidEntries: number;
  smNullEntries: number;
  smDistinctValidDates: number;
  smInMatchLineup: boolean;
  sofascoreIdsWithSameSmDate: string[];
  note: string | null;
  attributeObservations: number;
  pepitesSnapshotHasDate: boolean;
}
export interface EvidenceReads {
  match: { kickoffEpochSeconds: number; appFixtureId: string; sportsmonksFixtureId: string };
  canonical: CanonicalRead[];
  smLineup: SmLineupRow[];
  smCross: Record<string, { matches: SmHit[]; nSofascoreSameDate: number }>;
  smRevisions: { smId: string; appPlayerId: string }[];
  pool12: PoolRead[];
  membership: Record<string, Record<string, unknown>>;
}
interface LineupPlayer {
  player: { id: number; position?: string };
  teamId: number;
  shirtNumber: number;
  position?: string;
  substitute: boolean;
  statistics?: { minutesPlayed?: number; saves?: number };
}

const POS_LETTER: Record<string, string> = {
  goalkeeper: "G",
  defender: "D",
  midfielder: "M",
  forward: "F",
};
const FANTASY_LETTER: Record<string, string> = { GK: "G", DEF: "D", MID: "M", FWD: "F" };
/** Sofascore team ids of the two clubs, as the match payload names them. */
const MATCH_TEAM = { home: 55035, away: 263373 } as const;
const SIDE_TEAM = { home: "F", away: "Z" } as const;

export const CHANGE_STATEMENT =
  "A mapping is only an identity link: it moves no player's Fantasy club, position, price, locked-lineup membership or historical scoring.";

export interface ClassAssessment {
  externalId: string;
  currentClass: ResolutionClass;
  currentCode: string;
  supportedClass: ResolutionClass;
  changed: boolean;
  /** The independent source that supports a change; null when nothing changed. */
  independentSource: string | null;
  targetAppPlayerId: string | null;
  flags: string[];
}

/** The one rule that may move a class. Returns the same class when the evidence does not support more. */
export function assessClass(input: {
  externalId: string;
  currentClass: ResolutionClass;
  currentCode: string;
  currentTarget: string | null;
  hits: readonly SmHit[];
  nSofascoreSameDate: number;
  poolClubOfCanonical: (appPlayerId: string) => "F" | "Z" | null;
}): ClassAssessment {
  const { hits } = input;
  const keep = (flags: string[] = []): ClassAssessment => ({
    externalId: input.externalId,
    currentClass: input.currentClass,
    currentCode: input.currentCode,
    supportedClass: input.currentClass,
    changed: false,
    independentSource: null,
    targetAppPlayerId: input.currentTarget,
    flags,
  });
  const moved = (
    to: ResolutionClass,
    target: string | null,
    source: string,
    flags: string[] = [],
  ): ClassAssessment => ({
    ...keep(flags),
    supportedClass: to,
    changed: true,
    independentSource: source,
    targetAppPlayerId: target,
  });

  if (input.currentClass === "EXISTING_CANONICAL_PLAYER_IDENTIFIED") {
    const flags: string[] = [];
    if (hits.some((h) => !h.matchesSmLatest)) flags.push("SM_DATE_REVISED_AFTER_MATCH_DAY");
    return keep(flags);
  }
  if (input.currentClass === "MEMBERSHIP_CORRECTION_NEEDED") {
    const same = hits.some((h) => h.appPlayerId !== null && h.appPlayerId === input.currentTarget);
    const other = hits.some((h) => h.appPlayerId === null);
    return keep([
      ...(same ? ["SM_SAME_PLAYER_LISTED_AT_OBSERVED_CLUB_ON_MATCH_DAY"] : []),
      ...(other ? ["SM_HAS_A_SECOND_ID_WITH_THE_SAME_DATE_NOT_MAPPED_TO_THE_APP_PLAYER"] : []),
    ]);
  }
  if (input.currentCode === "TARGET_ALREADY_REPRESENTED") {
    return keep(hits.length > 1 ? ["SM_ALSO_HAS_TWO_IDS_WITH_THE_SAME_DATE"] : []);
  }
  if (input.currentClass !== "MAPPING_EVIDENCE_INSUFFICIENT" || hits.length !== 1) return keep();

  const hit = hits[0] as SmHit;
  if (input.nSofascoreSameDate !== 1) return keep();
  if (hit.appPlayerId !== null) {
    if (hit.vsCatalogue === "catalogue_null") {
      const club = input.poolClubOfCanonical(hit.appPlayerId);
      return club !== null && club === hit.smTeam
        ? moved(
            "EXISTING_CANONICAL_PLAYER_IDENTIFIED",
            hit.appPlayerId,
            "sportsmonks-date-via-established-mapping",
            ["CATALOGUE_DATE_MUST_BE_RECORDED_FROM_SM_FIRST"],
          )
        : moved(
            "MEMBERSHIP_CORRECTION_NEEDED",
            hit.appPlayerId,
            "sportsmonks-date-via-established-mapping",
            club === null
              ? ["CATALOGUE_HAS_NO_ACTIVE_MEMBERSHIP"]
              : ["CATALOGUE_PLACES_HIM_AT_ANOTHER_CLUB"],
          );
    }
    if (hit.vsCatalogue === "differs" && hit.matchesSmLatest)
      return moved(
        "OTHER_ATTRIBUTE_CONFLICT",
        hit.appPlayerId,
        "sportsmonks-date-via-established-mapping",
        ["CATALOGUE_DATE_DIFFERS_FROM_SM_LATEST_AND_SOFASCORE"],
      );
    return keep();
  }
  if (hit.vsCatalogue === "no_player")
    return moved("CANONICAL_PLAYER_NOT_FOUND", null, "sportsmonks-player-absent-from-app", [
      "SM_LISTS_A_REGISTERED_PLAYER_WITH_THIS_DATE_THE_APP_HAS_NOBODY",
    ]);
  return keep();
}

export interface ProposalItem {
  kind: "map";
  sofascoreCandidateId: string;
  appPlayerId: string;
  basis: "manual";
}

export async function buildEvidencePlan() {
  const base = await resolveMasZemamra();
  const reads = read<EvidenceReads>(`${DIR}mas-zemamra-evidence-reads-2026-10-03.json`);
  const sofa = read<{ rows: SofaCandidateRow[] }>(
    `${DIR}gw1-sofascore-unmapped-candidates-2026-10-03.json`,
  );
  const lineups = read<{
    home: { players: LineupPlayer[] };
    away: { players: LineupPlayer[] };
  }>("tests/fixtures/providers/sofascore/17132481.lineups.json");
  const baseRow = (id: string) => base.rows.find((r) => r.externalId === id);
  const canonicalOf = (ext: string) => reads.canonical.find((c) => c.sofascoreExt === ext);
  const lineupOf = (ext: string) => {
    for (const side of ["home", "away"] as const)
      for (const p of lineups[side].players) if (String(p.player.id) === ext) return { side, p };
    return null;
  };

  // 1. The seven identified identities: the exact proposal item that WOULD be sent.
  const identified = base.rows
    .filter((r) => r.resolution.classification === "EXISTING_CANONICAL_PLAYER_IDENTIFIED")
    .map((r) => {
      const candidate = sofa.rows.find((c) => c.externalId === r.externalId) as SofaCandidateRow;
      const canonical = canonicalOf(r.externalId) as CanonicalRead;
      const conflicts = r.resolution.attributeConflicts as readonly AttributeConflict[];
      const target = r.resolution.targetAppPlayerId as string;
      const item: ProposalItem = {
        kind: "map",
        sofascoreCandidateId: candidate.candidateId,
        appPlayerId: target,
        basis: "manual",
      };
      const lineup = lineupOf(r.externalId);
      const smRow = reads.smLineup.find((s) => s.appPlayerId === target) ?? null;
      const fantasyLetter = canonical.fantasy?.positionCode
        ? (FANTASY_LETTER[canonical.fantasy.positionCode] ?? null)
        : null;
      return {
        sofascoreExternalId: r.externalId,
        proposalItem: item,
        discrepancy: conflicts.includes("position")
          ? {
              kind: "position" as const,
              flag: "POSITION_DISAGREEMENT",
              providerLetter:
                (candidate as SofaCandidateRow & { position?: string | null }).position ?? null,
              catalogueLetter: POS_LETTER[canonical.position] ?? null,
              fantasyLetter,
            }
          : {
              kind: "shirt" as const,
              flag: "SHIRT_DIFFERENCE",
              providerLetter:
                (candidate as SofaCandidateRow & { position?: string | null }).position ?? null,
              catalogueLetter: POS_LETTER[canonical.position] ?? null,
              fantasyLetter,
            },
        needsPositionNoteAndAcknowledgement: conflicts.includes("position"),
        smCorroboration: {
          smMatchLineupSameClub:
            smRow !== null && lineup !== null && smRow.team === SIDE_TEAM[lineup.side],
          smMatchShirtEqualsSofascoreMatchShirt:
            smRow !== null && lineup !== null && smRow.shirt === lineup.p.shirtNumber,
          smSameCanonicalPlayerViaEstablishedMapping: smRow !== null,
        },
        beforeLink: {
          fantasy: canonical.fantasy,
          squadsHoldingHim: canonical.squadsOpen,
          lockedLineupsHoldingHim: canonical.lockedLineups,
          gw1PointsRows: canonical.gw1PointsRows,
          gw1ProvisionalPointsSum: canonical.gw1ProvisionalPointsSum,
          performanceRowsForThisFixture: canonical.performanceRowsThisFixture,
        },
        statement: CHANGE_STATEMENT,
      };
    })
    .sort((a, b) => Number(a.sofascoreExternalId) - Number(b.sofascoreExternalId));

  // 2. The two ids with no candidate record: provider evidence in memory against the SM lineup of the same match.
  const missing = ["919753", "1866448"].map((ext) => {
    const lineup = lineupOf(ext) as NonNullable<ReturnType<typeof lineupOf>>;
    const clubTeam = SIDE_TEAM[lineup.side];
    const letter = lineup.p.position ?? lineup.p.player.position ?? null;
    const slot = reads.smLineup.filter(
      (s) => s.team === clubTeam && s.position === letter && s.shirt === lineup.p.shirtNumber,
    );
    const only = slot.length === 1 ? (slot[0] as SmLineupRow) : null;
    const hasDate = only !== null && only.smDate === "valid";
    const confidence =
      only === null ? "NONE" : hasDate && only.vsCatalogue === "equal" ? "MEDIUM" : "LOW";
    return {
      sofascoreExternalId: ext,
      sofascoreLineup: {
        side: lineup.side,
        position: letter,
        matchShirt: lineup.p.shirtNumber,
        started: !lineup.p.substitute,
        minutes: lineup.p.statistics?.minutesPlayed ?? null,
        providerTeamId: lineup.p.teamId,
        providerTeamIdIsTheMatchClub: lineup.p.teamId === MATCH_TEAM[lineup.side],
        hasDateOfBirthInCommittedPayload: false,
      },
      workflowRow: "CANDIDATE_RECORD_MISSING",
      canonicalTarget: {
        hypothesisAppPlayerId: only?.appPlayerId ?? null,
        basis:
          "one SM lineup slot (same fixture, same club, same position, same match shirt); not proof",
        smDateState: only?.smDate ?? null,
        smDateVsCatalogue: only?.vsCatalogue ?? null,
        confidence,
        canBeCheckedByDate: hasDate,
      },
      settledBy: hasDate
        ? "the provider's date for this id (one candidate record, or any sanitized read) equals the SM date of the hypothesised player"
        : "a date for the hypothesised player from a source other than the provider under test, then the provider's date for this id",
    };
  });

  // 3. The 22 classes, and which ones new independent evidence supports changing.
  const classes = base.rows
    .map((r) => {
      const cross = reads.smCross[r.externalId];
      return assessClass({
        externalId: r.externalId,
        currentClass: r.resolution.classification,
        currentCode: r.resolution.code,
        currentTarget: r.resolution.targetAppPlayerId,
        hits: cross?.matches ?? [],
        nSofascoreSameDate: cross?.nSofascoreSameDate ?? 0,
        poolClubOfCanonical: (pid) => reads.pool12.find((p) => p.appPlayerId === pid)?.club ?? null,
      });
    })
    .map((c) => {
      // Does the SM lineup slot agree with Sofascore's for the same match (same club, same match shirt)?
      const hit = reads.smCross[c.externalId]?.matches[0];
      const smRow = hit ? reads.smLineup.find((s) => s.smId === hit.smId) : undefined;
      const lineup = lineupOf(c.externalId);
      return {
        ...c,
        smSlot:
          smRow && lineup
            ? {
                sameClub: smRow.team === SIDE_TEAM[lineup.side],
                sameMatchShirt: smRow.shirt === lineup.p.shirtNumber,
              }
            : null,
      };
    })
    .sort((a, b) => Number(a.externalId) - Number(b.externalId));

  // 4. The 12 club players with a null or placeholder catalogue date.
  const pool = reads.pool12.map((p) => {
    const available = p.smDistinctValidDates === 1;
    return {
      appPlayerId: p.appPlayerId,
      club: p.club === "F" ? "maghreb-fes" : "cr-khemis-zemamra",
      catalogueState: p.catalogueDob === "null" ? "null" : "placeholder",
      independentSources: available ? ["sportsmonks-current-player-list-observation"] : [],
      proposedValueStatus: available
        ? "available:sportsmonks-current-player-list-observation"
        : "none available",
      provenance: available
        ? `SM player ${p.smId} (established active mapping): ${p.smValidEntries} of ${p.smEntries} stored entries carry one and the same date, ${p.smNullEntries} carry none`
        : "no SM entry in any of the 8 stored observations; no other attribute observation; the only snapshot copy is the catalogue itself",
      confidence: available ? "MEDIUM" : "NONE",
      onlyAvailableDateIsATentativeSofascoreMatch: false,
      unlocksSofascoreIds: p.sofascoreIdsWithSameSmDate,
      unlocksSofascoreIdsInThisMatch: p.sofascoreIdsWithSameSmDate.filter((id) => baseRow(id)),
      note: p.note,
    };
  });

  const byClass: Record<string, number> = {};
  for (const c of classes) byClass[c.supportedClass] = (byClass[c.supportedClass] ?? 0) + 1;
  return {
    changeStatement: CHANGE_STATEMENT,
    kickoffEpochSeconds: reads.match.kickoffEpochSeconds,
    identified,
    missing,
    classes,
    changedClasses: classes.filter((c) => c.changed).map((c) => c.externalId),
    byCurrentClass: base.byClass,
    bySupportedClass: byClass,
    pool,
    poolWithAvailableDate: pool.filter((p) => p.proposedValueStatus !== "none available").length,
    poolWithoutAnySource: pool.filter((p) => p.proposedValueStatus === "none available").length,
    membership: reads.membership,
  };
}

if (import.meta.main) {
  const plan = await buildEvidencePlan();
  const text = JSON.stringify(plan, null, 2);
  const at = process.argv.indexOf("--out");
  if (at >= 0) writeFileSync(process.argv[at + 1] as string, text);
  else console.log(text);
}
