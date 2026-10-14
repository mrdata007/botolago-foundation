/**
 * One-time bulk link of the existing player catalog to SofaScore, from the club squads
 * (pure logic, no I/O). Owner procedure: docs/backend/SOFASCORE_PLAYER_MATCHING.md,
 * "Linking the existing catalog". Runner: scripts/backend/sofascore-squad-link.ts.
 *
 * THE RULE: nothing here reads a name to decide anything. Names are optional `displayName`
 * fields copied through to the report for staff to read; no function compares them.
 *
 * A SofaScore squad player and a catalog player are the same person when they are at the
 * SAME club (the catalog club mapped to the SofaScore team the squad was read from), wear
 * the SAME shirt number this season, and have a COMPATIBLE position: equal, neighbouring
 * lines (defender-midfielder, midfielder-forward) or either unknown, a goalkeeper only with
 * a goalkeeper. This is the rule app_private.sofascore_position_compatible and the automatic
 * matcher (migration 20261013150000) use.
 *
 * Three lists:
 *   CONFIRMED    exactly one candidate both ways, both shirts and both positions known, no
 *                existing mapping on either side. Safe to apply in one go.
 *   SUGGESTIONS  a candidate, but something weaker (a position unknown, a shirt missing on
 *                the catalog side, two candidates). Written as pre-filled queue entries for
 *                the one-click admin screen; nothing is linked.
 *   UNMATCHED    squad players with no candidate, and catalog players with no squad entry.
 */
import { createHash } from "node:crypto";

export type Pos = "G" | "D" | "M" | "F";

/** Mirrors app_private.sofascore_position_compatible (null = unknown). */
export function positionsCompatible(a: Pos | null, b: Pos | null): boolean {
  if (a === null || b === null) return true;
  if (a === b) return true;
  if (a === "G" || b === "G") return false;
  return a === "M" || b === "M";
}

/** At most this many members with no shirt on file are offered for one squad player. */
export const MAX_NULL_SHIRT_SUGGESTIONS = 3;

export interface SquadClub {
  readonly internalTeamId: string;
  readonly sofascoreTeamId: string;
  /** Report only. Never compared. */
  readonly displayName?: string | null;
}

export interface SquadEntry {
  readonly sofascoreTeamId: string;
  readonly sofascorePlayerId: string;
  readonly shirt: number | null;
  readonly position: Pos | null;
  /** Report only. Never compared. */
  readonly displayName?: string | null;
}

export interface CatalogMember {
  readonly playerId: string;
  readonly teamId: string;
  readonly shirt: number | null;
  readonly position: Pos | null;
  /** Any SofaScore mapping this player has: none, active, or an inactive one that still blocks an insert. */
  readonly mapping: "none" | "active" | "inactive";
  /** Report only. Never compared. */
  readonly displayName?: string | null;
}

export type SuggestionReason = "weak_match" | "ambiguous_shirt" | "no_shirt_on_file";
export type UnmatchedSquadReason =
  | "no_candidate"
  | "no_shirt"
  | "position_mismatch"
  | "inactive_mapping_exists";

export interface ConfirmedLink {
  readonly sofascorePlayerId: string;
  readonly playerId: string;
  readonly internalTeamId: string;
  readonly shirt: number;
  readonly displayName?: string | null;
  readonly playerDisplayName?: string | null;
}

export interface Suggestion {
  readonly sofascorePlayerId: string;
  readonly internalTeamId: string;
  readonly reason: SuggestionReason;
  readonly candidatePlayerIds: readonly string[];
  readonly shirt: number | null;
  readonly position: Pos | null;
  readonly displayName?: string | null;
}

export interface UnmatchedSquadPlayer {
  readonly sofascorePlayerId: string;
  readonly internalTeamId: string;
  readonly reason: UnmatchedSquadReason;
  readonly shirt: number | null;
  readonly position: Pos | null;
  readonly displayName?: string | null;
}

