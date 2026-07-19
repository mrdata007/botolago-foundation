import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const generatedPath = resolve(root, "src/backend/generated/database.types.ts");
const executable = resolve(
  root,
  "node_modules/.bin",
  process.platform === "win32" ? "supabase.cmd" : "supabase",
);
const header = [
  "// Generated from the greenfield BotolaGO database. Do not edit by hand.",
  "// Run `bun run backend:types:generate` after every schema migration.",
  "",
].join("\n");

const commandOptions = {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
};
const status = spawnSync(executable, ["status", "--output", "json"], commandOptions);

if (status.status !== 0) {
  process.stderr.write(status.stderr || status.stdout);
  process.exit(status.status ?? 1);
}

const databaseUrl = JSON.parse(status.stdout).DB_URL;
if (!databaseUrl) {
  process.stderr.write("The local Supabase database is not running.\n");
  process.exit(1);
}

const typeGenerationArguments = [
  "gen",
  "types",
  "--db-url",
  databaseUrl,
  "--schema",
  "public,app,api",
];
const registryRetryDelaysMs = [5_000, 15_000, 30_000];
const isTransientRegistryFailure = (output) =>
  /(?:too\s*many\s*requests|toomanyrequests|rate exceeded|http\s*429)/i.test(output);

let result;
for (let attempt = 0; ; attempt += 1) {
  result = spawnSync(executable, typeGenerationArguments, commandOptions);
  if (result.status === 0) break;

  const output = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  const delayMs = registryRetryDelaysMs[attempt];
  if (delayMs === undefined || !isTransientRegistryFailure(output)) break;

  process.stderr.write(
    `Supabase type generation hit a transient registry rate limit; retrying in ${delayMs / 1_000}s ` +
      `(attempt ${attempt + 2}/${registryRetryDelaysMs.length + 1}).\n`,
  );
  await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
}

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const expected = `${header}${result.stdout.trim()}\n`.replaceAll("\r\n", "\n");
const actual = readFileSync(generatedPath, "utf8").replaceAll("\r\n", "\n");

if (actual !== expected) {
  process.stderr.write(
    "Generated database types are stale. Run `bun run backend:types:generate`.\n",
  );
  process.exit(1);
}

process.stdout.write("Generated database types are current.\n");
