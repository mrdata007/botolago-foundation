import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "dotenv";

import {
  GATE4_FUNCTION_SECRET_NAMES,
  quoteDotenvValue,
  serializeGate4FunctionSecrets,
} from "./write-gate4-function-secrets";

const script = join(import.meta.dir, "write-gate4-function-secrets.ts");
const workflow = join(
  import.meta.dir,
  "../../.github/workflows/gate4-production-news-ratings-canary.yml",
);
const workflowSource = readFileSync(workflow, "utf8");
const temporaryDirectories: string[] = [];

function workflowQuotedValue(name: "GNEWS_QUERY_FR" | "GNEWS_QUERY_AR"): string {
  const match = workflowSource.match(new RegExp(`^\\s+${name}:\\s+'(.*)'\\s*$`, "mu"));
  if (!match?.[1]) throw new Error(`MISSING_WORKFLOW_${name}`);
  return match[1].replaceAll("''", "'");
}

const GNEWS_QUERY_FR = workflowQuotedValue("GNEWS_QUERY_FR");
const GNEWS_QUERY_AR = workflowQuotedValue("GNEWS_QUERY_AR");

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function environment(): NodeJS.ProcessEnv {
  const values = Object.fromEntries(
    GATE4_FUNCTION_SECRET_NAMES.map((name) => [name, `fixture-${name.toLowerCase()}`]),
  );
  return {
    ...process.env,
    ...values,
    GNEWS_QUERY_FR,
    GNEWS_QUERY_AR,
  };
}

describe("Gate 4 function-secret serialization", () => {
  test("round-trips both GNews queries through Supabase CLI's pinned dotenv parser", () => {
    const values = environment();
    const parsed = parse(serializeGate4FunctionSecrets(values));

    expect(parsed.GNEWS_QUERY_FR).toBe(values.GNEWS_QUERY_FR);
    expect(parsed.GNEWS_QUERY_AR).toBe(values.GNEWS_QUERY_AR);
    expect(Object.keys(parsed).sort()).toEqual([...GATE4_FUNCTION_SECRET_NAMES].sort());
  });

  test("demonstrates the raw serialization that caused the production HTTP 400", () => {
    expect(parse(`GNEWS_QUERY_FR=${GNEWS_QUERY_FR}\n`).GNEWS_QUERY_FR).toBe(
      'Botola Pro" OR "Botola Maroc" OR "football marocain',
    );
  });

  test("chooses a non-conflicting delimiter without dotenv escape expansion", () => {
    expect(quoteDotenvValue('contains "double" quotes')).toBe(`'contains "double" quotes'`);
    expect(quoteDotenvValue("contains 'single' quotes")).toBe("`contains 'single' quotes`");
    expect(quoteDotenvValue("contains 'single' and `backtick`")).toBe(
      `"contains 'single' and \`backtick\`"`,
    );
  });

  test("rejects unsafe multiline and unquotable values", () => {
    expect(() => quoteDotenvValue("line one\nline two")).toThrow(
      "DOTENV_VALUE_CONTAINS_CONTROL_CHARACTER",
    );
    expect(() => quoteDotenvValue("'\"`\\n")).toThrow("DOTENV_VALUE_HAS_NO_SAFE_QUOTE");
  });

  test("writes a mode-0600 file that preserves every configured value", () => {
    const directory = mkdtempSync(join(tmpdir(), "botolago-gate4-secrets-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "function-secrets.env");
    const values = { ...environment(), GATE4_SECRET_FILE: path };

    const result = Bun.spawnSync(["bun", script], {
      env: values,
      stderr: "pipe",
      stdout: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const parsed = parse(readFileSync(path, "utf8"));
    for (const name of GATE4_FUNCTION_SECRET_NAMES) {
      expect(parsed[name]).toBe(values[name]);
    }
  });

  test("workflow uses the tested serializer before the Supabase CLI upload", () => {
    const writerIndex = workflowSource.indexOf(
      "bun scripts/backend/write-gate4-function-secrets.ts",
    );
    const uploadIndex = workflowSource.indexOf("./node_modules/.bin/supabase secrets set");

    expect(writerIndex).toBeGreaterThan(0);
    expect(uploadIndex).toBeGreaterThan(writerIndex);
    expect(workflowSource).not.toContain(
      'path.write_text("".join(f"{name}={os.environ[name]}\\n" for name in names)',
    );
  });
});
