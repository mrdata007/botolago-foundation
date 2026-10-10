/**
 * Reviewed team table for the SofaScore ID bridge.
 *
 * SofaScore team ids are NOT duplicated here: they come from
 * `CLUB_PROVIDER_TEAMS` (identity/club-registry.ts), the reviewed registry used
 * by the player-mapping work. The registry has no internal team uuids, so this
 * file adds the one missing column, `internalTeamId`, which is left `null`
 * (TODO owner review) until the owner confirms each club against `app.teams`.
 * The bridge runner can also read the reviewed pairing from a JSON file
 * (`--teams`), so no uuid has to be committed to run a dry run.
 *
 * Names are SofaScore's own, read from standings on 2026-10-10 (display only).
 */
import { CLUB_PROVIDER_TEAMS } from "./identity/club-registry";

export const SOFASCORE_TEAM_NAMES: Readonly<Record<number, string>> = {
  55035: "MAS de Fès",
  118834: "Union Touarga Sport",
  55039: "Hassania d'Agadir",
  87180: "Ittihad Tanger",
  41757: "Raja Club Athletic",
  55025: "CODM Meknès",
  24394: "AS FAR Rabat",
  47696: "Kawkab Athletic Club Marrakech",
  204302: "Wydad Sportive Témara",
  36268: "Wydad Casablanca",
  55049: "Moghreb Atlético Tetuán",
  223445: "Union Sportive Amal Tiznit",
  80395: "RS Berkane",
  55027: "Fath Union Sport",
  263373: "Renaissance Zemamra",
  55043: "Difaâ Hassani El-Jadidi",
};

export interface SofascoreTeamRow {
  readonly clubKey: string;
  readonly sofascoreTeamId: number;
  readonly sofascoreName: string;
  /** TODO(owner review): the app.teams.id of this club. Null until reviewed. */
  readonly internalTeamId: string | null;
}

/** Internal uuids by clubKey. Fill in after owner review; never guess. */
export const REVIEWED_INTERNAL_TEAM_IDS: Readonly<Record<string, string | null>> = {};

export const SOFASCORE_TEAM_ROWS: readonly SofascoreTeamRow[] = CLUB_PROVIDER_TEAMS.map((club) => ({
  clubKey: club.clubKey,
  sofascoreTeamId: club.sofascoreTeamId,
  sofascoreName: SOFASCORE_TEAM_NAMES[club.sofascoreTeamId] ?? club.clubKey,
  internalTeamId: REVIEWED_INTERNAL_TEAM_IDS[club.clubKey] ?? null,
}));

/** The reviewed table the bridge uses: only rows with an internal uuid. */
export function reviewedTeamTable(
  rows: readonly SofascoreTeamRow[] = SOFASCORE_TEAM_ROWS,
): Map<number, string> {
  const table = new Map<number, string>();
  for (const row of rows)
    if (row.internalTeamId) table.set(row.sofascoreTeamId, row.internalTeamId);
  return table;
}
