import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outputPath = resolve(root, "src/backend/generated/database.types.ts");
const executable = resolve(
  root,
  "node_modules/.bin",
  process.platform === "win32" ? "supabase.cmd" : "supabase",
);

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

const result = spawnSync(
  executable,
  ["gen", "types", "--db-url", databaseUrl, "--schema", "public,app,api"],
  commandOptions,
);

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const header = [
  "// Generated from the greenfield BotolaGO database. Do not edit by hand.",
  "// Run `bun run backend:types:generate` after every schema migration.",
  "",
].join("\n");

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${header}${result.stdout.trim()}\n`, "utf8");
process.stdout.write(`Generated ${outputPath}\n`);
