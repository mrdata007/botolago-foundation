/**
 * A repository whose implementation is loaded on its first call (FE-C3).
 *
 * The mock repositories carry the sample players, clubs and articles used in
 * development and tests. Imported directly, that sample data shipped in every
 * production build and downloaded on the home page, although production never
 * uses it. Behind this, the implementation is a dynamic import that runs only
 * when a method is first called, and a build whose data mode is fixed to
 * `supabase` can drop the import altogether (see `src/services/football.ts`).
 *
 * Every method of the repositories wrapped here returns a promise, so callers
 * see no difference: each call waits for the implementation, then runs on it.
 */
export function lazyRepository<T extends object>(load: () => Promise<T>): T {
  let loading: Promise<T> | null = null;
  const implementation = () => {
    loading ??= load().catch((error: unknown) => {
      // A failed load (offline, a renamed file after a deploy) is tried again next call.
      loading = null;
      throw error;
    });
    return loading;
  };
  return new Proxy({} as T, {
    get(_target, property) {
      // Not a thenable: `await repository` must give the repository back, not hang.
      if (property === "then" || typeof property === "symbol") return undefined;
      return async (...args: unknown[]) => {
        const repository = await implementation();
        const method = (repository as Record<string, unknown>)[property];
        return (method as (...callArgs: unknown[]) => unknown).apply(repository, args);
      };
    },
  });
}
