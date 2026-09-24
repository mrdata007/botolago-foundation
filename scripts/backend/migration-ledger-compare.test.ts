import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  compareLedger,
  fingerprints,
  parseLedger,
  readAliases,
  readRepositoryMigrations,
  type RepositoryMigration,
} from "./migration-ledger-compare";

const FILE = [
  "-- A comment the applying tool may strip.",
  "set local lock_timeout = '5s';",
  "create table app.example (",
  "  id uuid primary key",
  ");",
  "",
  "create index example_idx on app.example (id);",
].join("\n");

function repo(version: string, name: string, sql = FILE): RepositoryMigration {
  return { version, name, ...fingerprints(sql) };
}

function row(version: string, name: string, sql = FILE) {
  return { version, name, ...fingerprints(sql) };
}

describe("migration ledger comparison", () => {
  test("comments, blank lines, indentation and the apply wrapper do not count", () => {
    const stripped =
      "create table app.example (\nid uuid primary key\n);\ncreate index example_idx on app.example (id);";
    expect(fingerprints(stripped)).toEqual(fingerprints(FILE));
  });

  test("statement splitting counts only for the dense fingerprint", () => {
    const split =
      "create table app.example (\n  id uuid primary key\n)\ncreate index example_idx on app.example (id)";
    expect(fingerprints(split).code).not.toBe(fingerprints(FILE).code);
    expect(fingerprints(split).dense).toBe(fingerprints(FILE).dense);
  });

  test("a change to the code is a difference", () => {
    const changed = FILE.replace("(id)", "(id desc)");
    expect(fingerprints(changed).code).not.toBe(fingerprints(FILE).code);
    expect(fingerprints(changed).dense).not.toBe(fingerprints(FILE).dense);
  });

  test("sorts rows into matched, split, aliased, pending, unknown and different", () => {
    const repository = [
      repo("20260101000000", "same"),
      repo("20260102000000", "split"),
      repo("20260103000000", "renumbered"),
      repo("20260104000000", "changed"),
      repo("20260105000000", "not_yet"),
    ];
    const ledger = [
      row("20260101000000", "same"),
      row("20260102000000", "split", FILE.replace(/;\n/g, "\n")),
      row("20260103123456", "renumbered"),
      row("20260104000000", "changed", FILE.replace("(id)", "(id desc)")),
      row("20260106000000", "from_elsewhere"),
    ];
    const report = compareLedger(ledger, repository, [
      { repository: "20260103000000_renumbered", production: "20260103123456" },
    ]);
    expect(report).toEqual({
      matched: ["20260101000000_same"],
      split: ["20260102000000_split"],
      aliased: ["20260103123456_renumbered = 20260103000000_renumbered"],
      pending: ["20260105000000_not_yet"],
      unknown: ["20260106000000_from_elsewhere"],
      different: ["20260104000000_changed"],
    });
  });

  test("a recorded name that does not match the file at that version is unknown", () => {
    const report = compareLedger(
      [row("20260101000000", "other_name")],
      [repo("20260101000000", "same")],
      [],
    );
    expect(report.unknown).toEqual(["20260101000000_other_name"]);
    expect(report.pending).toEqual(["20260101000000_same"]);
  });

  test("reads psql's tab-separated ledger and refuses anything else", () => {
    const { code, dense } = fingerprints(FILE);
    expect(parseLedger(`20260101000000\tsame\t${code}\t${dense}\n`)).toEqual([
      { version: "20260101000000", name: "same", code, dense },
    ]);
    expect(() => parseLedger(`20260101000000\tsame\t${code}`)).toThrow("not a ledger row");
  });

  test("the SQL and the TypeScript drop the same wrapper lines", () => {
    const sql = readFileSync(join(import.meta.dir, "sql/migration-ledger.sql"), "utf8");
    expect(sql).toContain("^set local (lock_timeout|statement_timeout) = ''[^'']*'';?$");
    expect(sql).toContain("E'[ \\t\\r\\n;]'");
  });
});

describe("production's known renumberings", () => {
  const aliases = readAliases();
  const repository = new Map(readRepositoryMigrations().map((m) => [`${m.version}_${m.name}`, m]));
  const repositoryVersions = new Set([...repository.values()].map((m) => m.version));

  test("are the 23 the 2026-09-24 audit found", () => {
    expect(aliases).toHaveLength(23);
  });

  test("each names a repository migration file", () => {
    for (const alias of aliases) {
      expect(`${alias.repository}: ${repository.has(alias.repository)}`).toBe(
        `${alias.repository}: true`,
      );
    }
  });

  test("no production version is also a repository version, and none repeats", () => {
    const production = aliases.map((alias) => alias.production);
    expect(new Set(production).size).toBe(production.length);
    expect(production.filter((version) => repositoryVersions.has(version))).toEqual([]);
  });
});
