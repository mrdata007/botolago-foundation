import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  ArticleEditorialDetailDto,
  EditorialRevisionDto,
  NewsRepository,
  TransitionArticleInput,
  TransitionArticleResult,
} from "./contracts";

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
