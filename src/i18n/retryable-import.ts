/**
 * A dynamic `import()` that can be tried again after it fails.
 *
 * The Arabic dictionary is a chunk of its own (provider.tsx), so a reader who
 * chooses Arabic on a weak connection can see that one request fail. Trying
 * again is only honest if it really goes back to the network, and two caches
 * stand in the way:
 *
 *   - our own memo. Concurrent callers share one in-flight import, but a
 *     rejected one must be forgotten, or every later "retry" is handed the
 *     same rejection without a request being made.
 *   - the browser's module map. Until whatwg/html#10327 the HTML spec had a
 *     failed module fetch cached for the life of the page, so `import()` of
 *     the same URL rejects at once without a request, and browsers released
 *     before that change still do. The cache is keyed on the URL, so a retry
 *     that still fails asks for the same chunk under a URL of its own
 *     (`?retry=<n>`). A dictionary is plain data: a second copy of the module
 *     is harmless.
 *
 * The chunk's URL is not in the source (the bundler names it), so it is
 * recovered from what the failure left behind: Chromium and Firefox name it in
 * the error message, and the importer's own source text holds the specifier
 * the bundler wrote into it, which resolves against the importing module's
 * URL. When neither yields one, the retry is the plain import again, which is
 * still right in every browser that no longer caches failures.
 */
export interface RetryableImport<M> {
  /** The module once it has arrived; `null` before that. */
  current(): M | null;
  /** The module, importing it (again) if it is not here yet. */
  load(): Promise<M>;
}

export interface RetryableImportOptions<M> {
  /**
   * The URL relative specifiers in the importer's source resolve against:
   * `import.meta.url` of the module the importer is written in.
   */
  base?: string;
  /** Imports a URL the bundler does not see. Replaced in the tests. */
  reimport?: (url: string) => Promise<M>;
}

const NAMED_URL =
  /\b((?:https?|file):\/\/[^\s'"`)]+?\.(?:m?js|tsx?))(?:[?#][^\s'"`)]*)?(?=[\s'"`)]|$)/;
const WRITTEN_SPECIFIER = /\bimport\(\s*(["'`])([^"'`]+)\1\s*\)/;

/** The URL a failed import asked for, when it can be recovered; else null. */
export function failedModuleUrl(
  error: unknown,
  importer: () => unknown,
  base: string | undefined,
): string | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const named = NAMED_URL.exec(message);
  if (named) return named[1];
  const written = WRITTEN_SPECIFIER.exec(Function.prototype.toString.call(importer));
  if (!written || !base) return null;
  try {
    return new URL(written[2], base).href;
  } catch {
    // A bare specifier ("some-package") has no URL of its own to ask for.
    return null;
  }
}

/** `url` under a query of its own, so the browser fetches it afresh. */
export function withRetryQuery(url: string, attempt: number): string {
  const fresh = new URL(url);
  fresh.searchParams.set("retry", String(attempt));
  return fresh.href;
}

export function retryableImport<M>(
  importer: () => Promise<M>,
  {
    base,
    reimport = (url) => import(/* @vite-ignore */ url) as Promise<M>,
  }: RetryableImportOptions<M> = {},
): RetryableImport<M> {
  let module: M | null = null;
  let inFlight: Promise<M> | null = null;
  let failures = 0;

  const attempt = (): Promise<M> => {
    if (failures === 0) return importer();
    // Plain first: a browser that no longer caches failures fetches again,
    // and the chunk keeps its one URL. Only when that fails too is the chunk
    // asked for under a URL of its own.
    return importer().catch((error: unknown) => {
      const url = failedModuleUrl(error, importer, base);
      if (!url) throw error;
      return reimport(withRetryQuery(url, failures));
    });
  };

  return {
    current: () => module,
    load() {
      if (module !== null) return Promise.resolve(module);
      inFlight ??= attempt().then(
        (loaded) => {
          module = loaded;
          return loaded;
        },
        (error: unknown) => {
          failures += 1;
          inFlight = null;
          throw error;
        },
      );
      return inFlight;
    },
  };
}
