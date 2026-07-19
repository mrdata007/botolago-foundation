import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const listed = spawnSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
});

if (listed.status !== 0) {
  process.stderr.write(listed.stderr);
  process.exit(listed.status ?? 1);
}

const patterns = [
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "GitHub token", pattern: /\bgh[opsu]_[A-Za-z0-9_]{30,}\b/ },
  {
    name: "Supabase JWT-shaped secret",
    pattern: /\beyJ[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{20,}\b/,
  },
  {
    name: "assigned server secret",
    pattern:
      /^(?:export\s+)?(?:SUPABASE_SERVICE_ROLE_KEY|POSTGRES_PASSWORD|DATABASE_URL)\s*=\s*(?!<|\$\{|example|replace-me)[^\s#]+/im,
  },
];
const failures = [];

for (const file of listed.stdout.split("\0").filter(Boolean)) {
  let contents;
  try {
    contents = readFileSync(resolve(root, file), "utf8");
  } catch {
    continue;
  }
  if (contents.includes("\0")) continue;

  for (const candidate of patterns) {
    if (candidate.pattern.test(contents)) {
      failures.push(`${file}: possible ${candidate.name}`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.map((failure) => `- ${failure}`).join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("No high-confidence secrets found in tracked files.\n");
