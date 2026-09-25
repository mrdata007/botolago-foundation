import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `football-team-arabic-names-former-clubs.sql` is the guarded script that
 * gives the clubs of past seasons their Arabic names in production. It must
 * stay a rehearsal unless someone edits it on purpose, check the clubs before
 * it writes, and write only rows that app.team_translations accepts.
 */

const script = readFileSync(
  join(import.meta.dir, "football-team-arabic-names-former-clubs.sql"),
  "utf8",
);

/** The rows of the names list: id, Latin name, Arabic name, Arabic short name. */
const clubs = [...script.matchAll(/\('([0-9a-f-]{36})', '([^']+)', '([^']+)', '([^']+)'\)/g)].map(
  ([, id, latin, name, shortName]) => ({ id, latin, name, shortName }),
);

describe("the Arabic names script for the clubs of past seasons", () => {
  test("ships as a rehearsal: one rollback, no commit", () => {
    const lines = script.split("\n").map((line) => line.trim());
    expect(lines.filter((line) => line === "rollback;")).toHaveLength(1);
    expect(lines.filter((line) => line === "commit;")).toHaveLength(0);
  });

  test("bounds its locks and checks the clubs before it writes", () => {
    const firstWrite = script.indexOf("insert into app.team_translations");
    expect(firstWrite).toBeGreaterThan(-1);
    for (const guard of [
      "set local lock_timeout = '5s';",
      "set local statement_timeout = '30s';",
      "these ids are not the clubs this file names",
    ]) {
      const at = script.indexOf(guard);
      expect({ guard, beforeFirstWrite: at > -1 && at < firstWrite }).toEqual({
        guard,
        beforeFirstWrite: true,
      });
    }
    // And reads everything back before the transaction ends.
    const end = script.indexOf("\nrollback;");
    for (const check of [
      "the Arabic name did not read back",
      "other translation row(s) changed during the write",
    ]) {
      const at = script.indexOf(check);
      expect({ check, afterWriteBeforeEnd: at > firstWrite && at < end }).toEqual({
        check,
        afterWriteBeforeEnd: true,
      });
    }
  });

  test("the result row checks the clubs the file writes, and no others", () => {
    const result = script.slice(script.indexOf("\nrollback;"));
    const checked = [...result.matchAll(/'([0-9a-f-]{36})'/g)].map(([, id]) => id);
    expect(clubs.length).toBeGreaterThan(0);
    expect(checked.sort()).toEqual(clubs.map((club) => club.id).sort());
    expect(result).toContain(`) = ${clubs.length}\n`);
  });

  test("every name fits the table's rules, in Arabic script", () => {
    for (const club of clubs) {
      for (const [field, value, max] of [
        ["name", club.name, 160],
        ["shortName", club.shortName, 40],
      ] as const) {
        const problems = [
          value !== value.trim() && "not trimmed",
          [...value].length > max && `longer than ${max}`,
          [...value].length < (field === "name" ? 2 : 1) && "too short",
          value !== value.normalize("NFC") && "not NFC",
          !/^[؀-ۿ]+( [؀-ۿ]+)*$/.test(value) && "not plain Arabic words",
        ].filter(Boolean);
        expect({ club: club.latin, field, problems }).toEqual({
          club: club.latin,
          field,
          problems: [],
        });
      }
      // The Latin name is compared byte for byte with app.teams.name.
      expect(club.latin).toBe(club.latin.normalize("NFC"));
    }
  });

  test("never writes app.teams, which the ingestion overwrites on every sync", () => {
    expect(script).not.toMatch(/(update|insert into|delete from)\s+app\.teams\b/i);
  });
});
