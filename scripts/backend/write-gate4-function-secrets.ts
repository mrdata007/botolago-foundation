import { chmodSync, writeFileSync } from "node:fs";

export const GATE4_FUNCTION_SECRET_NAMES = [
  "SPORTSMONKS_API_TOKEN",
  "FOOTBALL_INGESTION_TRIGGER_SECRET",
  "FOOTBALL_PROVIDER",
  "FOOTBALL_PROVIDER_BASE_URL",
  "FOOTBALL_SPORTSMONKS_LEAGUE_ID",
  "FOOTBALL_SPORTSMONKS_SEASON_ID",
  "FOOTBALL_SPORTSMONKS_COUNTRY_CODE",
  "FOOTBALL_SPORTSMONKS_COMPETITION_TYPE",
  "FOOTBALL_SPORTSMONKS_SEASON_START",
  "FOOTBALL_SPORTSMONKS_SEASON_END",
  "FOOTBALL_PROVIDER_TIMEOUT_MS",
  "FOOTBALL_PROVIDER_MAX_RETRIES",
  "GNEWS_API_KEY",
  "NEWS_INGESTION_TRIGGER_SECRET",
  "GNEWS_API_ORIGIN",
  "GNEWS_QUERY_FR",
  "GNEWS_QUERY_AR",
  "GNEWS_PAGE_SIZE",
  "GNEWS_TIMEOUT_MS",
  "GNEWS_MAX_RETRIES",
] as const;

type Gate4SecretName = (typeof GATE4_FUNCTION_SECRET_NAMES)[number];

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value) throw new Error(`MISSING_${name}`);
  return value;
}

export function quoteDotenvValue(value: string): string {
  if (/[\0\r\n]/u.test(value)) {
    throw new Error("DOTENV_VALUE_CONTAINS_CONTROL_CHARACTER");
  }
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes("`")) return `\`${value}\``;
  if (!value.includes('"') && !/\\[nr]/u.test(value)) return `"${value}"`;
  throw new Error("DOTENV_VALUE_HAS_NO_SAFE_QUOTE");
}

export function serializeGate4FunctionSecrets(environment: NodeJS.ProcessEnv): string {
  return (
    GATE4_FUNCTION_SECRET_NAMES.map((name: Gate4SecretName) => {
      const value = required(environment, name);
      return `${name}=${quoteDotenvValue(value)}`;
    }).join("\n") + "\n"
  );
}

function main(): void {
  const path = required(process.env, "GATE4_SECRET_FILE");
  writeFileSync(path, serializeGate4FunctionSecrets(process.env), {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(path, 0o600);
}

if (import.meta.main) main();
