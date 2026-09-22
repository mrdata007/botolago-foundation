import { describe, expect, test } from "bun:test";
import type {
  ArticleEditorialDetailDto,
  EditorialRevisionDto,
  EditorialStatus,
  TransitionArticleInput,
} from "./contracts";
import { NewsError } from "./errors";
import { markdownToEditorialHtml } from "./editorial-markdown";
import {
  describeScheduledAt,
  EDITOR_REVISION_LIMIT,
  parseTranslationSearch,
  scheduleHealthProblem,
  revisionDifferences,
  revisionToEditorFields,
  transitionAndReload,
} from "./editorial-session";
import { sanitizeEditorialHtml } from "./sanitizer";

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

describe("restoring a revision into the editor", () => {
  const body = "Intro **forte**.\n\n## Section\n\n- un\n- deux";
  const revision = (overrides: Partial<EditorialRevisionDto> = {}): EditorialRevisionDto => ({
    id: "22222222-2222-4222-8222-222222222222",
    revisionNumber: 3,
    title: "Ancien titre",
    subtitle: null,
    summary: "Ancien résumé suffisamment long.",
    bodyHtml: sanitizeEditorialHtml(markdownToEditorialHtml(body)),
    status: "draft",
    visibility: "private",
    changedBy: null,
    createdAt: "2026-09-22T10:00:00.000Z",
    ...overrides,
  });

  test("brings back title, subtitle, summary and the body as editable Markdown", () => {
    expect(revisionToEditorFields(revision({ subtitle: "Sous-titre" }))).toEqual({
      title: "Ancien titre",
      subtitle: "Sous-titre",
      summary: "Ancien résumé suffisamment long.",
      bodyMarkdown: body,
    });
  });

  test("a null subtitle becomes an empty field, not the string 'null'", () => {
    expect(revisionToEditorFields(revision()).subtitle).toBe("");
  });

  test("reports which fields the revision would change", () => {
    const current = {
      title: "Nouveau titre",
      subtitle: "",
      summary: "Ancien résumé suffisamment long.",
      bodyMarkdown: `${body}\n\nUn paragraphe ajouté.`,
    };
    expect(revisionDifferences(revision(), current)).toEqual(["title", "bodyMarkdown"]);
  });

  test("a status-only snapshot identical to the form reports no difference", () => {
    const current = revisionToEditorFields(revision());
    expect(revisionDifferences(revision(), current)).toEqual([]);
  });

  test("the editor route offers the restore for each revision and confirms over unsaved text", async () => {
    const source = await Bun.file(
      new URL("../../routes/admin.news.$articleEditionId.tsx", import.meta.url),
    ).text();
    expect(source).toContain("revisionToEditorFields(revision)");
    expect(source).toContain("admin-news-revision-restore-${revision.revisionNumber}");
    expect(source).toContain("disabled={busy || !isEditable || differs.length === 0}");
  });
});

describe("creating the other-language edition of a story", () => {
  const storyId = "3f6c2a10-5b7e-4c1d-9a2b-8e4f6d0c1a2b";

  test("a valid story id and language open the form as a linked edition", () => {
    expect(parseTranslationSearch({ storyId, language: "ar" })).toEqual({
      storyId,
      language: "ar",
    });
  });

  test("anything invalid falls back to an ordinary new story, never half-linked", () => {
    for (const search of [
      {},
      { storyId },
      { language: "ar" },
      { storyId, language: "en" },
      { storyId: "not-a-uuid", language: "fr" },
      { storyId: `${storyId}' or 1=1`, language: "fr" },
      { storyId: 42, language: "fr" },
    ]) {
      expect(parseTranslationSearch(search)).toEqual({});
    }
  });

  test("the new-draft form sends the story id and locks the language", async () => {
    const source = await Bun.file(
      new URL("../../routes/admin.news.new.tsx", import.meta.url),
    ).text();
    expect(source).toContain("validateSearch: parseTranslationSearch");
    expect(source).toContain("storyId: translation.storyId ?? null");
    expect(source).toContain("disabled={!!translation.storyId}");
  });

  test("the editor links to it with its own story id and the other language", async () => {
    const source = await Bun.file(
      new URL("../../routes/admin.news.$articleEditionId.tsx", import.meta.url),
    ).text();
    expect(source).toContain('data-testid="admin-news-create-translation"');
    expect(source).toContain('const otherLanguage = article.language === "fr" ? "ar" : "fr"');
    expect(source).toContain("search={{ storyId: article.storyId, language: otherLanguage }}");
    // An existing counterpart is opened, not created a second time.
    expect(source).toContain('data-testid="admin-news-open-translation"');
  });
});

