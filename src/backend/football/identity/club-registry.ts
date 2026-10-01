/**
 * The 16 clubs of the 2026/2027 Botola Pro and the team id each provider uses
 * for them. Provider ids only: no names. `clubKey` is a stable slug for
 * reports. The ids were read from the committed Phase 0 round-1 fixtures and
 * from the providers' own search results (see the population probe evidence).
 */
export interface ClubProviderTeams {
  readonly clubKey: string;
  readonly sofascoreTeamId: number;
  readonly flashscoreTeamId: string;
}

export const CLUB_PROVIDER_TEAMS: readonly ClubProviderTeams[] = [
  { clubKey: "amal-tiznit", sofascoreTeamId: 223445, flashscoreTeamId: "Q1Nl5eWC" },
  { clubKey: "codm-meknes", sofascoreTeamId: 55025, flashscoreTeamId: "E1gvHxFa" },
  { clubKey: "cr-khemis-zemamra", sofascoreTeamId: 263373, flashscoreTeamId: "M50CklHf" },
  { clubKey: "difaa-el-jadida", sofascoreTeamId: 55043, flashscoreTeamId: "Iui2yZzh" },
  { clubKey: "far-rabat", sofascoreTeamId: 24394, flashscoreTeamId: "CMn7Clai" },
  { clubKey: "fus-rabat", sofascoreTeamId: 55027, flashscoreTeamId: "zP99MHKe" },
  { clubKey: "hassania-agadir", sofascoreTeamId: 55039, flashscoreTeamId: "04t7zgjb" },
  { clubKey: "ittihad-tanger", sofascoreTeamId: 87180, flashscoreTeamId: "xUZ5xVki" },
  { clubKey: "kawkab-marrakech", sofascoreTeamId: 47696, flashscoreTeamId: "lA6RXjzH" },
  { clubKey: "maghreb-fes", sofascoreTeamId: 55035, flashscoreTeamId: "ptdhYAkN" },
  { clubKey: "moghreb-tetouan", sofascoreTeamId: 55049, flashscoreTeamId: "OWfdXU4T" },
  { clubKey: "rsb-berkane", sofascoreTeamId: 80395, flashscoreTeamId: "Me4oCiMn" },
  { clubKey: "raja-casablanca", sofascoreTeamId: 41757, flashscoreTeamId: "vTnNkCKc" },
  { clubKey: "uts-rabat", sofascoreTeamId: 118834, flashscoreTeamId: "GKY9yk5c" },
  { clubKey: "widad-temara", sofascoreTeamId: 204302, flashscoreTeamId: "hbO5F4bD" },
  { clubKey: "wydad-casablanca", sofascoreTeamId: 36268, flashscoreTeamId: "2yuuwjkA" },
];
