/**
 * Writes the table of instants into supabase/tests/database/morocco_time_helpers.test.sql
 * from tests/timezone-parity/expected.json, the rule written down for the application
 * (what the browser, the Node servers and the e-mail renderer must all print).
 *
 *   bun scripts/backend/build-morocco-time-helpers-test.ts          # rewrite the block
 *   bun scripts/backend/build-morocco-time-helpers-test.ts --check  # exit 1 if it drifted
 *
 * The block sits between two marker lines in the test file; the rest of the file is
 * written by hand. src/lib/morocco-time-sql.test.ts runs the same comparison, so the
 * pgTAP expectations cannot drift from the TypeScript rule without a test failing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
export const TEST_PATH = "supabase/tests/database/morocco_time_helpers.test.sql";
export const BEGIN_MARK = "-- BEGIN GENERATED FROM tests/timezone-parity/expected.json";
export const END_MARK = "-- END GENERATED";

type Expected = Record<
  string,
  {
    zoneHour: number;
    dayKey: string;
    startOfDay: string;
    nextDay: string;
    adminLocal: string;
    adminBack: string;
  }
>;

const stamp = (iso: string) =>
  iso
    .replace("T", " ")
    .replace(/\.000Z$/, "+00")
    .replace(/Z$/, "+00");

export function block(): string {
  const expected = JSON.parse(
    readFileSync(join(root, "tests/timezone-parity/expected.json"), "utf8"),
  ) as Expected;
  const rows = Object.entries(expected).map(([instant, row]) => {
    const local = row.adminLocal.replace("T", " ");
    return `  (timestamptz '${stamp(instant)}', ${row.zoneHour}, '${row.dayKey}'::date, timestamptz '${stamp(row.startOfDay)}', timestamptz '${stamp(row.nextDay)}', timestamp '${local}', timestamptz '${stamp(row.adminBack)}')`;
  });
  return `${BEGIN_MARK}
create temporary table rule_rows (
  instant timestamptz, zone_hour integer, day_key date,
  day_start timestamptz, day_end timestamptz, admin_local timestamp, admin_back timestamptz
) on commit drop;
insert into rule_rows values
${rows.join(",\n")};
${END_MARK}`;
}

export function build(): string {
  const text = readFileSync(join(root, TEST_PATH), "utf8");
  const from = text.indexOf(BEGIN_MARK);
  const to = text.indexOf(END_MARK);
  if (from === -1 || to === -1) throw new Error("markers missing in the test file");
  return text.slice(0, from) + block() + text.slice(to + END_MARK.length);
}

if (import.meta.main) {
  const next = build();
  if (process.argv.includes("--check")) {
    if (next !== readFileSync(join(root, TEST_PATH), "utf8")) {
      console.error(`${TEST_PATH} drifted from tests/timezone-parity/expected.json`);
      process.exit(1);
    }
  } else {
    writeFileSync(join(root, TEST_PATH), next);
  }
}