describe("the scheduled time as the editor reads it", () => {
  test("local time with the zone named, plus the stored UTC instant", () => {
    expect(describeScheduledAt("2026-09-22T18:10:04.000Z", "fr", "Africa/Casablanca")).toEqual({
      local: "mardi 22 septembre 2026 à 19:10 (GMT+1)",
      utc: "2026-09-22 18:10 UTC",
    });
  });

  test("Morocco's Ramadan clock change is followed (UTC+0 in Ramadan 2027)", () => {
    expect(describeScheduledAt("2027-02-20T18:10:00.000Z", "fr", "Africa/Casablanca").local).toBe(
      "samedi 20 février 2027 à 18:10 (GMT)",
    );
  });

  test("Arabic uses Latin digits and the same instant", () => {
    const shown = describeScheduledAt("2026-09-22T18:10:04.000Z", "ar", "Africa/Casablanca");
    expect(shown.local).toContain("19:10");
    expect(shown.local).toContain("2026");
    expect(shown.utc).toBe("2026-09-22 18:10 UTC");
  });
});

describe("scheduler health warning in the CMS", () => {
  const now = Date.parse("2026-09-22T18:00:00.000Z");
  const healthy = {
    jobActive: true,
    lastRunAt: "2026-09-22T17:59:00.000Z",
    overdueCount: 0,
    lastFailure: null,
  };

  test("a job that ran in the last minute with nothing overdue is fine", () => {
    expect(scheduleHealthProblem(healthy, now)).toBeNull();
  });

  test("warns for an inactive, silent, overdue or recently failing job", () => {
    expect(scheduleHealthProblem({ ...healthy, jobActive: false }, now)).toBe("job_inactive");
    expect(scheduleHealthProblem({ ...healthy, lastRunAt: null }, now)).toBe("job_stalled");
    expect(scheduleHealthProblem({ ...healthy, lastRunAt: "2026-09-22T17:54:00.000Z" }, now)).toBe(
      "job_stalled",
    );
    expect(scheduleHealthProblem({ ...healthy, overdueCount: 1 }, now)).toBe("overdue");
    expect(
      scheduleHealthProblem({ ...healthy, lastFailure: { at: "2026-09-22T12:00:00.000Z" } }, now),
    ).toBe("run_failed");
  });

  test("an old failure no longer warns", () => {
    expect(
      scheduleHealthProblem({ ...healthy, lastFailure: { at: "2026-09-20T12:00:00.000Z" } }, now),
    ).toBeNull();
  });
});

describe("editor wiring for activation", () => {
  const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

  test("both CMS forms guard unsaved work on in-app navigation, not just on reload", async () => {
    const editor = await read("../../routes/admin.news.$articleEditionId.tsx");
    const creator = await read("../../routes/admin.news.new.tsx");
    for (const source of [editor, creator]) expect(source).toContain("useUnsavedChangesGuard(");
    expect(editor).not.toContain('addEventListener("beforeunload"');
    // Creating the draft is not a loss: the move to its editor is let through.
    expect(creator.indexOf("guard.allowNextNavigation()")).toBeLessThan(
      creator.indexOf("void navigate({"),
    );
  });

  test("the guard uses the router blocker and the browser prompt", async () => {
    const guard = await read("../../lib/use-unsaved-changes-guard.ts");
    expect(guard).toContain("useBlocker({");
    expect(guard).toContain("enableBeforeUnload");
  });

  test("the editor shows the scheduled time and offers rescheduling", async () => {
    const editor = await read("../../routes/admin.news.$articleEditionId.tsx");
    expect(editor).toContain('data-testid="admin-news-scheduled-for"');
    expect(editor).toContain('scheduled: ["draft", "scheduled", "published", "unpublished"]');
  });

  test("an imported edition is flagged and offered only the archive transition", async () => {
    const editor = await read("../../routes/admin.news.$articleEditionId.tsx");
    expect(editor).toContain('data-testid="admin-news-imported-banner"');
    expect(editor).toContain('.filter((next) => next === "archived")');
    const list = await read("../../routes/admin.news.tsx");
    expect(list).toContain('data-testid="admin-news-filter-scope"');
    expect(list).toContain('data-testid="admin-news-schedule-warning"');
  });
});
