import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/backend/generated/database.types";
import type { AdminPermission } from "./contracts";
import { AdminControlPlaneService } from "./control-plane-service";
import {
  requireAdminRoutePermission,
  resolveAdminRouteAccess,
  type UnauthenticatedDetail,
} from "./route-access";
import { SupabaseAdminControlPlaneRepository } from "./supabase-control-plane-repository";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

/**
 * Maps a Supabase auth failure onto a coarse, non-sensitive category.
 *
 * Reads only the error's name, message and status -- never the token, its
 * claims, or any account data.
 *
 * `unverifiable` is deliberately hard to reach. It is the one category that
 * accuses the server rather than the credential, so an operator seeing it will
 * go looking for an outage. Anything not positively recognised as a transport
 * failure is therefore `rejected`, including every unrecognised throw: a
 * malformed token reaches `JSON.parse` inside `decodeJWT`, and an unknown `alg`
 * reaches a bare `throw new Error("Invalid alg claim")`, both of which arrive
 * here as plain Errors that any anonymous caller can provoke at will.
 */
export function classifyIdentityFailure(error: unknown): UnauthenticatedDetail {
  const source = error as { name?: string; message?: string; status?: number } | null | undefined;
  const text = `${source?.name ?? ""} ${source?.message ?? ""}`.toLowerCase();
  // Matched before `expired`: a network stack can report a timeout as an
  // "expired" deadline, and that is an outage, not a stale credential.
  if (
    text.includes("failed to fetch") ||
    text.includes("fetch failed") ||
    text.includes("network") ||
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("jwks") ||
    text.includes("econnrefused") ||
    text.includes("enotfound") ||
    (typeof source?.status === "number" && source.status >= 500)
  ) {
    return "unverifiable";
  }
  if (text.includes("expired")) return "expired";
  return "rejected";
}

/**
 * Resolves the Supabase project this request's identity is verified against.
 *
 * It must be the same project that issued the session, or verification cannot
 * succeed for anybody: the signing key will not be in the JWKS, and the token
 * will be presented to an Auth server that has never heard of it. Reading a
 * server-only `SUPABASE_URL` while the browser signs in against the build-time
 * `VITE_SUPABASE_URL` leaves nothing tying the two together -- they are set in
 * different places, and `.env.example` ships the server one pointed at
 * localhost.
 *
 * So prefer the same build-time values the browser uses (see
 * `integrations/supabase/client.ts`, which resolves in this order), and keep
 * the server-only variables as the fallback for runtimes that inject them
 * instead. The publishable key is public by design and constrained by RLS --
 * it is already in the browser bundle -- so this exposes nothing new.
 */
function buildTimeEnv(key: "VITE_SUPABASE_URL" | "VITE_SUPABASE_PUBLISHABLE_KEY") {
  // Written as two literal member expressions because that is the shape the
  // bundler substitutes at build time. The try/catch covers any runtime where
  // neither the substitution nor an `import.meta.env` object exists: falling
  // back to the server variable is recoverable, whereas throwing here would
  // turn a denied page into a 500 on the authentication path.
  try {
    return key === "VITE_SUPABASE_URL"
      ? import.meta.env.VITE_SUPABASE_URL
      : import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  } catch {
    return undefined;
  }
}

export function resolveSupabaseConfig(): { url?: string; publishableKey?: string } {
  return {
    url: buildTimeEnv("VITE_SUPABASE_URL") || process.env.SUPABASE_URL,
    publishableKey:
      buildTimeEnv("VITE_SUPABASE_PUBLISHABLE_KEY") || process.env.SUPABASE_PUBLISHABLE_KEY,
  };
}

/**
 * One structured line per denied Admin request, so a recurrence is diagnosable
 * from server logs rather than from a reader relaying a code off a screen.
 *
 * Booleans and fixed vocabulary only. No token, no claim, no user id, no email
 * -- nothing that would turn the log into a secondary copy of the credential.
 */
function logAdminAccessDenial(fields: {
  authorizationHeaderPresent: boolean;
  bearerScheme: boolean;
  state: string;
  reason?: string;
  detail?: string;
}) {
  console.warn(JSON.stringify({ event: "admin_route_access_denied", ...fields }));
}

export async function loadAdminRouteAccessForRequest() {
  const request = getRequest();
  const authHeader = request.headers.get("authorization");
  const authorizationHeaderPresent = Boolean(authHeader);
  const bearerScheme = authHeader?.startsWith("Bearer ") ?? false;
  const token = bearerScheme ? authHeader!.slice(7) : null;
  const { url, publishableKey } = resolveSupabaseConfig();
  const trace = { authorizationHeaderPresent, bearerScheme };
  if (!url || !publishableKey) {
    logAdminAccessDenial({ ...trace, state: "backend_unavailable" });
    return { state: "backend_unavailable" as const };
  }
  if (!token) {
    logAdminAccessDenial({ ...trace, state: "unauthenticated", reason: "missing_token" });
    return { state: "unauthenticated" as const, reason: "missing_token" as const };
  }

  const client = createClient<Database>(url, publishableKey, {
    global: {
      fetch: createSupabaseFetch(publishableKey),
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const repository = new SupabaseAdminControlPlaneRepository(
    client.schema("api") as unknown as ConstructorParameters<
      typeof SupabaseAdminControlPlaneRepository
    >[0],
  );
  const service = new AdminControlPlaneService(repository);

  // Classifies the most recent verification failure so a rejected token is
  // distinguishable from an absent one without another round of probing.
  // Derived only from the error's type and message, never from token contents.
  let identityFailure: UnauthenticatedDetail | undefined;

  const state = await resolveAdminRouteAccess({
    describeIdentityFailure: () => identityFailure,
    verifyIdentity: async () => {
      identityFailure = undefined;
      let result: Awaited<ReturnType<typeof client.auth.getClaims>>;
      try {
        result = await client.auth.getClaims(token);
      } catch (thrown) {
        // getClaims only converts its own AuthErrors into `{ error }`; it
        // rethrows everything else. Classify here, where the error's shape is
        // known, so an unrecognised throw cannot be mistaken for an outage.
        identityFailure = classifyIdentityFailure(thrown);
        return null;
      }
      const { data, error } = result;
      const claims = data?.claims;
      const userId = claims?.sub;
      if (error || typeof userId !== "string") {
        identityFailure = classifyIdentityFailure(error);
        return null;
      }
      return {
        userId,
        email: typeof claims?.email === "string" ? claims.email : null,
      };
    },
    loadContext: (userId) =>
      service.getCurrentStaffContext({
        actorId: userId,
        requestId: crypto.randomUUID(),
      }),
  });

  if (state.state !== "authorized") {
    logAdminAccessDenial({
      ...trace,
      state: state.state,
      ...(state.state === "unauthenticated" ? { reason: state.reason, detail: state.detail } : {}),
    });
  }
  return state;
}

export async function loadAdminRouteAccessForPermission(permission: AdminPermission) {
  const state = await loadAdminRouteAccessForRequest();
  return requireAdminRoutePermission(state, permission);
}
