import { readFileSync, writeFileSync } from "node:fs";
import { parseSofascoreEvents } from "../../supabase/functions/_shared/sofascore-fixtures";

// One owner-reviewed admission, not a change to mapped-only refresh behavior.
const [diagnosticPath, parentsPath, outputPath] = process.argv.slice(2);
const diagnostic = JSON.parse(readFileSync(diagnosticPath, "utf8"));
const parents = JSON.parse(readFileSync(parentsPath, "utf8"));
const capture = diagnostic.results.find((r: { path: string }) =>
  r.path.includes("get-next-matches"),
);
if (!capture?.fetched || capture.raw.hasNextPage !== false) throw Error("incomplete API page");
const parsed = parseSofascoreEvents(capture.raw);
if (parsed.malformedCount || parsed.foreignTournamentCount || parsed.unknownStatus.length) {
  throw Error("untrusted events");
}
const resolve = (type: string, id: string): string => {
  const matches = parents.mappings.filter(
    (m: { entity_type: string; external_id: string; active: boolean }) =>
      m.entity_type === type && m.external_id === id && m.active,
  );
  if (matches.length !== 1) throw Error(`ambiguous parent ${type}:${id}`);
  return matches[0].internal_entity_id;
};
const selected = parsed.events.filter((e) => e.round === 5 || e.round === 6);
if (selected.length !== 16 || new Set(selected.map((e) => e.sofascoreEventId)).size !== 16)
  throw Error("fixture count");
for (const round of [5, 6]) {
  const events = selected.filter((e) => e.round === round);
  const clubs = events.flatMap((e) => [e.homeTeamId, e.awayTeamId]);
  if (events.length !== 8 || new Set(clubs).size !== 16) throw Error("incomplete round");
}
const fixtures = selected.map((e) => {
  if (
    e.seasonId !== "102220" ||
    e.uniqueTournamentId !== "937" ||
    e.status !== "not_started" ||
    e.period !== "pre_match" ||
    e.homeScore !== null ||
    e.awayScore !== null ||
    Date.parse(e.startsAt) <= Date.parse(capture.capturedAt)
  )
    throw Error("not an upcoming Botola fixture");
  const updatedMs =
    e.changeTimestamp === null ? Date.parse(capture.capturedAt) : e.changeTimestamp * 1000;
  return {
    externalId: e.sofascoreEventId,
    round: e.round,
    homeExternalId: e.homeTeamId,
    awayExternalId: e.awayTeamId,
    fixture: {
      competitionId: resolve("competition", "937"),
      seasonId: resolve("season", "102220"),
      homeTeamId: resolve("team", e.homeTeamId),
      awayTeamId: resolve("team", e.awayTeamId),
      venueId: null,
      kickoffAt: e.startsAt,
      status: e.status,
      period: e.period,
      minute: null,
      addedTime: null,
      homeScore: null,
      awayScore: null,
      providerUpdatedAt: new Date(updatedMs).toISOString(),
      sourceSequence: updatedMs,
      sourceVersion: `sofascore:${e.sofascoreEventId}:${updatedMs}`,
      finalizedAt: null,
    },
  };
});
writeFileSync(
  outputPath,
  JSON.stringify(
    {
      capturedAt: capture.capturedAt,
      rawSha256: capture.sha256,
      excluded: parsed.events
        .filter((e) => e.round !== 5 && e.round !== 6)
        .map((e) => ({ eventId: e.sofascoreEventId, round: e.round })),
      fixtures,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({ fixtures: fixtures.length, rounds: [5, 6], capturedAt: capture.capturedAt }),
);
