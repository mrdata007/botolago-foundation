import { FootballError } from "../errors";
import { FlashscorePerformanceProvider } from "./flashscore-adapter";
import { RapidApiClient, type RapidApiClientConfig } from "./rapidapi-client";
import { SofascorePerformanceProvider } from "./sofascore-adapter";

type ServerEnvironment = Readonly<Record<string, string | undefined>>;
type RuntimeOverrides = Pick<RapidApiClientConfig, "fetch" | "runtime" | "now" | "policy">;

const SOFASCORE_HOST = "sofascore.p.rapidapi.com";

/**
 * Server only. The key comes from `RAPIDAPI_KEY` and is handed straight to the
 * client, which sends it as a header. Both providers use the same key; each has
 * its own host and its own monthly quota. The Flashscore host is read from
 * `FLASHSCORE_RAPIDAPI_HOST`, not assumed.
 */
export function createSofascorePerformanceProvider(
  environment: ServerEnvironment = serverEnvironment(),
  overrides: Partial<RuntimeOverrides> = {},
): SofascorePerformanceProvider {
  return new SofascorePerformanceProvider(
    new RapidApiClient({ host: SOFASCORE_HOST, key: key(environment), ...overrides }),
  );
}

export function createFlashscorePerformanceProvider(
  environment: ServerEnvironment = serverEnvironment(),
  overrides: Partial<RuntimeOverrides> = {},
): FlashscorePerformanceProvider {
  const host = environment.FLASHSCORE_RAPIDAPI_HOST?.trim();
  if (!host) throw configError();
  return new FlashscorePerformanceProvider(
    new RapidApiClient({ host, key: key(environment), ...overrides }),
  );
}

function key(environment: ServerEnvironment): string {
  const value = environment.RAPIDAPI_KEY?.trim();
  if (!value) throw configError();
  return value;
}

function serverEnvironment(): ServerEnvironment {
  return (globalThis as { process?: { env?: ServerEnvironment } }).process?.env ?? {};
}

function configError(): FootballError {
  return new FootballError(
    "provider_unavailable",
    "The RapidAPI server configuration is incomplete or invalid.",
  );
}
