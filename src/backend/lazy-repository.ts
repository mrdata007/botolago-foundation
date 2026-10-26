/**
 * A repository whose implementation is fetched on first use.
 *
 * Used for the development sample-data repositories: production never selects
 * them (`select*DataMode` refuses anything but Supabase), so their code and the
 * sample data under `src/mocks` must not sit in the first-view JavaScript. Every
 * method of a repository returns a promise, so waiting for the implementation
 * to load first changes nothing for the caller.
 */
export function lazyRepository<T extends object>(load: () => Promise<T>): T {
  let loaded: Promise<T> | null = null;
  const implementation = () => (loaded ??= load());
  return new Proxy({} as T, {
    get(_target, property) {
      // Not thenable: `await repository` must not wait for a `then` method.
      if (property === "then" || typeof property === "symbol") return undefined;
      return async (...args: unknown[]) => {
        const target = (await implementation()) as Record<string | symbol, unknown>;
        const method = target[property] as (...a: unknown[]) => unknown;
        return method.apply(target, args);
      };
    },
  });
}
