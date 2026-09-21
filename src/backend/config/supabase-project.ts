// Guards against a server-side Supabase client being pointed at a different
// project than the one the application itself runs on.
//
// This is not hypothetical. The Admin route gate read a server-only
// `SUPABASE_URL` while the browser signed in against the build-time
// `VITE_SUPABASE_URL`; the two named different projects, so the signing key
// was absent from the JWKS and nobody could authenticate. That failure was at
// least loud once it was understood -- everyone was locked out.
//
// The server workers carry the worse version of the same risk. News ingestion
// and the notification worker hold a SERVICE ROLE key, which bypasses RLS. A
// mispointed worker does not fail; it writes real production content into the
// wrong database, and nothing surfaces until someone notices articles missing
// from the project they were supposed to land in.
//
// So: refuse to build a privileged client whose project disagrees with the
// application's, and say which is which. A worker that will not start is
// recoverable. A worker writing to the wrong database silently is not.
//
// The service URL and its key are a matched pair, so this deliberately does
// NOT substitute the application's URL: swapping one half would leave a key
// that cannot authenticate against it. Failing closed is the honest outcome
// until both halves are set correctly.

/** Extracts the project ref (the subdomain) from a Supabase URL. */
export function projectRefOf(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  try {
    const host = new URL(url.trim()).hostname;
    // Local development (127.0.0.1, localhost, a container name) has no ref;
    // treat it as unknown rather than guessing, so the guard stays quiet.
    if (!host.endsWith(".supabase.co") && !host.endsWith(".supabase.in")) return undefined;
    const [ref] = host.split(".");
    return ref || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The project this build of the application belongs to, taken from the same
 * build-time values the browser client uses.
 */
export function applicationProjectRef(): string | undefined {
  let configured: string | undefined;
  try {
    configured =
      import.meta.env.VITE_SUPABASE_PROJECT_ID || projectRefOf(import.meta.env.VITE_SUPABASE_URL);
  } catch {
    configured = undefined;
  }
  return configured || process.env.VITE_SUPABASE_PROJECT_ID || undefined;
}

export class SupabaseProjectMismatchError extends Error {
  constructor(
    readonly serverRef: string,
    readonly applicationRef: string,
  ) {
    super(
      `Server Supabase project "${serverRef}" does not match the application's project ` +
        `"${applicationRef}". Refusing to use privileged credentials against a different ` +
        `database. Set SUPABASE_URL (and its matching service key) to the application's project.`,
    );
    this.name = "SupabaseProjectMismatchError";
  }
}

/**
 * Throws when `serverUrl` names a different Supabase project than the
 * application's. Silent when either side is unknown -- a local stack, or a
 * build without the project configured, must not be blocked by a guard that
 * has nothing to compare.
 */
export function assertServerProjectMatchesApplication(serverUrl: string | undefined | null): void {
  const serverRef = projectRefOf(serverUrl);
  const appRef = applicationProjectRef();
  if (!serverRef || !appRef) return;
  if (serverRef !== appRef) throw new SupabaseProjectMismatchError(serverRef, appRef);
}
