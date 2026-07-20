import { FootballError } from "../errors";
import type { FixtureStatus } from "../contracts";

export type StatusMap<T extends string> = Readonly<Record<T, FixtureStatus>>;

export function mapProviderFixtureStatus<T extends string>(
  provider: string,
  rawStatus: string,
  mapping: StatusMap<T>,
): FixtureStatus {
  if (Object.prototype.hasOwnProperty.call(mapping, rawStatus)) {
    return mapping[rawStatus as T];
  }
  throw new FootballError(
    "invalid_provider_payload",
    `Provider ${provider} returned an unsupported fixture status.`,
  );
}

export const FIXTURE_ADAPTER_STATUS_MAP = {
  NS: "not_started",
  SCHEDULED: "scheduled",
  "1H": "live_first_half",
  HT: "half_time",
  "2H": "live_second_half",
  ET: "extra_time",
  P: "penalties",
  FT: "finished",
  PST: "postponed",
  CANC: "cancelled",
  SUSP: "suspended",
  DEL: "delayed",
  ABD: "abandoned",
} as const satisfies StatusMap<string>;
