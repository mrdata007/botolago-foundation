import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BULK_REASONS } from "./contract";

const root = join(import.meta.dir, "../../../../..");
const script = readFileSync(
  join(root, "scripts/backend/football-mapping-bulk-manifest.sql"),
  "utf8",
);
const dbTest = readFileSync(
  join(root, "supabase/tests/database/football_player_mapping_bulk_lifecycle.test.sql"),
  "utf8",
);

const code = (sql: string) =>
  sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
const squash = (sql: string) => sql.replace(/\s+/g, " ").trim();

describe("the manifest SQL script", () => {
  test("is read-only: no write, DDL or privilege statement", () => {
    expect(code(script)).not.toMatch(
      /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|call|do)\b/i,
    );
  });

  test("never reads a name, a slug or a raw birth date", () => {
    expect(code(script)).not.toMatch(
      /display_name|full_name|first_name|last_name|slug|date_of_birth|provider_birth_date|birth_date/i,
    );
  });

  test("carries exactly the approved tier reasons", () => {
    expect(script).toContain(BULK_REASONS.A);
    expect(script).toContain(BULK_REASONS.B);
  });

  test("is the exact query the database test exercises (no drift between the two)", () => {
    const body = squash(code(script).replace(/;\s*$/, ""));
    expect(squash(code(dbTest))).toContain(body);
  });
});
