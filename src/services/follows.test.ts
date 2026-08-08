import { describe, expect, it } from "bun:test";
import type { FollowRepository } from "@/backend/identity/contracts";
import { FollowService, LocalFollowRepository } from "./follows";

function repository(): FollowRepository & { actions: string[] } {
  const actions: string[] = [];
  return {
    actions,
    async listTeams() {
      return {
        items: [
          {
            targetId: "10000000-0000-4000-8000-000000000001",
            createdAt: new Date(0).toISOString(),
          },
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

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

const context = {
  actorId: "20000000-0000-4000-8000-000000000001",
  requestId: "follow-test",
} as const;

describe("FollowService", () => {
  it("reads canonical followed-team identifiers", async () => {
    const service = new FollowService(repository(), () => context);
    expect(await service.getFollowedTeamIds()).toEqual(["10000000-0000-4000-8000-000000000001"]);
  });

  it("uses idempotent repository mutations rather than route-local state", async () => {
    const repo = repository();
    const service = new FollowService(repo, () => context);
    const teamId = "10000000-0000-4000-8000-000000000001";
    await service.followTeam(teamId);
    await service.unfollowTeam(teamId);
    expect(repo.actions).toEqual([`follow:${teamId}`, `unfollow:${teamId}`]);
  });

  it("keeps mock follows local, actor-scoped, persistent, and idempotent", async () => {
    const storage = memoryStorage();
    const local = new LocalFollowRepository(() => storage);
    const initial = await local.listTeams({ limit: 100 }, context);
    expect(initial.items).toHaveLength(1);

    const added = "10000000-0000-4000-8000-000000000002";
    await local.followTeam(added, context);
    await local.followTeam(added, context);

    const reloaded = new LocalFollowRepository(() => storage);
    expect((await reloaded.listTeams({ limit: 100 }, context)).items).toHaveLength(2);

    await reloaded.unfollowTeam(initial.items[0]!.targetId, context);
    expect(
      (await reloaded.listTeams({ limit: 100 }, context)).items.map((item) => item.targetId),
    ).toEqual([added]);
    expect(
      (
        await reloaded.listTeams(
          { limit: 100 },
          { ...context, actorId: "20000000-0000-4000-8000-000000000002" },
        )
      ).items,
    ).toHaveLength(1);
  });
});
