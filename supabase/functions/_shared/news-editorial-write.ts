// BG-0012 (Verifier follow-up): the only path through which body_html can
// ever reach persistence. api.editorial_create_draft/editorial_update_article
// now reject any call whose p_body_html_mac does not match a fresh
// HMAC-SHA256 of p_body_html, keyed by a secret only this function can ever
// obtain (api.editorial_write_secret_for_service is granted to service_role
// only -- a browser client can never present a service_role JWT). This
// function:
//   1. authenticates the caller from their own bearer token (never trusting
//      a client-claimed identity),
//   2. runs the real sanitize-html allowlist server-side over the raw
//      body_html the client sent (ignoring/discarding whatever the client
//      claims is already "clean"),
//   3. computes the MAC over the sanitized output,
//   4. calls the write RPC using the CALLER's OWN forwarded JWT (not the
//      service role) -- so has_editorial_role()'s MFA/AAL2/tier checks, RLS,
//      revision history, and the draft/update lifecycle guard all run
//      completely unchanged, exactly as before this fix.
// The sanitizer is injected (rather than imported here) so this file's
// request/auth/MAC logic can be unit tested under Bun without needing Deno's
// `npm:` module resolution; the real sanitize-html allowlist is wired in by
// news-editorial-sanitizer.ts (used by the deployed Edge Function) and by
// this file's own test suite (which imports the same npm package directly).

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, apikey, x-client-info",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

function errorResponse(status: number, message: string, code: string | null = null): Response {
  return jsonResponse({ error: { message, code } }, status);
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export interface RpcResult {
  readonly data: unknown;
  readonly error: {
    readonly message?: string;
    readonly code?: string;
    readonly details?: string;
  } | null;
}

export interface UserScopedClient {
  auth: {
    getUser(): Promise<{
      data: { user: { id: string; role?: string | null } | null };
      error: unknown;
    }>;
  };
  schema(name: "api"): {
    rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
  };
}

export interface ServiceRoleClient {
  schema(name: "api"): {
    rpc(name: string, args?: Record<string, unknown>): Promise<RpcResult>;
  };
}

export interface NewsEditorialWriteDependencies {
  readonly createUserClient: (accessToken: string) => UserScopedClient;
  readonly serviceClient: ServiceRoleClient;
  readonly sanitize: (html: string) => string;
  readonly sanitizerVersion: string;
}

// Postgres's default `bytea_output` is `hex`, so PostgREST/postgrest-js
// returns a `bytea` RPC result as a JSON string like `"\\x48656c6c6f"`.
function hexBytesToUint8Array(value: string): Uint8Array {
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** HMAC-SHA256 over `content`, hex-encoded -- matches Postgres's `encode(hmac(...), 'hex')`. */
export async function computeHmacHex(secret: Uint8Array, content: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(content));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

interface CreateDraftBody {
  readonly action: "create_draft";
  readonly language: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly bodyFormat: "markdown" | "rich_text";
  readonly bodySource: string | null;
  readonly bodyHtml: string;
  readonly storyId?: string | null;
  readonly authorId?: string | null;
  readonly publisherId?: string | null;
}

interface UpdateArticleBody {
  readonly action: "update_article";
  readonly articleEditionId: string;
  readonly expectedUpdatedAt: string;
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly summary: string;
  readonly bodyFormat: "markdown" | "rich_text";
  readonly bodySource: string | null;
  readonly bodyHtml: string;
  readonly heroAssetId?: string | null;
  readonly seoTitle?: string | null;
  readonly seoDescription?: string | null;
}

type RequestBody = CreateDraftBody | UpdateArticleBody;

function calculateReadingTimeFromPlainText(html: string): number {
  const text = html.replace(/<[^>]*>/g, " ");
  const wordCount = text.trim().split(/\s+/u).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 220));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function mapRpcErrorToStatus(code: string | undefined): number {
  switch (code) {
    case "42501":
      return 403;
    case "P0002":
      return 404;
    case "40001":
      return 409;
    case "22023":
      return 422;
    case "23505":
      return 409;
    default:
      return 400;
  }
}

export async function handleNewsEditorialWriteRequest(
  request: Request,
  deps: NewsEditorialWriteDependencies,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return errorResponse(405, "method_not_allowed");
  }

  const token = bearerToken(request);
  if (!token) {
    return errorResponse(401, "unauthorized");
  }

  const userClient = deps.createUserClient(token);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user ?? null;
  if (userError || !user || user.role === "anon") {
    return errorResponse(401, "unauthorized");
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return errorResponse(400, "invalid_json_body");
  }

  if (!isNonEmptyString(body.bodyHtml)) {
    return errorResponse(400, "missing_body_html");
  }

  let sanitizedBodyHtml: string;
  try {
    sanitizedBodyHtml = deps.sanitize(body.bodyHtml);
  } catch {
    return errorResponse(422, "unsafe_content", "22023");
  }

  const secretResult = await deps.serviceClient
    .schema("api")
    .rpc("editorial_write_secret_for_service");
  if (secretResult.error || typeof secretResult.data !== "string") {
    return errorResponse(500, "editorial_write_secret_unavailable");
  }
  const secret = hexBytesToUint8Array(secretResult.data);
  const mac = await computeHmacHex(secret, sanitizedBodyHtml);

  if (body.action === "create_draft") {
    const result = await userClient.schema("api").rpc("editorial_create_draft", {
      p_language: body.language,
      p_slug: body.slug,
      p_title: body.title,
      p_summary: body.summary,
      p_body_format: body.bodyFormat,
      p_body_source: body.bodySource,
      p_body_html: sanitizedBodyHtml,
      p_reading_time_minutes: calculateReadingTimeFromPlainText(sanitizedBodyHtml),
      p_sanitizer_version: deps.sanitizerVersion,
      p_body_html_mac: mac,
      p_story_id: body.storyId ?? undefined,
      p_author_id: body.authorId ?? undefined,
      p_publisher_id: body.publisherId ?? undefined,
    });
    if (result.error) {
      return errorResponse(
        mapRpcErrorToStatus(result.error.code),
        result.error.message ?? "editorial_write_failed",
        result.error.code ?? null,
      );
    }
    return jsonResponse(result.data, 201);
  }

  if (body.action === "update_article") {
    const result = await userClient.schema("api").rpc("editorial_update_article", {
      p_article_edition_id: body.articleEditionId,
      p_expected_updated_at: body.expectedUpdatedAt,
      p_slug: body.slug,
      p_title: body.title,
      p_subtitle: body.subtitle,
      p_summary: body.summary,
      p_body_format: body.bodyFormat,
      p_body_source: body.bodySource,
      p_body_html: sanitizedBodyHtml,
      p_reading_time_minutes: calculateReadingTimeFromPlainText(sanitizedBodyHtml),
      p_sanitizer_version: deps.sanitizerVersion,
      p_body_html_mac: mac,
      p_hero_asset_id: body.heroAssetId ?? undefined,
      p_seo_title: body.seoTitle ?? undefined,
      p_seo_description: body.seoDescription ?? undefined,
    });
    if (result.error) {
      return errorResponse(
        mapRpcErrorToStatus(result.error.code),
        result.error.message ?? "editorial_write_failed",
        result.error.code ?? null,
      );
    }
    return jsonResponse(result.data, 200);
  }

  return errorResponse(400, "unknown_action");
}
