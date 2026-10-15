import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HELPERS,
  HELPER_FILE,
  HELPER_VERSION,
  RUNBOOK,
  SCRIPTS,
  bodyOf as builderBodyOf,
  build,
  migrationPath,
  scriptPath,
  type ScriptSpec,
} from "./build-apply-morocco-time";
import {
  between,
  bodyOf,
  commonApplyScriptTests,
  lastDefinerBefore,
  md5,
  read,
  statementsOf,
} from "./apply-script-kit";

/**
 * Shared checks for the five guarded Morocco-time scripts
 * (scripts/backend/apply-20261016090000-* .. apply-20261016090400-*): the pins are
 * recomputed here, independently of the builder, from the repository files.
 */

export const specFor = (version: string): ScriptSpec => {
  const spec = SCRIPTS.find((candidate) => candidate.version === version);
  if (!spec) throw new Error(`no spec for ${version}`);
  return spec;
};

const GUARD_COMMON = [
  "set local lock_timeout = '5s';",
  "perform set_config('bg.morocco_cron_before'",
];

export function moroccoScriptTests(
  version: string,
  extraGuards: string[],
  pauseText: string[],
  postflightText: string[] = [],
) {
  const spec = specFor(version);
  const path = scriptPath(spec);
  const script = read(path);
  const migration = read(migrationPath(spec));
  const header = script.slice(0, script.indexOf("\nbegin;\n"));
  const preflight = between(script, "do $preflight$", "$preflight$;");
  const postflight = between(script, "do $postflight$", "$postflight$;");
  const isHelperScript = version === HELPER_VERSION;

  describe(`${path.split("/").pop()}`, () => {
    commonApplyScriptTests({
      version,
      name: spec.name,
      scriptPath: path,
      runbook: RUNBOOK,
      guards: [
        ...GUARD_COMMON,
        ...(isHelperScript
          ? ["these helper functions already exist:"]
          : [
              `${HELPER_VERSION} (the Morocco clock helpers) is not recorded`,
              "is not the reviewed one",
              "the Morocco clock helpers do not give the application''s answers",
            ]),
        ...extraGuards,
      ],
    });

    test("is exactly what the builder makes from the migration file", () => {
      expect(script).toBe(build(spec));
    });

    test("the header says what to pause, and why that is enough", () => {
      expect(header).toContain("Nothing needs pausing");
      for (const text of pauseText) expect(header).toContain(text);
      expect(header).toContain("confirmed by the owner");
    });

    test("the postflight runs the probes that show the corrected answer", () => {
      for (const text of postflightText) expect(postflight).toContain(text);
    });

    test("compares the cron job list before and after, and never writes a setting", () => {
      expect(preflight).toContain("from cron.job j");
      expect(postflight).toContain("the cron job list moved");
      expect(statementsOf(script)).not.toMatch(
        /\b(notification_email_tick|notification_push_tick|pepites_configure|notification_email_configure|ops_alert_tick)\s*\(/,
      );
    });

    if (isHelperScript) {
      test("the ten helper functions are pinned to the migration's text", () => {
        const digests = HELPERS.map((helper) =>
          md5(
            bodyOf(
              migration,
              new RegExp(`create or replace function app_private\\.${helper.name}\\(`),
            ),
          ),
        );
        for (const digest of digests) {
          expect(postflight).toContain(`'${digest}'`);
        }
        expect(HELPERS).toHaveLength(10);
        // every helper in the migration is covered by the script, and no other function is created
        const created = [
          ...statementsOf(migration).matchAll(/create or replace function ([a-z_.]+)\(/g),
        ].map((match) => match[1]);
        expect(created.sort()).toEqual(
          HELPERS.map((helper) => `app_private.${helper.name}`).sort(),
        );
        expect(statementsOf(migration)).not.toMatch(
          /\bcreate\s+table\b|\balter\s+table\b|\bcron\.|\binsert\s+into\b|\bupdate\s+\w|\bdelete\s+from\b/i,
        );
      });
    } else {
      test("the helpers are pinned to the helper migration's text", () => {
        const helperSource = readFileSync(join(import.meta.dir, "../..", HELPER_FILE), "utf8");
        for (const helper of HELPERS) {
          const digest = md5(builderBodyOf(helperSource, helper.header));
          expect(preflight).toContain(`'${helper.signature}', '${digest}', '${helper.vol}'`);
        }
      });

      test("each replaced function is pinned to the repository: old text, new text, attributes, privileges", () => {
        expect(spec.functions.length).toBeGreaterThan(0);
        const digests = new Set<string>();
        for (const fn of spec.functions) {
          const oldSource = read(`supabase/migrations/${fn.oldFile}`);
          const oldBody = bodyOf(oldSource, fn.oldHeader);
          const newBody = bodyOf(migration, fn.newHeader);
          expect(oldBody).not.toBe(newBody);
          expect(preflight).toContain(
            `(${JSON.stringify(fn.signature).replaceAll('"', "'")}, '${md5(oldBody)}', '${md5(newBody)}'`,
          );
          digests.add(md5(oldBody));
          digests.add(md5(newBody));
          // the new text has what it must and none of what it must not
          for (const needle of fn.required) expect(newBody).toContain(needle);
          for (const needle of fn.forbidden) expect(newBody).not.toContain(needle);
          // the old text had at least one of the forbidden expressions (else the change is empty)
          expect(fn.forbidden.some((needle) => oldBody.includes(needle))).toBe(true);
        }
        // exactly these digests (and the helpers'), no stale ones
        const helperDigests = HELPERS.map((helper) =>
          md5(builderBodyOf(read(HELPER_FILE), helper.header)),
        );
        const expected = new Set([...digests, ...helperDigests]);
        expect(new Set((script.match(/'[0-9a-f]{32}'/g) ?? []).map((m) => m.slice(1, -1)))).toEqual(
          expected,
        );
      });

      test("each replaced function is the latest definition before this migration", () => {
        for (const fn of spec.functions) {
          const name = fn.signature.split("(")[0]!.replace(".", "\\.");
          const latest = lastDefinerBefore(
            version,
            new RegExp(`\\bfunction\\s+${name}\\s*\\(`, "i"),
          );
          expect({ signature: fn.signature, latest }).toEqual({
            signature: fn.signature,
            latest: fn.oldFile.split("_")[0],
          });
        }
      });

      test("the migration replaces only the listed functions, and re-states their privileges", () => {
        const created = [
          ...statementsOf(migration).matchAll(/create or replace function ([a-z_.]+)\(/g),
        ].map((match) => match[1]);
        expect(created.sort()).toEqual(
          spec.functions.map((fn) => fn.signature.split("(")[0]).sort(),
        );
        expect(statementsOf(migration)).not.toMatch(
          /\bcreate\s+table\b|\balter\s+table\b|\bcron\.|\bdrop\s+function\b/i,
        );
        // the migration's own guard names its prerequisite
        expect(migration).toContain("apply 20261016090000 first");
      });

      test("the postflight checks source, attributes, privileges and comments of every replaced function", () => {
        for (const text of [
          "is not the new source",
          "changed its attributes",
          "no longer contains",
          "still contains",
          "the privileges or the comments of a replaced function moved",
        ]) {
          expect(postflight).toContain(text);
        }
      });
    }
  });
}
