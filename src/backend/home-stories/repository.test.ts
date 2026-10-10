import { describe, expect, test } from "bun:test";
import { HomeStoriesRepository, type StoriesApi } from "./repository";
import { storyInputSchema, validateStoryFile } from "./contracts";
const story = {
  id: "10000000-0000-4000-8000-000000000001",
  titleFr: "La journée",
  titleAr: "الجولة",
  altFr: "Un stade",
  altAr: "ملعب",
  mediaAssetId: "20000000-0000-4000-8000-000000000001",
  storagePath: "news/test/story.webp",
  credit: null,
  destination: "/matches" as const,
  position: 0,
  published: false,
  version: 1,
};
function fixture(data: unknown = story, error: null | { message: string } = null) {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const api: StoriesApi = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data, error };
    },
  };
  return { calls, repo: new HomeStoriesRepository(api) };
}
describe("home story boundaries", () => {
  test("public and protected lists use distinct RPCs", async () => {
    const { repo, calls } = fixture([story]);
    await repo.list();
    await repo.list(false);
    expect(calls.map((c) => c.name)).toEqual(["home_stories", "admin_home_stories"]);
  });
  test("new images save to a draft without a client-supplied published flag", async () => {
    const { repo, calls } = fixture();
    await repo.save({ ...story, titleFr: "  Matchs  " });
    expect(calls[0].args).toMatchObject({
      p_id: null,
      p_version: null,
      p_title_fr: "Matchs",
      p_media_asset_id: story.mediaAssetId,
    });
    expect(calls[0].args).not.toHaveProperty("p_published");
  });
  test("edits and publications carry the version that was read", async () => {
    const { repo, calls } = fixture();
    await repo.save(story, story);
    await repo.publish(story, true);
    expect(calls[0].args).toMatchObject({ p_id: story.id, p_version: 1 });
    expect(calls[1].args).toEqual({ p_id: story.id, p_version: 1, p_published: true });
  });
  test("a conflict is surfaced rather than silently retried", async () => {
    const { repo, calls } = fixture(null, { message: "story_conflict" });
    await expect(repo.save(story, story)).rejects.toThrow("story_conflict");
    expect(calls).toHaveLength(1);
  });
  test("invalid destinations and missing translations fail before sending", async () => {
    const { repo, calls } = fixture();
    await expect(
      repo.save({ ...story, destination: "https://example.com" as never }),
    ).rejects.toThrow();
    await expect(repo.save({ ...story, titleAr: " " })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
  test("malformed media responses cannot render arbitrary image paths", async () => {
    await expect(
      fixture([{ ...story, storagePath: "news/../../private.svg" }]).repo.list(),
    ).rejects.toThrow();
  });
  test("both descriptions and bounded positions are required", () => {
    expect(storyInputSchema.safeParse({ ...story, position: -1 }).success).toBe(false);
    expect(storyInputSchema.safeParse({ ...story, altFr: "" }).success).toBe(false);
    expect(storyInputSchema.safeParse({ ...story, titleFr: "x".repeat(201) }).success).toBe(false);
  });
  test("rejects SVG, empty and oversized files", () => {
    for (const file of [
      { type: "image/svg+xml", size: 10 },
      { type: "image/png", size: 0 },
      { type: "image/png", size: 10485761 },
    ])
      expect(() => validateStoryFile(file)).toThrow();
    expect(() => validateStoryFile({ type: "image/webp", size: 100 })).not.toThrow();
  });
});
