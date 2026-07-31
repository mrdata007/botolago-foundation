import { FootballError } from "../errors";
import {
  SportsmonksFootballProvider,
  type SportsmonksProviderConfig,
} from "./sportsmonks-adapter";

type ServerEnvironment = Readonly<Record<string, string | undefined>>;
type RuntimeOverrides = Pick<
  SportsmonksProviderConfig,
  "fetch" | "sleep" | "now"
>;

const OFFICIAL_BASE_URL = "https://api.sportmonks.com/v3/football";
const COMPETITION_TYPES = [
  "league",
  "cup",
  "super_cup",
  "international",
  "friendly",
] as const;

export function createSportsmonksFootballProvider(
  environment: ServerEnvironment = serverEnvironment(),
  overrides: Partial<RuntimeOverrides> = {},
): SportsmonksFootballProvider {
  if (environment.FOOTBALL_PROVIDER !== "sportsmonks") throw configError();
  const baseUrl = required(environment, "FOOTBALL_PROVIDER_BASE_URL").replace(
    /\/$/,
    "",
  );
  if (baseUrl !== OFFICIAL_BASE_URL) throw configError();

  const competitionType = required(
    environment,
    "FOOTBALL_SPORTSMONKS_COMPETITION_TYPE",
  );
  if (
    !COMPETITION_TYPES.includes(
      competitionType as (typeof COMPETITION_TYPES)[number],
    )
  )
    throw configError();

  return new SportsmonksFootballProvider({
    token: required(environment, "SPORTSMONKS_API_TOKEN"),
    leagueId: positiveInteger(environment, "FOOTBALL_SPORTSMONKS_LEAGUE_ID"),
    seasonId: positiveInteger(environment, "FOOTBALL_SPORTSMONKS_SEASON_ID"),
    countryCode: required(environment, "FOOTBALL_SPORTSMONKS_COUNTRY_CODE"),
    competitionType:
      competitionType as SportsmonksProviderConfig["competitionType"],
    seasonStartsOn: required(environment, "FOOTBALL_SPORTSMONKS_SEASON_START"),
    seasonEndsOn: required(environment, "FOOTBALL_SPORTSMONKS_SEASON_END"),
    fixtureFrom: required(environment, "FOOTBALL_SPORTSMONKS_FIXTURE_FROM"),
    fixtureTo: required(environment, "FOOTBALL_SPORTSMONKS_FIXTURE_TO"),
    timeoutMs: boundedInteger(
      environment,
      "FOOTBALL_PROVIDER_TIMEOUT_MS",
      250,
      60_000,
    ),
    maxRetries: boundedInteger(
      environment,
      "FOOTBALL_PROVIDER_MAX_RETRIES",
      0,
      8,
    ),
    retryBaseMs: boundedInteger(
      environment,
      "FOOTBALL_PROVIDER_RETRY_BASE_MS",
      10,
      60_000,
    ),
    circuitFailureThreshold: boundedInteger(
      environment,
      "FOOTBALL_PROVIDER_CIRCUIT_FAILURE_THRESHOLD",
      1,
      100,
    ),
    circuitResetMs: boundedInteger(
      environment,
      "FOOTBALL_PROVIDER_CIRCUIT_RESET_MS",
      1_000,
      3_600_000,
    ),
    ...overrides,
  });
}

function serverEnvironment(): ServerEnvironment {
  return (
    (globalThis as { process?: { env?: ServerEnvironment } }).process?.env ?? {}
  );
}

function required(environment: ServerEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw configError();
  return value;
}

function positiveInteger(environment: ServerEnvironment, name: string): number {
  return boundedInteger(environment, name, 1, Number.MAX_SAFE_INTEGER);
}

function boundedInteger(
  environment: ServerEnvironment,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const raw = required(environment, name);
  if (!/^\d+$/.test(raw)) throw configError();
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw configError();
  return value;
}

function configError(): FootballError {
  return new FootballError(
    "provider_unavailable",
    "The SportsMonks server configuration is incomplete or invalid.",
  );
}
