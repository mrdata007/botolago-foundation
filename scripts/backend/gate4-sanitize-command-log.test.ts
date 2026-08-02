import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = join(import.meta.dir, "gate4-sanitize-command-log.ts");
const scanner = join(import.meta.dir, "phase7f-scan-sanitized-evidence.py");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function fixture(content?: string) {
  const root = mkdtempSync(join(tmpdir(), "botolago-gate4-command-log-"));
  temporaryDirectories.push(root);
  const runtime = join(root, "runtime");
  const evidence = join(root, "evidence");
  mkdirSync(runtime);
  mkdirSync(evidence);
  const source = join(runtime, "raw.log");
  const destination = join(evidence, "sanitized.log");
  if (content !== undefined) writeFileSync(source, content);
  return { destination, evidence, source };
}

function sanitize(source: string, destination: string, overrides: Record<string, string> = {}) {
  return Bun.spawnSync(["bun", script], {
    env: {
      ...process.env,
      GATE4_COMMAND_LOG_SOURCE: source,
      GATE4_COMMAND_LOG_DESTINATION: destination,
      GATE4_COMMAND_OPERATION: "functions-deploy-football-ingest",
      GATE4_COMMAND_EXIT_CODE: "1",
      ...overrides,
    },
    stderr: "pipe",
    stdout: "pipe",
  });
}

describe("Gate 4 command log sanitizer", () => {
  test("redacts protected values and generic credential forms before evidence scanning", () => {
    const accessToken = "sbp_exact-production-access-token";
    const secretKey = "sb_secret_exact-production-secret-key";
    const databasePassword = "p@ssword/value+with=symbols";
    const g7Trigger = "g7-one-time-trigger-value-that-must-never-leak";
    const jwt = `eyJ${"a".repeat(36)}`;
    const {
      destination,
      evidence: evidenceDirectory,
      source,
    } = fixture(
      [
        `SUPABASE_ACCESS_TOKEN=${accessToken}`,
        `Authorization: Bearer ${jwt}`,
        `apikey=${secretKey}`,
        `connection=postgresql://postgres:${encodeURIComponent(databasePassword)}@db.example.test/postgres`,
        `trigger=${g7Trigger}`,
        "\u001b[31mpassword authentication failed\u001b[0m",
      ].join("\n"),
    );
    writeFileSync(destination, "stale", { mode: 0o644 });

    const result = sanitize(source, destination, {
      SUPABASE_ACCESS_TOKEN: accessToken,
      SUPABASE_DB_PASSWORD: databasePassword,
      SUPABASE_SECRET_KEY: secretKey,
      G7_BACKFILL_TRIGGER: g7Trigger,
    });
    const evidence = readFileSync(destination, "utf8");

    expect(result.exitCode).toBe(0);
    expect(evidence).not.toContain(accessToken);
    expect(evidence).not.toContain(secretKey);
    expect(evidence).not.toContain(databasePassword);
    expect(evidence).not.toContain(encodeURIComponent(databasePassword));
    expect(evidence).not.toContain(jwt);
    expect(evidence).not.toContain(g7Trigger);
    expect(evidence).not.toContain("\u001b");
    expect(statSync(destination).mode & 0o777).toBe(0o600);
    expect(evidence).toContain("operation=functions-deploy-football-ingest");
    expect(evidence).toContain("exitCode=1");

    const scan = Bun.spawnSync(["python3", scanner, evidenceDirectory], {
      stderr: "pipe",
      stdout: "pipe",
    });
    expect(scan.exitCode).toBe(0);
  });

  test("keeps only the final 80 command-output lines", () => {
    const { destination, source } = fixture(
      `${Array.from({ length: 100 }, (_, index) => `line-${index + 1}`).join("\n")}\n`,
    );

    expect(sanitize(source, destination).exitCode).toBe(0);
    const evidence = readFileSync(destination, "utf8");
    expect(evidence).not.toContain("line-20\n");
    expect(evidence).toContain("line-21\n");
    expect(evidence).toContain("line-100\n");
  });

  test("records a deterministic placeholder when the raw log is unavailable", () => {
    const { destination, source } = fixture();

    expect(sanitize(source, destination).exitCode).toBe(0);
    expect(readFileSync(destination, "utf8")).toContain("log unavailable");
  });
});
