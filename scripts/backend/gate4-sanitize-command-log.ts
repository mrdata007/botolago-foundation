import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const sourcePath = process.env.GATE4_COMMAND_LOG_SOURCE;
const destinationPath = process.env.GATE4_COMMAND_LOG_DESTINATION;
const operation = process.env.GATE4_COMMAND_OPERATION;
const exitCode = process.env.GATE4_COMMAND_EXIT_CODE;

if (!sourcePath || !destinationPath || !operation || !exitCode) {
  throw new Error("GATE4_COMMAND_LOG_CONFIGURATION_MISSING");
}
if (!/^[a-z0-9._-]{1,80}$/.test(operation)) {
  throw new Error("GATE4_COMMAND_OPERATION_INVALID");
}
if (!/^(?:0|[1-9][0-9]{0,2})$/.test(exitCode)) {
  throw new Error("GATE4_COMMAND_EXIT_CODE_INVALID");
}

let content = existsSync(sourcePath) ? readFileSync(sourcePath, "utf8") : "log unavailable";

const protectedValues = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_DB_PASSWORD",
  "SPORTSMONKS_API_TOKEN",
  "GNEWS_API_KEY",
  "NEWS_INGESTION_TRIGGER_SECRET",
  "FOOTBALL_INGESTION_TRIGGER_SECRET",
  "GATE4_RATINGS_TRIGGER",
  "G7_BACKFILL_TRIGGER",
]
  .map((name) => process.env[name] ?? "")
  .filter(Boolean)
  .flatMap((value) => [value, encodeURIComponent(value)]);

const uniqueProtectedValues = [...new Set(protectedValues)].sort(
  (left, right) => right.length - left.length,
);

for (const value of uniqueProtectedValues) {
  content = content.split(value).join("***");
}

const ansiEscape = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");

content = content
  .replace(ansiEscape, "")
  .replace(/\b(?:sbp|sb_secret|sb_publishable)_[A-Za-z0-9._-]+/g, "***")
  .replace(/\beyJ[A-Za-z0-9._-]{20,}\b/g, "***")
  .replace(/\b((?:postgres(?:ql)?|https?):\/\/[^:\s/]+:)[^@\s/]+@/gi, "$1***@")
  .replace(/\b(?:authorization|apikey)\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi, "[credential-redacted]")
  .replace(
    /(?:access_token|refresh_token|token_hash|hashed_token|password)(?:\s*[:=]\s*[^\s,;]+)?/gi,
    "[sensitive-field-redacted]",
  );

const lines = content.replace(/\r\n/g, "\n").split("\n");
if (lines.at(-1) === "") lines.pop();
const tail = lines.slice(-80).join("\n").trimEnd() || "(no command output)";
const sanitized = [
  "schemaVersion=1",
  `operation=${operation}`,
  `exitCode=${exitCode}`,
  "output:",
  tail,
  "",
].join("\n");

writeFileSync(destinationPath, sanitized, { encoding: "utf8", mode: 0o600 });
chmodSync(destinationPath, 0o600);
