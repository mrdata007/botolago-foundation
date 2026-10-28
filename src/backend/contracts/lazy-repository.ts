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
export function lazyRepository<T extends object>(
  load: () => Promise<T>,
  { eager = false }: { eager?: boolean } = {},
): T {
  let loading: Promise<T> | null = null;
  const implementation = () => {
    loading ??= load().catch((error: unknown) => {
      // A failed load (offline, a renamed file after a deploy) is tried again next call.
      loading = null;
      throw error;
    });
    return loading;
  };
  // `eager` starts the load at once, as the static import did, for a mode
  // that will use it. Loaded only on the first call instead, the sample
  // repository answered later than the screens around it expected: after a
  // sign-in, the match page kept the votes it had read before the visitor's
  // vote moved to the account (tests/e2e/pronostics.e2e.ts).
  if (eager) void implementation().catch(() => undefined);
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
