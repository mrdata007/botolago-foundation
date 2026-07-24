import { describe, expect, it } from "bun:test";
import type { FollowRepository } from "@/backend/identity/contracts";
import { FollowService } from "./follows";

function repository(): FollowRepository & { actions: string[] } {
  const actions: string[] = [];
  return {
    actions,
    async listTeams() {
      return {
        items: [
          { targetId: "10000000-0000-4000-8000-000000000001", createdAt: new Date(0).toISOString() },
        ],
        nextCursor: null,
      };
    },
    async followTeam(id) {
      actions.push(`follow:${id}`);
    },
    async unfollowTeam(id) {
      actions.push(`unfollow:${id}`);
    },
    async listCompetitions() {
      return { items: [], nextCursor: null };
    },
    async followCompetition() {},
    async unfollowCompetition() {},
  };
}

describe("FollowService", () => {
  it("reads canonical followed-team identifiers", async () => {
    const service = new FollowService(repository(), () => ({
      actorId: "20000000-0000-4000-8000-000000000001",
      requestId: "follow-test",
    }));
    expect(await service.getFollowedTeamIds()).toEqual([
      "10000000-0000-4000-8000-000000000001",
    ]);
  });

  it("uses idempotent repository mutations rather than route-local state", async () => {
    const repo = repository();
    const service = new FollowService(repo, () => ({
      actorId: "20000000-0000-4000-8000-000000000001",
      requestId: "follow-test",
    }));
    const teamId = "10000000-0000-4000-8000-000000000001";
    await service.followTeam(teamId);
    await service.unfollowTeam(teamId);
    expect(repo.actions).toEqual([`follow:${teamId}`, `unfollow:${teamId}`]);
  });
});
