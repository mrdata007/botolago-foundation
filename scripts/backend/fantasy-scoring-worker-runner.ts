import { readFile } from "node:fs/promises";
import { appendFile } from "node:fs/promises";
import {
  scoringExecutionConfirmation,
  scoringManifestDigest,
  validateScoringManifest,
} from "../../supabase/functions/_shared/fantasy-scoring-worker";

const MANIFEST_PATH = /^docs\/production\/fantasy-scoring-manifests\/[a-z0-9][a-z0-9._-]*\.json$/;
const SHA256 = /^[0-9a-f]{64}$/;
const PROJECT_REF = /^[a-z]{20}$/;

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? "" : process.argv[index + 1]?.trim();
  if (!value || value.startsWith("--")) throw new Error(`MISSING_${name.slice(2).toUpperCase()}`);
  return value;
}

function optionalArgument(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1]?.trim();
  if (!value || value.startsWith("--")) throw new Error(`MISSING_${name.slice(2).toUpperCase()}`);
  return value;
}

function mode(): "validate" | "execute" {
  const value = process.argv[2];
  if (value !== "validate" && value !== "execute") throw new Error("INVALID_MODE");
  return value;
}

async function githubOutput(values: Readonly<Record<string, string>>): Promise<void> {
  const path = process.env.GITHUB_OUTPUT?.trim();
  if (!path) return;
  await appendFile(path, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(""), {
    encoding: "utf8",
  });
}

function endpoint(): string {
  const projectUrl = process.env.SUPABASE_PRODUCTION_URL?.trim().replace(/\/$/, "") ?? "";
  const expectedRef = process.env.SUPABASE_PRODUCTION_PROJECT_REF?.trim() ?? "";
  if (!PROJECT_REF.test(expectedRef)) throw new Error("INVALID_PRODUCTION_PROJECT_REF");
  if (projectUrl !== `https://${expectedRef}.supabase.co`) {
    throw new Error("PRODUCTION_PROJECT_GUARD_FAILED");
  }
  return `${projectUrl}/functions/v1/fantasy-scoring-worker`;
}

async function main(): Promise<void> {
  const operation = mode();
  const path = argument("--manifest");
  const expectedDigest = argument("--expected-digest");
  if (!MANIFEST_PATH.test(path)) throw new Error("INVALID_MANIFEST_PATH");
  if (!SHA256.test(expectedDigest)) throw new Error("INVALID_EXPECTED_DIGEST");
  const source = await readFile(path, "utf8");
  if (Buffer.byteLength(source, "utf8") > 4 * 1024 * 1024) throw new Error("MANIFEST_TOO_LARGE");
  const manifest = validateScoringManifest(JSON.parse(source) as unknown);
  const digest = await scoringManifestDigest(manifest);
  if (digest !== expectedDigest) throw new Error("MANIFEST_DIGEST_MISMATCH");
  const confirmation = scoringExecutionConfirmation(manifest, digest);
  const counts = {
    fixtures: manifest.fixtures.length,
    players: manifest.fixtures.reduce((total, fixture) => total + fixture.players.length, 0),
    pointEvents: manifest.fixtures.reduce(
      (total, fixture) =>
        total + fixture.players.reduce((subtotal, player) => subtotal + player.events.length, 0),
      0,
    ),
    leagueScopes: 2 + manifest.leagueIds.length * 2,
  };
  await githubOutput({ manifest_digest: digest, execution_confirmation: confirmation });
  if (operation === "validate") {
    console.log(
      JSON.stringify({
        valid: true,
        manifestDigest: digest,
        executionConfirmation: confirmation,
        counts,
        recurringScheduleEnabled: false,
      }),
    );
    return;
  }

  const suppliedConfirmation = optionalArgument("--confirmation");
  if (suppliedConfirmation !== confirmation) throw new Error("EXECUTION_CONFIRMATION_FAILED");
  const triggerSecret = process.env.FANTASY_SCORING_WORKER_KEY?.trim() ?? "";
  if (triggerSecret.length < 32) throw new Error("SCORING_WORKER_KEY_MISSING");
  const response = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-botolago-scoring-key": triggerSecret,
    },
    body: JSON.stringify({
      mode: "execute",
      manifest,
      expectedManifestDigest: digest,
      confirmation,
    }),
    redirect: "error",
    signal: AbortSignal.timeout(14 * 60 * 1000),
  });
  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok || result.completed !== true) {
    const error = typeof result.error === "string" ? result.error : "WORKER_REQUEST_FAILED";
    const stage = typeof result.stage === "string" ? result.stage : "unknown";
    throw new Error(`${error}:${stage}`);
  }
  const summary =
    typeof result.summary === "object" && result.summary !== null
      ? (result.summary as Record<string, unknown>)
      : {};
  console.log(
    JSON.stringify({
      completed: true,
      manifestDigest: digest,
      alreadyComplete: summary.alreadyComplete === true,
      fixtureSnapshots: summary.fixtureSnapshots ?? null,
      rankingScopes: summary.rankingScopes ?? null,
      recurringScheduleEnabled: false,
    }),
  );
}

await main();
