import { describe, expect, test } from "bun:test";
import { MatchVisualDraftsRepository, draftSchema } from "./repository";
const draft = {
  id: "10000000-0000-4000-8000-000000000001",
  sourceUrl: "https://www.instagram.com/p/post/",
  label: "FUS – Raja",
  fixtureId: null,
  storyId: null,
  width: 588,
  height: 736,
  status: "held",
  rightsStatus: "unverified",
  hasResult: false,
  errorCode: null,
  version: 1,
  attempts: 0,
  leaseUntil: null,
  createdAt: "2026-10-14T00:00:00Z",
  updatedAt: "2026-10-14T00:00:00Z",
};
describe("Admin match draft contract", () => {
  test("lists only through staff-protected private RPC", async () => {
    const names: string[] = [];
    const repo = new MatchVisualDraftsRepository({
      rpc: async (name) => {
        names.push(name);
        return { data: [draft], error: null };
      },
    });
    expect(await repo.list()).toHaveLength(1);
    expect(names).toEqual(["admin_match_visual_drafts"]);
  });
  test("discard is version guarded and never calls a publishing API", async () => {
    const calls: unknown[] = [];
    const repo = new MatchVisualDraftsRepository({
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: true, error: null };
      },
    });
    await repo.discard(draftSchema.parse(draft));
    expect(calls).toEqual([
      { name: "admin_discard_match_visual_draft", args: { p_id: draft.id, p_version: 1 } },
    ]);
  });
  test("rejects public or rights-approved states in a held-only response", () => {
    expect(() => draftSchema.parse({ ...draft, status: "published" })).toThrow();
    expect(() => draftSchema.parse({ ...draft, rightsStatus: "approved" })).toThrow();
  });
  test("permission failures are surfaced instead of returning an empty queue", async () => {
    const repo = new MatchVisualDraftsRepository({
      rpc: async () => ({ data: null, error: { message: "staff_access_denied" } }),
    });
    await expect(repo.list()).rejects.toThrow("staff_access_denied");
  });
});
