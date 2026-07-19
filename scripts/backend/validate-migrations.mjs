import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationDirectory = resolve(root, "supabase/migrations");
const filenamePattern = /^(\d{14})_[a-z0-9_]+\.sql$/;
const files = readdirSync(migrationDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort();
const failures = [];
const timestamps = new Set();

if (files.length === 0) failures.push("At least one greenfield migration is required.");

for (const file of files) {
  const match = file.match(filenamePattern);
  if (!match) {
    failures.push(`${file}: expected YYYYMMDDHHMMSS_snake_case.sql`);
    continue;
  }

  if (timestamps.has(match[1])) {
    failures.push(`${file}: migration timestamp ${match[1]} is duplicated`);
  }
  timestamps.add(match[1]);

  const sql = readFileSync(resolve(migrationDirectory, file), "utf8");
  if (!sql.trim()) failures.push(`${file}: migration is empty`);

  if (/\bgrant\s+all(?:\s+privileges)?\s+on\b/i.test(sql)) {
    failures.push(`${file}: GRANT ALL is forbidden; grant explicit privileges`);
  }

  if (/\b(?:service_role|postgres)_key\s*=\s*['"][^'"]+/i.test(sql)) {
    failures.push(`${file}: possible credential embedded in SQL`);
  }

  const createdTables = [
    ...sql.matchAll(
      /\bcreate\s+table(?:\s+if\s+not\s+exists)?\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi,
    ),
  ].map((tableMatch) => tableMatch[1]);

  for (const table of createdTables) {
    const escaped = table.replaceAll(".", "\\.");
    const rlsPattern = new RegExp(
      `\\balter\\s+table\\s+(?:only\\s+)?${escaped}\\s+enable\\s+row\\s+level\\s+security\\b`,
      "i",
    );
    if (!rlsPattern.test(sql)) {
      failures.push(`${file}: ${table} must enable RLS in the creating migration`);
    }
  }

  if (/\bcreate(?:\s+or\s+replace)?\s+view\b/i.test(sql) && !/security_invoker/i.test(sql)) {
    failures.push(`${file}: views must declare security_invoker=true`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.map((failure) => `- ${failure}`).join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(`Validated ${files.length} migration(s).\n`);
