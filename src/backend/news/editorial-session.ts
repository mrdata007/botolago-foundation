import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  ArticleEditorialDetailDto,
  EditorialRevisionDto,
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
