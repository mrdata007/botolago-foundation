import { describe, expect, it } from "bun:test";
import { UNREADABLE_BUDGET } from "./football-live-refresh.ts";
import { RapidApiClient, SOFASCORE_RAPIDAPI_HOST } from "./rapidapi-client.ts";

describe("UNREADABLE_BUDGET (api.service_rapidapi_budget could not be read)", () => {
  it("lets the live feed and incidents through and refuses everything else", async () => {
    const seen: string[] = [];
    const api = new RapidApiClient({
      host: SOFASCORE_RAPIDAPI_HOST,
      key: "k",
      budget: UNREADABLE_BUDGET,
      fetch: async (url) => {
        seen.push(url);
        return Response.json({ ok: true });
      },
    });
    await api.getJson("tournaments/get-live-events?sport=football");
    await api.getJson("matches/get-incidents?matchId=1");
    for (const path of ["matches/get-lineups?matchId=1", "matches/get-statistics?matchId=1"]) {
      await expect(api.getJson(path)).rejects.toMatchObject({ budget: "soft_limit" });
    }
    expect(seen).toHaveLength(2);
  });
});
