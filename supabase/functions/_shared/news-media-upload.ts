// BG-0012: trusted server-side upload path for the News CMS.
//
// The `news-media` storage bucket intentionally has zero browser write
// policies (see supabase/migrations/20260720110113_news_storage_index_hardening.sql).
// Bytes only ever move through this Edge Function's service-role client.
// Authorization is never duplicated here: after the bytes are stored, the
// resulting metadata is registered by calling api.editorial_register_media
// AS THE CALLING USER (their own JWT, not the service role), so the exact
// same has_editorial_role('editor') gate that already protects every other
// editorial RPC also protects this path, with one source of truth.

export const ALLOWED_MEDIA_MIME_TYPES = [
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type AllowedMediaMimeType = (typeof ALLOWED_MEDIA_MIME_TYPES)[number];

export const MAX_MEDIA_UPLOAD_BYTES = 10 * 1024 * 1024;

const EXTENSION_BY_MIME: Record<AllowedMediaMimeType, string> = {
  "image/avif": "avif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface StorageUploadResult {
  readonly error: { readonly message?: string } | null;
}

export interface StorageClient {
  from(bucket: string): {
    upload(
      path: string,
      body: ArrayBuffer,
      options: { contentType: string; upsert: boolean },
    ): Promise<StorageUploadResult>;
    remove(paths: string[]): Promise<{ error: { readonly message?: string } | null }>;
  };
}

export interface RpcResult {
  readonly data: unknown;
  readonly error: { readonly message?: string; readonly code?: string } | null;
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

export interface NewsMediaUploadDependencies {
  readonly supabaseUrl: string;
  readonly serviceClient: StorageClient;
  readonly createUserClient: (accessToken: string) => UserScopedClient;
  readonly randomId?: () => string;
}

// The browser calls this function with a multipart body and an explicit
// Authorization header (a Bearer JWT, not a cookie), which always triggers a
// CORS preflight. Without a response to that OPTIONS request, every real
// browser call fails before it even reaches the POST handler below.
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

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function isAllowedMimeType(value: string): value is AllowedMediaMimeType {
  return (ALLOWED_MEDIA_MIME_TYPES as readonly string[]).includes(value);
}

function optionalField(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function handleNewsMediaUploadRequest(
  request: Request,
  deps: NewsMediaUploadDependencies,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const token = bearerToken(request);
  if (!token) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const userClient = deps.createUserClient(token);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user ?? null;
  if (userError || !user || user.role === "anon") {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse({ error: "invalid_multipart_body" }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return jsonResponse({ error: "missing_file" }, 400);
  }
  const declaredMimeType = "type" in file && file.type ? file.type : "";
  if (!isAllowedMimeType(declaredMimeType)) {
    return jsonResponse({ error: "unsupported_media_type" }, 415);
  }
  if (file.size <= 0 || file.size > MAX_MEDIA_UPLOAD_BYTES) {
    return jsonResponse({ error: "payload_too_large" }, 413);
  }

  const altText = optionalField(form, "altText");
  if (!altText) {
    return jsonResponse({ error: "missing_alt_text" }, 400);
  }
  const width = parsePositiveInt(optionalField(form, "width"));
  const height = parsePositiveInt(optionalField(form, "height"));
  if (!width || !height) {
    return jsonResponse({ error: "missing_dimensions" }, 400);
  }

  const id = (deps.randomId ?? (() => crypto.randomUUID()))();
  const storagePath = `news/${id}.${EXTENSION_BY_MIME[declaredMimeType]}`;
  const bytes = await file.arrayBuffer();

  const uploaded = await deps.serviceClient
    .from("news-media")
    .upload(storagePath, bytes, { contentType: declaredMimeType, upsert: false });
  if (uploaded.error) {
    return jsonResponse({ error: "upload_failed" }, 502);
  }

  const registration = await userClient.schema("api").rpc("editorial_register_media", {
    p_storage_path: storagePath,
    p_mime_type: declaredMimeType,
    p_width: width,
    p_height: height,
    p_alt_text: altText,
    p_caption: optionalField(form, "caption") ?? null,
    p_credit: optionalField(form, "credit") ?? null,
    p_copyright_owner: optionalField(form, "copyrightOwner") ?? null,
    p_license_url: optionalField(form, "licenseUrl") ?? null,
    p_attribution_url: optionalField(form, "attributionUrl") ?? null,
    p_kind: optionalField(form, "kind") ?? "article_hero",
  });

  if (registration.error) {
    // Never leave an orphaned object behind when registration is refused.
    await deps.serviceClient.from("news-media").remove([storagePath]);
    const code = registration.error.code ?? "unknown";
    const status = code === "42501" ? 403 : code === "22023" ? 422 : 400;
    return jsonResponse(
      { error: "registration_failed", code, message: registration.error.message ?? null },
      status,
    );
  }

  const mediaAssetId =
    registration.data && typeof registration.data === "object"
      ? ((registration.data as Record<string, unknown>).mediaAssetId ?? null)
      : null;

  return jsonResponse(
    {
      mediaAssetId,
      storagePath,
      publicUrl: `${deps.supabaseUrl}/storage/v1/object/public/news-media/${storagePath}`,
    },
    201,
  );
}
