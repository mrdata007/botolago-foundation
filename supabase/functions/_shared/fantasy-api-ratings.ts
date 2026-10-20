// Provider-native rating inputs. No catalog matching or identity writes.
import type { PerformanceLineups } from "./performance-contracts.ts";
import { isValidRating } from "./fantasy-rating-scoring.ts";
import { parseSofascoreIncidents, parseSofascoreLineups } from "./sofascore-performance-parse.ts";

export function buildApiRatingLineups(lineups: PerformanceLineups) {
  if (lineups.provider !== "sofascore" || lineups.players.length === 0)
    throw new Error("ratings_lineups_missing");
  const ids = new Set<string>();
  const players = lineups.players.map((p) => {
    if (!/^\d{1,12}$/.test(p.externalId) || ids.has(p.externalId))
      throw new Error("ratings_player_id_invalid");
    ids.add(p.externalId);
    const minutes = p.stats?.minutesPlayed ?? null;
    const rating = isValidRating(p.stats?.rating) ? p.stats!.rating : null;
    // A named starter or a rated substitute cannot become a DNP because minutes
    // are missing. An unused bench row with no statistics is a confirmed DNP.
    const appeared = p.starter || (minutes !== null && minutes > 0) || rating !== null;
    const uncertain = (minutes === null || minutes === 0) && p.stats !== null && !appeared;
    return {
      externalId: p.externalId,
      side: p.side,
      starter: p.starter,
      minutes,
      rating,
      appeared,
      uncertain,
    };
  });
  const validSides = ["home", "away"].every(
    (side) => players.filter((p) => p.side === side && p.starter).length === 11,
  );
  const missing = players.filter((p) => (p.appeared && p.rating === null) || p.uncertain);
  return {
    ready: validSides && missing.length === 0,
    participants: players.filter((p) => p.appeared).length,
    rated: players.filter((p) => p.appeared && p.rating !== null).length,
    missingRatingIds: missing.map((p) => p.externalId),
    validSides,
    players,
  };
}

const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Reconcile metadata-only bench rows with fresh, complete native-ID evidence. */
export function buildConfirmedApiRatingLineups(rawLineups: unknown, rawIncidents: unknown) {
  const lineups = parseSofascoreLineups(rawLineups);
  const baseline = buildApiRatingLineups(lineups);
  if (!baseline.players.some((p) => p.uncertain)) return baseline;
  try {
    if (
      !baseline.validSides ||
      !record(rawLineups) ||
      rawLineups.confirmed !== true ||
      !record(rawIncidents) ||
      !Array.isArray(rawIncidents.incidents)
    )
      return baseline;
    const fullTime = rawIncidents.incidents.find(
      (i) =>
        record(i) &&
        i.incidentType === "period" &&
        i.text === "FT" &&
        i.isLive === false &&
        typeof i.time === "number" &&
        i.time >= 90 &&
        i.time <= 120,
    );
    if (!record(fullTime) || typeof fullTime.time !== "number") return baseline;
    const incidents = parseSofascoreIncidents(rawIncidents);
    if (incidents.some((i) => ["unknown", "red_card", "second_yellow"].includes(i.kind)))
      return baseline;
    const byId = new Map(lineups.players.map((p) => [p.externalId, p]));
    const active = new Set(lineups.players.filter((p) => p.starter).map((p) => p.externalId));
    const appeared = new Set(active);
    const referenced = new Set<string>();
    for (const i of incidents)
      for (const p of [i.player, i.playerIn, i.playerOut, i.assist]) {
        if (p && (!p.externalId || !byId.has(p.externalId))) return baseline;
        if (p?.externalId) referenced.add(p.externalId);
      }
    for (const i of incidents
      .filter((i) => i.kind === "substitution")
      .sort((a, b) => a.minute - b.minute)) {
      const entering = i.playerIn?.externalId;
      const leaving = i.playerOut?.externalId;
      if (
        !entering ||
        !leaving ||
        entering === leaving ||
        !Number.isInteger(i.minute) ||
        i.minute < 0 ||
        i.minute > fullTime.time ||
        byId.get(entering)?.side !== i.side ||
        byId.get(leaving)?.side !== i.side ||
        !active.has(leaving) ||
        active.has(entering) ||
        appeared.has(entering)
      )
        return baseline;
      active.delete(leaving);
      active.add(entering);
      appeared.add(entering);
    }
    // Every entrant must have positive provider minutes, and every positive
    // appearance must be explained by the same substitution graph. No inferred
    // minutes, similar-name matching or absent-incident-only DNP decisions.
    for (const p of lineups.players) {
      const positive = (p.stats?.minutesPlayed ?? 0) > 0;
      if (appeared.has(p.externalId) !== positive) return baseline;
      if (
        !appeared.has(p.externalId) &&
        p.stats &&
        Object.values(p.stats).some((v) => v !== null && v !== 0)
      )
        return baseline;
    }
    if ([...referenced].some((id) => !appeared.has(id))) return baseline;
    const unused = new Set<string>();
    for (const side of ["home", "away"] as const) {
      const rawSide = rawLineups[side];
      if (!record(rawSide) || !Array.isArray(rawSide.players)) return baseline;
      for (const row of rawSide.players) {
        if (
          !record(row) ||
          !record(row.player) ||
          typeof row.player.id !== "number" ||
          !record(row.statistics)
        )
          continue;
        const id = String(row.player.id);
        if (
          appeared.has(id) ||
          referenced.has(id) ||
          byId.get(id)?.side !== side ||
          byId.get(id)?.starter !== false
        )
          continue;
        const metadataOnly = Object.entries(row.statistics).every(
          ([key, value]) =>
            (key === "totalShots" && value === 0) ||
            (key === "statisticsType" &&
              record(value) &&
              value.sportSlug === "football" &&
              value.statisticsType === "player" &&
              Object.keys(value).every((k) => k === "sportSlug" || k === "statisticsType")),
        );
        if (metadataOnly) unused.add(id);
      }
    }
    const players = baseline.players.map((p) =>
      p.uncertain && unused.has(p.externalId) ? { ...p, uncertain: false } : p,
    );
    const missing = players.filter((p) => (p.appeared && p.rating === null) || p.uncertain);
    return {
      ...baseline,
      players,
      ready: baseline.validSides && missing.length === 0,
      missingRatingIds: missing.map((p) => p.externalId),
    };
  } catch {
    return baseline;
  }
}
