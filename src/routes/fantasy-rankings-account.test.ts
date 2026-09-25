import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Security review of 2026-09-25. The rankings board kept the previous page on
 * screen while the next one loaded, whoever it belonged to: after a switch
 * from account A to B, B saw A's page (A's team, rank and points, marked as
 * "me") until B's board arrived. And it was fetched while the session was
 * still being read or owed its one-time code, so the board's `myRank` -- the
 * rank of whoever's token the request carried -- could show before the
 * second-factor gate moved the reader on.
 *
 * The two rules are tested as functions (`keepSameOwnerData` in
 * `fantasy-data-source.test.ts`, `isSessionSettled` in
 * `second-factor.test.ts`); this pins that the route uses them. Source-level,
 * like `auth-second-factor.test.ts`: the route needs a router and a DOM to
 * render.
 */

/** Source without comments, so a note that NAMES the old code cannot trip a rule. */
const code = readFileSync(join(import.meta.dir, "fantasy.rankings.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("/fantasy/rankings", () => {
  const board = code.slice(code.indexOf("const rankingsQ = useQuery({"));
  const options = board.slice(0, board.indexOf("});"));

  it("keeps a previous page only while it is the same owner's", () => {
    expect(code).toContain(
      "const sameOwnerData = useMemo(() => keepSameOwnerData(scope), [scope]);",
    );
    expect(options).toContain("placeholderData: sameOwnerData,");
    expect(code).not.toContain("keepPreviousData");
  });

  it("asks for the board only once the session is settled", () => {
    expect(options).toContain("enabled: isSessionSettled(status),");
  });
});
