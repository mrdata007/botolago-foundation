import { describe, expect, it } from "bun:test";
import { MockFootballRepository } from "@/backend/football/mock-repository";
import * as fdb from "@/mocks/fantasy-data";
import { fantasyService } from "./fantasy-mock";

/**
 * U1 in the demo data: the football mock's squad ids and the Fantasy mock pool
 * are two id spaces, and the link map is how one finds the other. If the football
 * mock repository changes how it numbers players, this fails instead of every
 * demo link quietly disappearing.
 */
describe("fantasyService.getFootballPlayerLinks (mock)", () => {
  it("maps a football squad member to an existing Fantasy player", async () => {
    const links = await fantasyService.getFootballPlayerLinks();
    const repository = new MockFootballRepository();
    const clubs = await repository.getTeams("fr", 50);
    const squad = await repository.getTeamSquad(clubs[0]!.id, null, "fr");
    const linked = squad.filter((member) => links[member.playerId]);
    expect(linked.length).toBeGreaterThan(0);
    for (const member of linked) {
      const fantasy = fdb.fantasyPlayers.find((p) => p.id === links[member.playerId]);
      expect(fantasy?.name.fr).toBe(member.displayName);
    }
  });
});
