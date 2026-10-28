import { describe, expect, test } from "bun:test";
import { loadRapidApiBudget, type RapidApiBudgetClient } from "./rapidapi-budget.ts";

const clientOf = (answer: () => Promise<{ data: unknown; error: { message?: string } | null }>) =>
  ({
    schema: () => ({ rpc: () => answer() }),
  }) as unknown as RapidApiBudgetClient;

describe("loadRapidApiBudget", () => {
  test("reads the used count, the limits, the window and the live interval", async () => {
    const budget = await loadRapidApiBudget(
      clientOf(async () => ({
        data: {
          used: 8990,
          softLimit: 8500,
          hardLimit: 9700,
          windowStart: "2026-10-10",
          liveIntervalSeconds: 180,
          incidentsIntervalMinutes: 10,
        },
        error: null,
      })),
      "fixtures",
    );
    expect(budget).toEqual({
      used: 8990,
      softLimit: 8500,
      hardLimit: 9700,
      windowStart: "2026-10-10",
      liveIntervalSeconds: 180,
      incidentsIntervalMinutes: 10,
    });
  });

  test("the incidents interval is 15 minutes when the database does not say or says something odd", async () => {
    for (const odd of [undefined, 0, 500, "ten"]) {
      const budget = await loadRapidApiBudget(
        clientOf(async () => ({
          data: { used: 1, softLimit: 2, hardLimit: 3, incidentsIntervalMinutes: odd },
          error: null,
        })),
        "fixtures",
      );
      expect(budget?.incidentsIntervalMinutes).toBe(15);
    }
  });

  test("an interval outside 60-300 reads as 60", async () => {
    const budget = await loadRapidApiBudget(
      clientOf(async () => ({
        data: { used: 1, softLimit: 2, hardLimit: 3, liveIntervalSeconds: 5 },
        error: null,
      })),
      "fixtures",
    );
    expect(budget?.liveIntervalSeconds).toBe(60);
    expect(budget?.windowStart).toBeNull();
  });

  test("a failed or unreadable answer is null and logged, never thrown", async () => {
    const lines: string[] = [];
    const log = (line: string) => lines.push(line);
    expect(
      await loadRapidApiBudget(
        clientOf(async () => ({ data: null, error: { message: "x" } })),
        "fixtures",
        log,
      ),
    ).toBeNull();
    expect(
      await loadRapidApiBudget(
        clientOf(async () => ({ data: { used: "many" }, error: null })),
        "fixtures",
        log,
      ),
    ).toBeNull();
    expect(
      await loadRapidApiBudget(
        clientOf(async () => {
          throw new Error("down");
        }),
        "fixtures",
        log,
      ),
    ).toBeNull();
    expect(lines).toHaveLength(3);
  });
});
