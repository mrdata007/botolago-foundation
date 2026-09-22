import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  ArticleEditorialDetailDto,
  EditorialRevisionDto,
  NewsLanguage,
  NewsRepository,
  TransitionArticleInput,
  TransitionArticleResult,
} from "./contracts";
import { editorialHtmlToMarkdown } from "./editorial-markdown";

export const EDITOR_REVISION_LIMIT = 20;

export interface TransitionOutcome {
  readonly result: TransitionArticleResult;
  /** The edition as the server now holds it, or `null` when the re-read failed
   *  after the transition itself had already succeeded. */
  readonly article: ArticleEditorialDetailDto | null;
  readonly revisions: readonly EditorialRevisionDto[] | null;
}

/**
 * Runs a status transition and then re-reads the edition.
 *
 * The re-read is not cosmetic. Every transition bumps `updated_at` (the
 * `set_updated_at` trigger), and `updated_at` is the optimistic-concurrency
 * token `editorial_update_article` compares against. The editor used to patch
 * only `status`/`visibility` into its local copy and keep the old token, so the
 * first save after any transition -- sending an article back to draft,
 * unpublishing it to fix a typo -- was refused as "modified elsewhere" and the
 * only way out was a reload that threw the editor's unsaved text away.
 *
 * A failed re-read does not turn a successful transition into an error: the
 * caller gets `article: null` and asks the editor to reload.
 */
export async function transitionAndReload(
  repository: Pick<NewsRepository, "transitionArticle" | "getEditorialArticle" | "listRevisions">,
  input: TransitionArticleInput,
  context: RepositoryContext,
): Promise<TransitionOutcome> {
  const result = await repository.transitionArticle(input, context);
  try {
    const [article, revisions] = await Promise.all([
      repository.getEditorialArticle(input.articleEditionId, context),
      repository.listRevisions(input.articleEditionId, EDITOR_REVISION_LIMIT, context),
    ]);
    return { result, article, revisions };
  } catch {
    return { result, article: null, revisions: null };
  }
}

export interface EditorProseFields {
  readonly title: string;
  readonly subtitle: string;
  readonly summary: string;
  readonly bodyMarkdown: string;
}

export type ProseField = keyof EditorProseFields;

/**
 * The editor's prose fields as they stood in a revision.
 *
 * A revision snapshots title, subtitle, summary and body HTML (not SEO fields
 * or the cover), so those four are what a restore can bring back. The body is
 * converted back to the editor's Markdown; that direction is lossless for
 * everything the editor can produce (see `editorial-markdown.test.ts`).
 *
 * Restoring only fills the form. Nothing is written until the editor presses
 * Enregistrer, which goes through the ordinary `editorial_update_article`
 * path -- and that update itself snapshots the text it replaces as a new
 * revision, so a restore can always be undone the same way. No second
 * versioning system is involved.
 */
export function revisionToEditorFields(revision: EditorialRevisionDto): EditorProseFields {
  return {
    title: revision.title,
    subtitle: revision.subtitle ?? "",
    summary: revision.summary,
    bodyMarkdown: editorialHtmlToMarkdown(revision.bodyHtml),
  };
}

/** Which prose fields a revision would change in the current form, in form order. */
export function revisionDifferences(
  revision: EditorialRevisionDto,
  current: EditorProseFields,
): readonly ProseField[] {
  const restored = revisionToEditorFields(revision);
  const order: readonly ProseField[] = ["title", "subtitle", "summary", "bodyMarkdown"];
  return order.filter((field) => restored[field].trim() !== current[field].trim());
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * `?storyId=<uuid>&language=fr|ar` opens the form as the other-language
 * edition of an existing story. `editorial_create_draft` has always taken a
 * story id, and a story holds at most one edition per language, but this form
 * never sent one: every Arabic version was created as a separate, unrelated
 * story, so a French and an Arabic edition could never be paired. Both values
 * must be valid or neither is used.
 */
export function parseTranslationSearch(search: Record<string, unknown>): {
  storyId?: string;
  language?: NewsLanguage;
} {
  const storyId = typeof search.storyId === "string" ? search.storyId : "";
  const language = search.language;
  if (!UUID_PATTERN.test(storyId) || (language !== "fr" && language !== "ar")) return {};
  return { storyId, language };
}

/**
 * A scheduled time as the editor should read it: in their own time zone, with
 * the zone named, and the UTC instant the server actually stores beside it.
 * `timeZone` is only passed by tests; the browser's own zone is the default.
 */
export function describeScheduledAt(
  iso: string,
  lang: NewsLanguage,
  timeZone?: string,
): { readonly local: string; readonly utc: string } {
  const instant = new Date(iso);
  const locale = lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR";
  const local = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(instant);
  const zone =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
      .formatToParts(instant)
      .find((part) => part.type === "timeZoneName")?.value ?? "";
  const utc = `${instant.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  return { local: zone ? `${local} (${zone})` : local, utc };
}

export type ScheduleHealthProblem = "job_inactive" | "job_stalled" | "run_failed" | "overdue";

/**
 * Whether the CMS should warn that scheduled articles may not be going out.
 * The job runs every minute; five silent minutes, an inactive job, a failed
 * run within the last day, or any edition overdue by five minutes all warn.
 */
export function scheduleHealthProblem(
  health: {
    readonly jobActive: boolean;
    readonly lastRunAt: string | null;
    readonly overdueCount: number;
    readonly lastFailure: { readonly at: string } | null;
  },
  now: number = Date.now(),
): ScheduleHealthProblem | null {
  if (!health.jobActive) return "job_inactive";
  if (!health.lastRunAt || now - Date.parse(health.lastRunAt) > 5 * 60_000) return "job_stalled";
  if (health.overdueCount > 0) return "overdue";
  if (health.lastFailure && now - Date.parse(health.lastFailure.at) < 24 * 60 * 60_000) {
    return "run_failed";
  }
  return null;
}
