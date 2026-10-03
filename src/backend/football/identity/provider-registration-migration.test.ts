import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const MIGRATION = new URL(
  "../../../../supabase/migrations/20261001150000_register_sofascore_flashscore_providers.sql",
  import.meta.url,
);

/** The migration without comments and extra whitespace. */
const statements = () =>
  readFileSync(MIGRATION, "utf8")
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim())
    .filter(Boolean);

describe("provider registration migration (text check)", () => {
  test("is one insert, nothing else", () => {
    const all = statements();
    expect(all).toHaveLength(1);
    expect(all[0]).toBe(
      "insert into app_private.football_providers (name, display_name) values ('sofascore', 'Sofascore (RapidAPI)'), ('flashscore', 'Flashscore (RapidAPI)') on conflict (name) do nothing",
    );
  });

  test("never overwrites an existing provider, never touches the mapping table or any constraint", () => {
    const text = statements().join(" ").toLowerCase();
    expect(text).not.toContain("do update");
    expect(text).not.toContain("football_provider_mappings");
    for (const word of [
      "alter ",
      "drop ",
      "delete ",
      "update ",
      "truncate ",
      "create ",
      "grant ",
      "revoke ",
    ])
      expect(text).not.toContain(word);
  });
});
