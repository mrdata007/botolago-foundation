import { describe, expect, test } from "bun:test";
import type {
  ArticleEditorialDetailDto,
  EditorialRevisionDto,
  EditorialStatus,
  TransitionArticleInput,
} from "./contracts";
import { NewsError } from "./errors";
import { EDITOR_REVISION_LIMIT, transitionAndReload } from "./editorial-session";

const ID = "11111111-1111-4111-8111-111111111111";
const context = { actorId: "editor", requestId: "test" };

/**
 * Holds one edition and enforces the database's two relevant rules: a
 * transition bumps `updatedAt` (the `set_updated_at` trigger), and a save must
 * present the current `updatedAt` or it is refused with `editorial_conflict`
 * (`api.editorial_update_article`). The pgTAP suite
 * `news_editorial_schedule_and_conflict.test.sql` proves both against the
 * real functions.
 */
function fakeRepository() {
  let tick = 0;
  const stamp = () => new Date(Date.UTC(2026, 8, 22, 12, 0, tick++)).toISOString();
  const state = { status: "draft" as EditorialStatus, updatedAt: stamp() };
  const revisions: EditorialRevisionDto[] = [];
  const detail = (): ArticleEditorialDetailDto =>
    ({ id: ID, status: state.status, updatedAt: state.updatedAt }) as ArticleEditorialDetailDto;
  return {
    state,
    reads: { article: 0, revisions: 0 },
    failReload: false,
    async transitionArticle(input: TransitionArticleInput) {
      revisions.unshift({ id: `r${revisions.length}` } as EditorialRevisionDto);
      state.status = input.targetStatus;
      state.updatedAt = stamp();
      return { articleId: ID, status: state.status, visibility: "private" as const };
    },
    async getEditorialArticle() {
      this.reads.article += 1;
      if (this.failReload) throw new Error("network");
      return detail();
    },
    async listRevisions(_id: string, limit: number) {
      this.reads.revisions += 1;
      expect(limit).toBe(EDITOR_REVISION_LIMIT);
      return revisions.slice(0, limit);
    },
    save(expectedUpdatedAt: string) {
      if (expectedUpdatedAt !== state.updatedAt)
        throw new NewsError("editorial_conflict", "stale token");
      state.updatedAt = stamp();
    },
    detail,
  };
}

describe("status transition then save (editor concurrency token)", () => {
  test("the token held before a transition is refused on the next save", async () => {
    const repo = fakeRepository();
    const before = repo.detail().updatedAt;
    await repo.transitionArticle({ articleEditionId: ID, targetStatus: "in_review" });
    // What the editor did before this fix: keep `before` and save with it.
    expect(() => repo.save(before)).toThrow("stale token");
  });

  test("transitionAndReload returns the fresh token, and saving with it succeeds", async () => {
    const repo = fakeRepository();
    const before = repo.detail().updatedAt;
    const outcome = await transitionAndReload(
      repo,
      { articleEditionId: ID, targetStatus: "in_review" },
      context,
    );
    expect(outcome.result.status).toBe("in_review");
    expect(outcome.article?.status).toBe("in_review");
    expect(outcome.article?.updatedAt).not.toBe(before);
    expect(() => repo.save(outcome.article!.updatedAt)).not.toThrow();
  });

  test("the revision list is re-read too, so the new snapshot shows up", async () => {
    const repo = fakeRepository();
    const outcome = await transitionAndReload(
      repo,
      { articleEditionId: ID, targetStatus: "in_review" },
      context,
    );
    expect(repo.reads).toEqual({ article: 1, revisions: 1 });
    expect(outcome.revisions).toHaveLength(1);
  });

  test("a failed re-read does not turn a successful transition into an error", async () => {
    const repo = fakeRepository();
    repo.failReload = true;
    const outcome = await transitionAndReload(
      repo,
      { articleEditionId: ID, targetStatus: "in_review" },
      context,
    );
    expect(outcome.result.status).toBe("in_review");
    expect(outcome.article).toBeNull();
    expect(outcome.revisions).toBeNull();
    expect(repo.state.status).toBe("in_review");
  });

  test("a refused transition propagates and nothing is re-read", async () => {
    const repo = fakeRepository();
    repo.transitionArticle = async () => {
      throw new NewsError("editorial_forbidden", "no");
    };
    await expect(
      transitionAndReload(repo, { articleEditionId: ID, targetStatus: "published" }, context),
    ).rejects.toThrow("no");
    expect(repo.reads).toEqual({ article: 0, revisions: 0 });
  });

  test("the editor route uses it for every transition", async () => {
    const source = await Bun.file(
      new URL("../../routes/admin.news.$articleEditionId.tsx", import.meta.url),
    ).text();
    expect(source).toContain("transitionAndReload(");
    expect(source).not.toContain("repository.transitionArticle(");
  });
});
