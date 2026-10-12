import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reportRefusal } from "./sofascore-fantasy-simple-ingest";

describe("read-only report failure diagnostics", () => {
  test("keeps refusal reasons but redacts raw and URL-encoded secrets", () => {
    const secret = "private/key+token";
    const text = reportRefusal(
      new Error(`read_failed: HTTP 401 ${secret} ${encodeURIComponent(secret)}`),
      [secret],
    );
    expect(text).toContain("read_failed: HTTP 401");
    expect(text).not.toContain(secret);
    expect(text).not.toContain(encodeURIComponent(secret));
    expect(text.match(/\[REDACTED\]/g)).toHaveLength(2);
  });

  test("emits one bounded markdown-safe line", () => {
    const text = reportRefusal(new Error("bad\n```<script>" + "x".repeat(1000)), []);
    expect(text).not.toMatch(/[\n`<>]/);
    expect(text.length).toBeLessThanOrEqual(540);
    expect(reportRefusal({ message: "private object" }, [])).toContain("unknown_failure");
  });

  test("the actual workflow report command publishes failure and preserves exit 2", () => {
    const workflow = readFileSync(
      join(import.meta.dir, "../../.github/workflows/sofascore-fantasy-simple-read.yml"),
      "utf8",
    );
    const block = workflow
      .split("      - name: Report (read only)")[1]!
      .split("      - name: Upload the report")[0]!;
    const shell = block
      .split("        run: |\n")[1]!
      .split("\n")
      .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
      .join("\n");
    const dir = mkdtempSync(join(tmpdir(), "sofascore-report-test-"));
    try {
      const run = Bun.spawnSync(
        [
          "bash",
          "-c",
          `bun() { echo 'SOFASCORE_FANTASY_REFUSED_BEFORE_WRITE: read_failed: HTTP 401'; return 2; }\n${shell}`,
        ],
        {
          env: {
            ...process.env,
            RUNNER_TEMP: dir,
            GITHUB_STEP_SUMMARY: join(dir, "summary"),
            SUPABASE_PRODUCTION_PROJECT_REF: "tkewgajrljbwgwedqsxn",
            ROUND: "3",
            INCLUDE_OBSERVED: "false",
            RAPIDAPI_KEY: "",
            SUPABASE_ACCESS_TOKEN: "",
          },
        },
      );
      expect(run.exitCode).toBe(2);
      expect(run.stdout.toString()).toContain("read_failed: HTTP 401");
      expect(readFileSync(join(dir, "summary"), "utf8")).toContain("read_failed: HTTP 401");
      expect(readFileSync(join(dir, "summary"), "utf8")).toContain("Runner exit: 2");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
