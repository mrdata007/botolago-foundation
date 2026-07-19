/** Opaque database identifier at repository boundaries. */
export type EntityId = string;

/** Context supplied to every backend repository operation. */
export interface RepositoryContext {
  readonly actorId: EntityId | null;
  readonly requestId: string;
  readonly signal?: AbortSignal;
}

/** Cursor pagination is the default for feeds and other growing collections. */
export interface CursorPageRequest {
  readonly cursor?: string | null;
  readonly limit?: number;
}

export interface CursorPage<TEntity> {
  readonly items: readonly TEntity[];
  readonly nextCursor: string | null;
}

/**
 * Minimal read contract shared by future domain repositories.
 *
 * Domain-specific repositories should extend this interface instead of
 * exposing Supabase queries to route components.
 */
export interface ReadRepository<TEntity, TFilter = Record<string, never>> {
  getById(id: EntityId, context: RepositoryContext): Promise<TEntity | null>;

  list(
    filter: TFilter,
    page: CursorPageRequest,
    context: RepositoryContext,
  ): Promise<CursorPage<TEntity>>;
}
