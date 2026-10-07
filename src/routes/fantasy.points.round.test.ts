import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Route } from "./fantasy.points";

/**
 * BG-0155 (2) — Points opens on the round the hub's figure belongs to.
 *
 * The hub's points block links `/fantasy/points?gw={n}`; the screen used to
 * ignore its address and always open on the current round, which has no
 * result before kick-off. These run the route's own `validateSearch` and read
 * the screen's source for where the opening round comes from (the screen is
 * measured in the browser for the rest).
 */

type Validator = (search: Record<string, unknown>) => { gw?: number };
const validate = (Route.options as unknown as { validateSearch: Validator }).validateSearch;

const ROOT = join(import.meta.dir, "..", "..");
const code = (path: string) =>
  readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("/fantasy/points?gw=", () => {
  test("keeps a positive whole round number, as the router parses it or as text", () => {
    expect(validate({ gw: 13 }).gw).toBe(13);
    expect(validate({ gw: "13" }).gw).toBe(13);
    expect(validate({ gw: 1 }).gw).toBe(1);
  });

  test("drops anything else, so nothing of the raw query survives under the key", () => {
    for (const gw of [0, -2, 1.5, "abc", "", true, null, undefined, [13], { n: 13 }, 1_001]) {
      const seen = { ...{ gw }, ...validate({ gw }) };
      expect({ gw, seen: seen.gw }).toEqual({ gw, seen: undefined });
    }
    expect(validate({}).gw).toBeUndefined();
  });
});

describe("the round Points opens on", () => {
  const source = code("src/routes/fantasy.points.tsx");
  const hub = code("src/routes/fantasy.index.tsx");

  test("reads the summary through the hub's own query, key and service", () => {
    const query = /queryKey: key\("summary"\),\s*queryFn: \(\) => fantasyService\.getSummary\(\),/;
    expect(hub).toMatch(query);
    expect(source).toMatch(query);
  });

  test("asks for the address's round, then the round in play, then the figure's round, then the current one", () => {
    expect(source).toContain("requested: search.gw ?? null");
    expect(source).toContain("resultRound: summaryQ.isPending ? undefined");
    expect(source).toContain("summaryQ.data?.pointsGameweek ?? null");
    expect(source).toContain("current: currentGw");
    // "Suivre mes points" at kick-off: the round being played, even before
    // its first scoring pass has written the result the summary would read.
    expect(source.replace(/\s+/g, " ")).toContain(
      'inPlay: screen.gameweek?.status === "live" || screen.gameweek?.status === "provisional" || screen.gameweek?.status === "finalizing",',
    );
    const order = [
      "if (inRange(requested)) return requested;",
      "if (inPlay) return current;",
      "if (resultRound === undefined) return undefined;",
      "return inRange(resultRound) ? resultRound : current;",
    ];
    const at = order.map((needle) => source.indexOf(needle));
    expect(at.every((index) => index > -1)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  test("chooses once, and the stepper still moves between rounds", () => {
    expect(source).toContain("if (gw === null && opening !== undefined) setGw(opening);");
    expect(source).toContain("onChange={setGw}");
    // The current round alone no longer decides it.
    expect(source).not.toContain("if (gw === null && currentGw !== null) setGw(currentGw);");
  });
});
