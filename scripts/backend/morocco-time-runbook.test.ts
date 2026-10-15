import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  HELPERS,
  SCRIPTS,
  bodyOf,
  migrationPath,
  resolve,
  scriptPath,
} from "./build-apply-morocco-time";
import { read } from "./apply-script-kit";

/**
 * The owner runbook for the Morocco-time scripts quotes md5 digests for the owner to compare with
 * the live database. They must be the digests of the repository's functions, and the runbook must
 * name every script, in order, and say what the owner needs to know.
 */

const md5 = (text: string) => createHash("md5").update(text).digest("hex");
const runbook = read("docs/production/MOROCCO_TIME_FIX_OWNER_RUNBOOK.md");
const inventory = read("docs/engineering/MOROCCO_TIME_IN_THE_DATABASE.md");

describe("MOROCCO_TIME_FIX_OWNER_RUNBOOK.md", () => {
  test("names the five scripts and their migrations in the order of their timestamps", () => {
    let last = -1;
    for (const spec of SCRIPTS) {
      const script = scriptPath(spec).split("/").pop()!;
      const at = runbook.indexOf(`\`${script}\``);
      expect({ script, found: at !== -1 }).toEqual({ script, found: true });
      expect(at).toBeGreaterThan(last);
      last = at;
      expect(runbook).toContain(`${spec.version}_${spec.name}`);
      expect(migrationPath(spec)).toContain(spec.version);
    }
    expect(SCRIPTS.map((spec) => spec.version)).toEqual(
      [...SCRIPTS.map((spec) => spec.version)].sort(),
    );
  });

  test("every digest the owner is asked to compare is the repository's", () => {
    for (const spec of SCRIPTS) {
      for (const fn of spec.functions) {
        const resolved = resolve(spec, fn);
        expect({ fn: fn.signature, old: runbook.includes(md5(resolved.oldBody)) }).toEqual({
          fn: fn.signature,
          old: true,
        });
        expect({ fn: fn.signature, next: runbook.includes(md5(resolved.newBody)) }).toEqual({
          fn: fn.signature,
          next: true,
        });
      }
    }
    // And no digest that is not one of them.
    const known = new Set<string>();
    for (const spec of SCRIPTS) {
      for (const fn of spec.functions) {
        const resolved = resolve(spec, fn);
        known.add(md5(resolved.oldBody));
        known.add(md5(resolved.newBody));
      }
    }
    for (const digest of runbook.match(/\b[0-9a-f]{32}\b/g) ?? []) {
      expect({ digest, known: known.has(digest) }).toEqual({ digest, known: true });
    }
    expect(HELPERS).toHaveLength(10);
    expect(
      bodyOf(
        read(`supabase/migrations/20261016090000_morocco_time_helpers.sql`),
        HELPERS[0]!.header,
      ),
    ).toBeTruthy();
  });

  test("states the rule as confirmed, the pause answer, the platform alternative and what was not run", () => {
    expect(runbook).toContain("confirmed by the owner (2026-10-15)");
    expect(runbook).toContain("row 149");
    expect(runbook).toContain("predates the confirmation");
    expect(runbook).toContain("Is anything to be paused? No.");
    expect(runbook).toContain("This fix keeps working either way");
    expect(runbook).toContain("Supabase Postgres version that carries tz 2026c");
    expect(runbook).toContain("12:00");
    expect(runbook).toContain("13:00");
    expect(runbook).toContain("What was and was not run");
    expect(runbook).toContain("pgTAP itself");
    expect(runbook).toContain("account-deletion-worker");
    expect(runbook).not.toMatch(/needs the owner'?s? (to )?confirm/i);
    expect(inventory).toContain("confirmed by the owner");
  });

  test("the queries it asks the owner to run only read", () => {
    const sql = [...runbook.matchAll(/```sql\n([\s\S]*?)```/g)]
      .map((match) => match[1]!)
      .join("\n")
      .replace(/--[^\n]*/g, "");
    expect(sql).not.toMatch(
      /\b(insert\s+into|update\s+\w+\s+set|delete\s+from|truncate|create|alter|drop|grant|revoke)\b/i,
    );
    expect(sql).not.toMatch(/\bconfigure\s*\(/i);
  });
});
