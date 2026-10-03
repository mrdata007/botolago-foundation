import type { ProviderSquadPlayer } from "./contracts";

/** Synthetic data for the identity tests: no real player, no real date. */
export const NOW = new Date("2026-10-01T12:00:00.000Z");

export interface SofaEntry {
  id: number;
  name?: string;
  position?: string | null;
  shirtNumber?: number | null;
  height?: number | null;
  dateOfBirthTimestamp?: number | null;
  dateOfBirth?: string | null;
  country?: string | null;
  teamId?: number | null;
}

export function sofaEntry(entry: SofaEntry) {
  const dobTs = entry.dateOfBirthTimestamp;
  return {
    player: {
      id: entry.id,
      name: entry.name ?? `Test Player ${entry.id}`,
      position: entry.position === undefined ? "M" : entry.position,
      shirtNumber: entry.shirtNumber === undefined ? entry.id % 100 : entry.shirtNumber,
      height: entry.height === undefined ? 180 : entry.height,
      ...(dobTs === undefined ? {} : { dateOfBirthTimestamp: dobTs }),
      ...(entry.dateOfBirth === undefined ? {} : { dateOfBirth: entry.dateOfBirth }),
      country: entry.country === null ? undefined : { alpha2: entry.country ?? "MA" },
      team: entry.teamId === null ? undefined : { id: entry.teamId ?? 100 },
    },
  };
}

export const sofaPayload = (entries: ReturnType<typeof sofaEntry>[]) => ({ players: entries });

/** Seconds since the epoch for a UTC date. */
export const seconds = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00.000Z`) / 1000);

export interface FlashEntry {
  id: string;
  name?: string;
  type?: string;
  jersey?: number | null;
  flag?: number;
}

export function flashPayload(entries: FlashEntry[]) {
  return {
    DATA: [
      {
        ITEMS: entries.map((e) => ({
          PLAYER_ID: e.id,
          PLAYER_NAME: e.name ?? `Test Player ${e.id}`,
          PLAYER_TYPE_ID: e.type ?? "MIDFIELDER",
          PLAYER_JERSEY_NUMBER: e.jersey === undefined ? 7 : e.jersey,
          PLAYER_FLAG_ID: e.flag ?? 76,
        })),
      },
    ],
  };
}

/** A squad of `n` Sofascore entries with distinct ids, one goalkeeper, all valid dates. */
export function sofaSquadEntries(n: number, startId = 1000, teamId = 100) {
  return Array.from({ length: n }, (_, i) =>
    sofaEntry({
      id: startId + i,
      teamId,
      position: i === 0 ? "G" : ["D", "M", "F"][i % 3]!,
      shirtNumber: i + 1,
      dateOfBirthTimestamp: seconds(`${1990 + (i % 12)}-0${(i % 9) + 2}-1${i % 9}`),
      dateOfBirth: `${1990 + (i % 12)}-0${(i % 9) + 2}-1${i % 9}T00:00:00+00:00`,
    }),
  );
}

export function flashSquadEntries(n: number, prefix = "fl") {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${String(i).padStart(4, "0")}`,
    type: i === 0 ? "GOALKEEPER" : ["DEFENDER", "MIDFIELDER", "FORWARD"][i % 3]!,
    jersey: i + 1,
  }));
}

/** Minimal provider player for ranking tests. */
export function providerPlayer(overrides: Partial<ProviderSquadPlayer> = {}): ProviderSquadPlayer {
  return {
    provider: "sofascore",
    externalPlayerId: "1",
    requestedTeamId: "100",
    squadCompleteness: "COMPLETE",
    registeredTeamId: "100",
    registeredTeamDisagreement: false,
    shirtNumber: 9,
    positionSignal: "F",
    dobSignalState: "valid",
    dobJanuary1: false,
    heightSignal: 180,
    nationalitySignal: "alpha2:MA",
    signalValues: { birthDate: "1998-05-14" },
    private: { displayName: "Test Display Name" },
    ...overrides,
  };
}
