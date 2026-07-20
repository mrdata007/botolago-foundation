import { describe, expect, test } from "bun:test";
import { FixtureFootballProvider } from "../provider/fixture-adapter";
import type {
  FootballIngestionJob,
  IngestionCounts,
  IngestionPersistence,
  IngestionRunContext,
} from "./contracts";
import { runFootballIngestionJob } from "./runner";

const fixture = (id: string) => ({
  id,
  competitionId: "competition-1",
  seasonId: "season-1",
  homeId: "team-1",
  awayId: "team-2",
  kickoff: "2030-01-01T18:00:00.000Z",
  status: "NS" as const,
  updatedAt: "2030-01-01T10:00:00.000Z",
  sequence: 1,
});

class MemoryPersistence implements IngestionPersistence {
  readonly stored: string[] = [];
  readonly rejected: string[] = [];
  completed: IngestionCounts | null = null;
  failed = false;
  async begin(_provider: string, _job: FootballIngestionJob, _checkpoint: string | null) {
    return "run-1";
  }
  async upsert(_job: FootballIngestionJob, item: unknown) {
    const id = (item as { externalId: string }).externalId;
    if (id === "fixture-bad") throw new Error("deterministic rejection");
    this.stored.push(id);
    return "inserted" as const;
  }
  async reject(item: unknown) {
    this.rejected.push((item as { externalId: string }).externalId);
  }
  async complete(_context: IngestionRunContext, counts: IngestionCounts) {
    this.completed = { ...counts };
  }
  async fail() {
    this.failed = true;
  }
}

describe("modular ingestion runner", () => {
  test("is paginated, resumable, and isolates partial record failure", async () => {
    const persistence = new MemoryPersistence();
    const counts = await runFootballIngestionJob("fixtures", {
      provider: new FixtureFootballProvider({
        fixtures: [fixture("fixture-1"), fixture("fixture-bad"), fixture("fixture-2")],
      }),
      persistence,
      pageSize: 2,
      maxPages: 5,
    });
    expect(persistence.stored).toEqual(["fixture-1", "fixture-2"]);
    expect(persistence.rejected).toEqual(["fixture-bad"]);
    expect(counts).toMatchObject({ fetched: 3, validated: 3, inserted: 2, rejected: 1 });
    expect(persistence.completed).toEqual(counts);
    expect(persistence.failed).toBe(false);
  });

  test("fails safely when a cursor cannot finish within the page budget", async () => {
    const persistence = new MemoryPersistence();
    await expect(
      runFootballIngestionJob("fixtures", {
        provider: new FixtureFootballProvider({ fixtures: [fixture("1"), fixture("2")] }),
        persistence,
        pageSize: 1,
        maxPages: 1,
      }),
    ).rejects.toMatchObject({ code: "partial_sync_failure" });
    expect(persistence.failed).toBe(true);
  });
});
