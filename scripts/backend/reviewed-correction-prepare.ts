/**
 * Reviewed corrections, step 2 of 3 (read-only): read our fixtures from
 * production, pair each with its Sofascore match, and write one proposal per
 * fixture plus REVIEW.md for the owner. Writes nothing to the database.
 *
 *   SUPABASE_ACCESS_TOKEN=… FIXTURE_EXTERNAL_IDS=19893370,… IN_FILE=…/sofascore-matches.json \
 *   OUT_DIR=… bun scripts/backend/reviewed-correction-prepare.ts
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildProposal,
  findSofascoreMatch,
  reviewMarkdown,
  type SofascoreMatchCapture,
} from "./reviewed-correction";
import {
  managementQuery,
  normalizeSnapshot,
  PRODUCTION_PROJECT_REF,
  snapshotSql,
} from "./reviewed-correction-db";

async function main(): Promise<void> {
  const token = process.env.SUPABASE_ACCESS_TOKEN ?? "";
  const outDir = process.env.OUT_DIR ?? "";
  const inFile = process.env.IN_FILE ?? "";
  if (!token || !outDir || !inFile)
    throw new Error("SUPABASE_ACCESS_TOKEN, OUT_DIR and IN_FILE are required");
  const ids = (process.env.FIXTURE_EXTERNAL_IDS ?? "").split(/[\s,]+/).filter(Boolean);
  if (ids.length === 0 || ids.length > 10)
    throw new Error("FIXTURE_EXTERNAL_IDS must list 1 to 10 ids");

  const matches = JSON.parse(await readFile(inFile, "utf8")) as SofascoreMatchCapture[];
  const rows = await managementQuery(snapshotSql(ids), {
    token,
    projectRef: PRODUCTION_PROJECT_REF,
  });
  const fixtures = normalizeSnapshot(
    (rows[0] as { snapshot?: unknown } | undefined)?.snapshot ?? [],
  );

  await mkdir(resolve(outDir, "proposals"), { recursive: true });
  const sections: string[] = [
    "# Reviewed corrections: please check",
    "",
    "Each table is what would be recorded for one match. Check the players marked SUGGESTED or NONE, the minutes and the goals. Approve by merging the pull request that adds these files; nothing is written before that.",
    "",
  ];
  for (const id of ids) {
    const fixture = fixtures.find((f) => f.fixtureExternalId === id);
    if (!fixture) {
      sections.push(`### Fixture ${id}\n\nNot found in production.\n`);
      console.log(`::warning::fixture ${id}: not found in production`);
      continue;
    }
    const match = findSofascoreMatch(fixture, matches);
    if (!match) {
      sections.push(
        `### ${fixture.homeTeamName} ${fixture.homeScore ?? "?"}–${fixture.awayScore ?? "?"} ${fixture.awayTeamName} (fixture ${id})\n\nNo single Sofascore match with the same kickoff (±3 h) and score was read.\n`,
      );
      console.log(`::warning::fixture ${id}: no Sofascore match paired`);
      continue;
    }
    const proposal = buildProposal(fixture, match);
    await writeFile(
      resolve(outDir, "proposals", `${id}.json`),
      `${JSON.stringify(proposal, null, 2)}\n`,
    );
    sections.push(reviewMarkdown(proposal), "");
    const suggested = proposal.rows.filter((row) => row.identity === "suggested").length;
    const unmatched = proposal.rows.filter((row) => row.identity === "unmatched").length;
    console.log(
      `::notice::fixture ${id} sofascore=${match.matchId} rows=${proposal.rows.length} suggested=${suggested} unmatched=${unmatched} blockers=${proposal.blockers.length} gameweek=${fixture.gameweek ?? "?"} gwStatus=${fixture.gameweekStatus ?? "?"} adaptive=${fixture.adaptiveEnabled} latestSource=${fixture.latestSource ?? "none"}`,
    );
  }
  await writeFile(resolve(outDir, "REVIEW.md"), `${sections.join("\n")}\n`);
  console.log("REVIEWED_CORRECTION_PREPARED");
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(
      `REVIEWED_CORRECTION_PREPARE_FAILED ${error instanceof Error ? error.message : "unknown"}`,
    );
    process.exit(1);
  });
}