export interface UnmatchedCatalogPlayer {
  readonly playerId: string;
  readonly internalTeamId: string;
  readonly reason: "no_squad_entry" | "inactive_mapping_exists";
  readonly shirt: number | null;
  readonly position: Pos | null;
  readonly displayName?: string | null;
}

export interface SquadLinkResult {
  readonly confirmed: readonly ConfirmedLink[];
  readonly suggestions: readonly Suggestion[];
  readonly unmatchedSquad: readonly UnmatchedSquadPlayer[];
  readonly unmatchedCatalog: readonly UnmatchedCatalogPlayer[];
  readonly counts: {
    readonly clubs: number;
    readonly clubsWithoutSquad: number;
    readonly squadPlayers: number;
    readonly alreadyMapped: number;
    readonly confirmed: number;
    readonly suggestions: number;
    readonly unmatchedSquad: number;
    readonly unmatchedCatalog: number;
    /** Confirmed rows link without a person once the owner runs the apply script. */
    readonly linkedAutomatically: number;
    /** Suggestions: one click each on the admin screen. */
    readonly needReview: number;
  };
}

export function classifySquads(args: {
  readonly clubs: readonly SquadClub[];
  readonly squads: readonly SquadEntry[];
  readonly members: readonly CatalogMember[];
  /** SofaScore player ids that already have an active mapping. */
  readonly mappedSofascoreIds: ReadonlySet<string>;
}): SquadLinkResult {
  const confirmed: ConfirmedLink[] = [];
  const suggestions: Suggestion[] = [];
  const unmatchedSquad: UnmatchedSquadPlayer[] = [];
  const unmatchedCatalog: UnmatchedCatalogPlayer[] = [];
  let alreadyMapped = 0;
  let clubsWithoutSquad = 0;

  const clubOfSofa = new Map(args.clubs.map((c) => [c.sofascoreTeamId, c.internalTeamId]));
  const entriesByClub = new Map<string, SquadEntry[]>();
  for (const e of args.squads) {
    const club = clubOfSofa.get(e.sofascoreTeamId);
    if (!club) continue;
    const list = entriesByClub.get(club) ?? [];
    list.push(e);
    entriesByClub.set(club, list);
  }
  const membersByClub = new Map<string, CatalogMember[]>();
  for (const m of args.members) {
    const list = membersByClub.get(m.teamId) ?? [];
    list.push(m);
    membersByClub.set(m.teamId, list);
  }

  for (const club of args.clubs) {
    const all = entriesByClub.get(club.internalTeamId) ?? [];
    if (all.length === 0) clubsWithoutSquad += 1;
    const entries = all.filter((e) => {
      if (args.mappedSofascoreIds.has(e.sofascorePlayerId)) {
        alreadyMapped += 1;
        return false;
      }
      return true;
    });
    const members = (membersByClub.get(club.internalTeamId) ?? []).filter(
      (m) => m.mapping !== "active",
    );
    const free = members.filter((m) => m.mapping === "none");
    const blocked = members.filter((m) => m.mapping === "inactive");
    const used = new Set<string>();

    const sameShirt = (e: SquadEntry, m: CatalogMember) =>
      e.shirt !== null && m.shirt !== null && e.shirt === m.shirt;
    const candidatesOf = (e: SquadEntry) =>
      free.filter((m) => sameShirt(e, m) && positionsCompatible(m.position, e.position));
    const entriesOf = (m: CatalogMember) =>
      entries.filter((e) => sameShirt(e, m) && positionsCompatible(m.position, e.position));

    for (const e of entries) {
      const base = {
        sofascorePlayerId: e.sofascorePlayerId,
        internalTeamId: club.internalTeamId,
        shirt: e.shirt,
        position: e.position,
        displayName: e.displayName ?? null,
      };
      if (e.shirt === null) {
        unmatchedSquad.push({ ...base, reason: "no_shirt" });
        continue;
      }
      const candidates = candidatesOf(e);
      if (candidates.length === 1) {
        const c = candidates[0]!;
        const back = entriesOf(c);
        const unambiguous = back.length === 1;
        if (unambiguous && e.position !== null && c.position !== null) {
          confirmed.push({
            sofascorePlayerId: e.sofascorePlayerId,
            playerId: c.playerId,
            internalTeamId: club.internalTeamId,
            shirt: e.shirt,
            displayName: e.displayName ?? null,
            playerDisplayName: c.displayName ?? null,
          });
          used.add(c.playerId);
        } else {
          suggestions.push({
            ...base,
            reason: unambiguous ? "weak_match" : "ambiguous_shirt",
            candidatePlayerIds: [c.playerId],
          });
          used.add(c.playerId);
        }
        continue;
      }
      if (candidates.length > 1) {
        suggestions.push({
          ...base,
          reason: "ambiguous_shirt",
          candidatePlayerIds: candidates.map((c) => c.playerId),
        });
        for (const c of candidates) used.add(c.playerId);
        continue;
      }
      // No exact candidate. A catalog member with no shirt on file could be him; offer a few.
      const noShirt = free.filter(
        (m) => m.shirt === null && positionsCompatible(m.position, e.position),
      );
      if (noShirt.length > 0 && noShirt.length <= MAX_NULL_SHIRT_SUGGESTIONS) {
        suggestions.push({
          ...base,
          reason: "no_shirt_on_file",
          candidatePlayerIds: noShirt.map((m) => m.playerId),
        });
        for (const m of noShirt) used.add(m.playerId);
        continue;
      }
      if (blocked.some((m) => sameShirt(e, m) && positionsCompatible(m.position, e.position))) {
        unmatchedSquad.push({ ...base, reason: "inactive_mapping_exists" });
      } else if (free.some((m) => sameShirt(e, m))) {
        unmatchedSquad.push({ ...base, reason: "position_mismatch" });
      } else {
        unmatchedSquad.push({ ...base, reason: "no_candidate" });
      }
    }

    // Two squad players can claim one catalog player; a confirmed pair must be the only claim.
    // (entriesOf(c).length === 1 above already guarantees it for confirmed ones.)
    for (const m of free) {
      if (used.has(m.playerId)) continue;
      unmatchedCatalog.push({
        playerId: m.playerId,
        internalTeamId: club.internalTeamId,
        reason: "no_squad_entry",
        shirt: m.shirt,
        position: m.position,
        displayName: m.displayName ?? null,
      });
    }
    for (const m of blocked) {
      unmatchedCatalog.push({
        playerId: m.playerId,
        internalTeamId: club.internalTeamId,
        reason: "inactive_mapping_exists",
        shirt: m.shirt,
        position: m.position,
        displayName: m.displayName ?? null,
      });
    }
  }

  return {
    confirmed,
    suggestions,
    unmatchedSquad,
    unmatchedCatalog,
    counts: {
      clubs: args.clubs.length,
      clubsWithoutSquad,
      squadPlayers: args.squads.length,
      alreadyMapped,
      confirmed: confirmed.length,
      suggestions: suggestions.length,
      unmatchedSquad: unmatchedSquad.length,
      unmatchedCatalog: unmatchedCatalog.length,
      linkedAutomatically: confirmed.length,
      needReview: suggestions.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Report and apply script
// ---------------------------------------------------------------------------

export interface SquadLinkReport {
  readonly kind: "sofascore-squad-link";
  readonly generatedAt: string;
  readonly namesShown: boolean;
  readonly inputs: {
    readonly existingSofascorePlayerMappings: number;
    readonly sofascoreRequests: number;
    readonly failedSquads: readonly string[];
  };
  readonly result: SquadLinkResult;
  /** sha256 of the confirmed pairs and the suggestions, carried into the apply script. */
  readonly proposalDigest: string;
}

export function proposalDigest(result: SquadLinkResult): string {
  const rows = [
    ...result.confirmed.map((c) => `ok|${c.sofascorePlayerId}|${c.playerId}|${c.internalTeamId}`),
    ...result.suggestions.map(
      (s) => `sg|${s.sofascorePlayerId}|${s.reason}|${[...s.candidatePlayerIds].sort().join(",")}`,
    ),
  ].sort();
  return createHash("sha256").update(rows.join("\n")).digest("hex");
}

export function buildReport(args: {
  readonly generatedAt: string;
  readonly namesShown: boolean;
  readonly existingSofascorePlayerMappings: number;
  readonly sofascoreRequests: number;
  readonly failedSquads: readonly string[];
  readonly result: SquadLinkResult;
}): SquadLinkReport {
  return {
    kind: "sofascore-squad-link",
    generatedAt: args.generatedAt,
    namesShown: args.namesShown,
    inputs: {
      existingSofascorePlayerMappings: args.existingSofascorePlayerMappings,
      sofascoreRequests: args.sofascoreRequests,
      failedSquads: args.failedSquads,
    },
    result: args.result,
    proposalDigest: proposalDigest(args.result),
  };
}

const cell = (v: string | number | null | undefined) =>
  v === null || v === undefined ? "" : String(v).replace(/\|/g, "\\|").replace(/\n/g, " ");

export function renderMarkdown(report: SquadLinkReport, opts: { maxRows?: number } = {}): string {
  const { counts: c } = report.result;
  const names = report.namesShown;
  const lim = <T>(rows: readonly T[]) => (opts.maxRows ? rows.slice(0, opts.maxRows) : rows);
  const L: string[] = [];
  L.push(
    "### Counts",
    "",
    `- **Linked automatically once applied (CONFIRMED): ${c.linkedAutomatically}**`,
    `- **Need review (SUGGESTIONS, one click each): ${c.needReview}**`,
    `- Unmatched squad players: ${c.unmatchedSquad}`,
    `- Unmatched catalog players: ${c.unmatchedCatalog}`,
    `- Already linked (left alone): ${c.alreadyMapped}`,
    `- Clubs read: ${c.clubs} (without a squad: ${c.clubsWithoutSquad}); squad players read: ${c.squadPlayers}`,
    `- SofaScore requests: ${report.inputs.sofascoreRequests}${report.inputs.failedSquads.length ? `; squads that failed: ${report.inputs.failedSquads.length}` : ""}`,
    `- Existing SofaScore player mappings: ${report.inputs.existingSofascorePlayerMappings}`,
    `- Names in this report: ${names ? "shown (for staff, never used to decide)" : "not shown"}`,
    `- Proposal digest: \`${report.proposalDigest}\``,
    "",
  );
  const more = (n: number) => {
    if (opts.maxRows && n > opts.maxRows)
      L.push(`_${n - opts.maxRows} more rows in report.md / report.json._`, "");
  };
  L.push(
    "### CONFIRMED",
    "",
    "| SofaScore id | player | club | shirt |" + (names ? " name |" : ""),
  );
  L.push("|---|---|---|---|" + (names ? "---|" : ""));
  for (const r of lim(report.result.confirmed))
    L.push(
      `| ${r.sofascorePlayerId} | ${r.playerId} | ${r.internalTeamId} | ${r.shirt} |${names ? ` ${cell(r.displayName)} / ${cell(r.playerDisplayName)} |` : ""}`,
    );
  more(report.result.confirmed.length);
  L.push(
    "",
    "### SUGGESTIONS",
    "",
    "| SofaScore id | club | reason | shirt | candidates |" + (names ? " name |" : ""),
  );
  L.push("|---|---|---|---|---|" + (names ? "---|" : ""));
  for (const r of lim(report.result.suggestions))
    L.push(
      `| ${r.sofascorePlayerId} | ${r.internalTeamId} | ${r.reason} | ${cell(r.shirt)} | ${r.candidatePlayerIds.join(", ")} |${names ? ` ${cell(r.displayName)} |` : ""}`,
    );
  more(report.result.suggestions.length);
  L.push(
    "",
    "### UNMATCHED squad players",
    "",
    "| SofaScore id | club | reason | shirt | position |" + (names ? " name |" : ""),
  );
  L.push("|---|---|---|---|---|" + (names ? "---|" : ""));
  for (const r of lim(report.result.unmatchedSquad))
    L.push(
      `| ${r.sofascorePlayerId} | ${r.internalTeamId} | ${r.reason} | ${cell(r.shirt)} | ${cell(r.position)} |${names ? ` ${cell(r.displayName)} |` : ""}`,
    );
  more(report.result.unmatchedSquad.length);
  L.push(
    "",
    "### UNMATCHED catalog players",
    "",
    "| player | club | reason | shirt | position |" + (names ? " name |" : ""),
  );
  L.push("|---|---|---|---|---|" + (names ? "---|" : ""));
  for (const r of lim(report.result.unmatchedCatalog))
    L.push(
      `| ${r.playerId} | ${r.internalTeamId} | ${r.reason} | ${cell(r.shirt)} | ${cell(r.position)} |${names ? ` ${cell(r.displayName)} |` : ""}`,
    );
  more(report.result.unmatchedCatalog.length);
  L.push("");
  return L.join("\n");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NUM = /^[0-9]{1,20}$/;
const POSITION_TEXT: Record<Pos, string> = {
  G: "goalkeeper",
  D: "defender",
  M: "midfielder",
  F: "forward",
};

export interface ApplyOptions {
  /** Auth user id of the owner's staff account; left as a placeholder when absent. */
  readonly ownerAuthUserId?: string;
}

const sqlText = (value: string) => value.replace(/'/g, "''");

/**
 * A guarded owner-run script. It ends in a deliberate exception (DRY_RUN_ROLLBACK, carrying the
 * computed counts) unless the owner changes c_commit to true; every guard runs either way.
 * CONFIRMED rows are written exactly the way api.admin_resolve_sofascore_player_match writes
 * them (a staff-resolution log row plus a mapping whose source_version names that row), so the
 * Fantasy "reviewed" check accepts them. SUGGESTIONS become pre-filled queue entries.
 */
export function renderApplySql(report: SquadLinkReport, opts: ApplyOptions = {}): string {
  const { confirmed, suggestions } = report.result;
  for (const c of confirmed)
    if (!UUID.test(c.playerId) || !UUID.test(c.internalTeamId) || !NUM.test(c.sofascorePlayerId))
      throw new Error("squad_link_sql_invalid_id: a confirmed id is not in the expected shape");
  for (const s of suggestions)
    if (
      !UUID.test(s.internalTeamId) ||
      !NUM.test(s.sofascorePlayerId) ||
      s.candidatePlayerIds.some((id) => !UUID.test(id))
    )
      throw new Error("squad_link_sql_invalid_id: a suggestion id is not in the expected shape");
  if (opts.ownerAuthUserId !== undefined && !UUID.test(opts.ownerAuthUserId))
    throw new Error("squad_link_sql_invalid_owner: not a uuid");
  if (!/^[0-9a-f]{64}$/.test(report.proposalDigest))
    throw new Error("squad_link_sql_invalid_digest");

  const confirmedJson = JSON.stringify(
    confirmed.map((c) => ({
      sofa_id: c.sofascorePlayerId,
      player_id: c.playerId,
      team_id: c.internalTeamId,
    })),
  );
  const suggestionJson = JSON.stringify(
    suggestions.map((s) => ({
      sofa_id: s.sofascorePlayerId,
      team_id: s.internalTeamId,
      reason: s.reason,
      shirt: s.shirt,
      position: s.position === null ? null : POSITION_TEXT[s.position],
      name: s.displayName ?? `SofaScore player ${s.sofascorePlayerId}`,
      candidates: s.candidatePlayerIds,
    })),
  );
  const tag = report.proposalDigest.slice(0, 12);
  const owner = opts.ownerAuthUserId ?? "REPLACE-WITH-OWNER-AUTH-USER-ID";
  return `-- SofaScore squad link (one-time bulk link of the existing catalog): GUARDED OWNER-RUN SCRIPT
-- (generated; read it before running). Report digest ${report.proposalDigest}
-- Confirmed links: ${confirmed.length}. Suggestions to queue: ${suggestions.length}.
--
-- Before running (AGENTS.md "One writer at a time, per database"): list running agents and
-- workflows, pause the cron writers that touch fixtures, players and Fantasy (AGENTS.md "Before
-- writing", item 3; sofascore-rating-release-pause.sql, resumed with
-- sofascore-rating-release-resume.sql), then set c_one_writer_checked to true.
-- This script writes app_private.football_provider_mappings, app_private.sofascore_player_match_log
-- and app_private.sofascore_player_match_queue, and sets held matches to be retried.
--
-- It DOES NOT COMMIT BY DEFAULT: with c_commit = false it runs every guard and every write, then
-- raises DRY_RUN_ROLLBACK with the computed counts, and the whole DO block is rolled back. Read the
-- message, re-read the tables to confirm nothing changed, then set c_commit to true, run it once,
-- and resume the writers. It never loosens a guard: a guard that fires means production moved
-- since the report. Requires migrations 20261013150000 and 20261014170000 (second SofaScore ids).

do $squad_link$
declare
  c_commit constant boolean := false;
  c_one_writer_checked constant boolean := false;
  c_owner_text constant text := '${owner}';
  c_expected_sofa_player_mappings constant integer := ${report.inputs.existingSofascorePlayerMappings};
  c_confirmed constant jsonb := '${sqlText(confirmedJson)}'::jsonb;
  c_suggestions constant jsonb := '${sqlText(suggestionJson)}'::jsonb;
  c_reason constant text := 'Linked from the SofaScore club squads (same club, shirt number and position), approved by the owner from report ${tag}.';
  v_owner uuid;
  r record;
  v_n integer;
  v_log uuid;
  v_mapping uuid;
  v_linked integer := 0;
  v_queued integer := 0;
  v_skipped integer := 0;
  v_queue_closed integer := 0;
  v_reopened integer := 0;
  v_teams uuid[] := '{}';
begin
  if not c_one_writer_checked then
    raise exception 'GUARD: set c_one_writer_checked to true only after checking nothing else writes';
  end if;
  if c_owner_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'GUARD: set c_owner_text to the owner auth user id (auth.users.id of the staff account)';
  end if;
  v_owner := c_owner_text::uuid;
  -- The same lock the automatic player matcher takes, so the two never interleave.
  perform pg_advisory_xact_lock(hashtextextended('sofascore-player-auto-map', 0));
  if not exists (select 1 from app_private.staff_principals sp where sp.auth_user_id = v_owner) then
    raise exception 'GUARD: c_owner_text is not a staff principal';
  end if;
  if to_regclass('app_private.sofascore_player_match_log') is null
    or to_regclass('app_private.sofascore_player_match_queue') is null
    or to_regprocedure('app_private.sofascore_fantasy_reopen(uuid,uuid)') is null
    or to_regprocedure('app_private.sofascore_position_compatible(text,text)') is null then
    raise exception 'GUARD: migration 20261013150000 (matching without names) is not applied';
  end if;
  if to_regclass('app_private.sofascore_player_aliases') is null then
    raise exception 'GUARD: migration 20261014170000 (second SofaScore ids) is not applied';
  end if;
  select count(*) into v_n from app_private.football_provider_mappings
   where provider_name = 'sofascore' and entity_type = 'player';
  if v_n <> c_expected_sofa_player_mappings then
    raise exception 'GUARD: sofascore player mappings are % but the report saw %', v_n, c_expected_sofa_player_mappings;
  end if;

  -- 1. CONFIRMED: written as staff resolutions, so they count as reviewed.
  for r in select * from jsonb_to_recordset(c_confirmed) as x(sofa_id text, player_id uuid, team_id uuid) loop
    if exists (select 1 from app_private.football_provider_mappings m
        where m.provider_name = 'sofascore' and m.entity_type = 'player'
          and (m.external_id = r.sofa_id or m.internal_entity_id = r.player_id))
      or exists (select 1 from app_private.sofascore_player_aliases a
        where a.sofascore_player_id = r.sofa_id or a.player_id = r.player_id) then
      raise exception 'GUARD: a SofaScore player mapping already exists for player % or id %', r.player_id, r.sofa_id;
    end if;
    if not exists (select 1 from app.team_memberships mem
        join app.seasons s on s.id = mem.season_id and s.is_current
        where mem.player_id = r.player_id and mem.team_id = r.team_id and mem.active) then
      raise exception 'GUARD: player % is no longer an active member of club % this season', r.player_id, r.team_id;
    end if;
    v_log := gen_random_uuid();
    insert into app_private.football_provider_mappings (
      provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active,
      manually_corrected, correction_reason, corrected_by, corrected_at)
    values ('sofascore', 'player', r.sofa_id, r.player_id, 'sofascore-admin-resolve:' || v_log::text,
      statement_timestamp(), true, true, c_reason, v_owner, statement_timestamp())
    returning id into v_mapping;
    insert into app_private.sofascore_player_match_log (
      id, method, mapping_id, sofascore_player_id, player_id, fixture_id, evidence, decided_by)
    values (v_log, 'staff-resolution', v_mapping, r.sofa_id, r.player_id, null,
      jsonb_build_object('source', 'squad-link', 'reportDigest', '${report.proposalDigest}'), v_owner);
    update app_private.sofascore_player_match_queue
       set resolved_at = statement_timestamp(), resolved_by = v_owner, resolved_player_id = r.player_id
     where sofascore_player_id = r.sofa_id and resolved_at is null;
    get diagnostics v_n = row_count;
    v_queue_closed := v_queue_closed + v_n;
    v_linked := v_linked + 1;
    if not (r.team_id = any (v_teams)) then v_teams := v_teams || r.team_id; end if;
  end loop;

  -- 2. SUGGESTIONS: pre-filled entries for the one-click admin screen. Nothing is linked.
  for r in select * from jsonb_to_recordset(c_suggestions)
      as x(sofa_id text, team_id uuid, reason text, shirt integer, position text, name text, candidates uuid[]) loop
    if exists (select 1 from app_private.football_provider_mappings m
        where m.provider_name = 'sofascore' and m.entity_type = 'player' and m.external_id = r.sofa_id)
      or exists (select 1 from app_private.sofascore_player_aliases a where a.sofascore_player_id = r.sofa_id) then
      v_skipped := v_skipped + 1;   -- linked meanwhile (by the matcher, step 1 or as a second id): nothing to ask
      continue;
    end if;
    perform app_private.sofascore_player_match_enqueue(r.sofa_id, null, r.team_id, null, r.name, null,
      r.shirt, r.position, r.reason, r.candidates);
    v_queued := v_queued + 1;
  end loop;

  -- 3. Matches held for an unknown player are tried again on the next tick.
  for r in select unnest(v_teams) as team_id loop
    v_reopened := v_reopened + app_private.sofascore_fantasy_reopen(r.team_id, null);
  end loop;

  if not c_commit then
    raise exception 'DRY_RUN_ROLLBACK: would link % player(s), queue % suggestion(s) (% skipped), close % queue row(s), reopen % held match(es). Nothing was written.',
      v_linked, v_queued, v_skipped, v_queue_closed, v_reopened;
  end if;
  raise notice 'COMMITTED: % linked, % queued (% skipped), % queue row(s) closed, % held match(es) reopened',
    v_linked, v_queued, v_skipped, v_queue_closed, v_reopened;
end
$squad_link$;
`;
}
