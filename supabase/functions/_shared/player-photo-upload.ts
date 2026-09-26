// Pépites: the one way a player photo and its signed release reach storage
// (docs/engineering/PEPITES_ARCHITECTURE.md §3.3).
//
// Both buckets are private and have no browser write policy
// (20260926070000_player_photo_releases.sql), so the bytes move only through
// this function's service-role client, as the News media do
// (news-media-upload.ts). Authorization is never decided here: the paths come
// from api.admin_player_photo_upload_paths and the release is recorded by
// api.admin_player_photo_submit, both called AS THE CALLER (their own JWT),
// so the database's permission (`football.correct`) and step-up checks are the
// only gate. The paths are asked for before any byte is stored, so a caller
// who could never submit a release cannot spend storage.
//
// Nothing is published by this: a release starts `pending`, staff approve it
// (the database checks the rights again), and the photo job makes the public
// derivative.

export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

type PhotoMime = "image/jpeg" | "image/png" | "image/webp";
type DocumentMime = "application/pdf" | "image/jpeg" | "image/png";

const PHOTO_EXTENSION: Record<PhotoMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const DOCUMENT_EXTENSION: Record<DocumentMime, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export interface StorageClient {
  from(bucket: string): {
    upload(
      path: string,
      body: ArrayBuffer,
      options: { contentType: string; upsert: boolean },
    ): Promise<{ error: { readonly message?: string } | null }>;
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

export interface PlayerPhotoUploadDependencies {
  readonly serviceClient: StorageClient;
  readonly createUserClient: (accessToken: string) => UserScopedClient;
}

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

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

const ASCII = (text: string) => [...text].map((char) => char.charCodeAt(0));

/** What the bytes are, from their signature; the declared type is not trusted. */
export function sniffUploadType(bytes: Uint8Array): PhotoMime | "application/pdf" | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, ASCII("RIFF")) && startsWith(bytes, ASCII("WEBP"), 8)) return "image/webp";
  if (startsWith(bytes, ASCII("%PDF-"))) return "application/pdf";
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function field(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function problemStatus(code: string | undefined): number {
  if (code === "42501" || code === "PT403") return 403;
  if (code === "PT404") return 404;
  if (code === "22023" || code === "23514" || code === "22007" || code === "22008") return 422;
  return 400;
}

export async function handlePlayerPhotoUploadRequest(
  request: Request,
  deps: PlayerPhotoUploadDependencies,
): Promise<Response> {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const token = bearerToken(request);
  if (!token) return jsonResponse({ error: "unauthorized" }, 401);
  const userClient = deps.createUserClient(token);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user ?? null;
  if (userError || !user || user.role === "anon")
    return jsonResponse({ error: "unauthorized" }, 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse({ error: "invalid_multipart_body" }, 400);
  }
  const playerId = field(form, "playerId");
  const photo = form.get("photo");
  const document = form.get("document");
  if (!playerId || !UUID.test(playerId)) return jsonResponse({ error: "invalid_player" }, 400);
  if (!(photo instanceof Blob) || !(document instanceof Blob)) {
    return jsonResponse({ error: "missing_file" }, 400);
  }
  if (photo.size <= 0 || photo.size > MAX_PHOTO_BYTES) {
    return jsonResponse({ error: "photo_too_large" }, 413);
  }
  if (document.size <= 0 || document.size > MAX_DOCUMENT_BYTES) {
    return jsonResponse({ error: "document_too_large" }, 413);
  }
  const photoBytes = await photo.arrayBuffer();
  const documentBytes = await document.arrayBuffer();
  const photoType = sniffUploadType(new Uint8Array(photoBytes));
  const documentType = sniffUploadType(new Uint8Array(documentBytes));
  if (photoType === null || photoType === "application/pdf") {
    return jsonResponse({ error: "photo_type_invalid" }, 415);
  }
  if (documentType === null || documentType === "image/webp") {
    return jsonResponse({ error: "document_type_invalid" }, 415);
  }

  const release = {
    capturedOn: field(form, "capturedOn"),
    signedOn: field(form, "signedOn"),
    signerRole: field(form, "signerRole"),
    scope: field(form, "scope"),
    licenceCode: field(form, "licenceCode"),
    credit: field(form, "credit"),
    copyrightOwner: field(form, "copyrightOwner"),
    expiresOn: field(form, "expiresOn"),
  };
  for (const date of [release.capturedOn, release.signedOn, release.expiresOn]) {
    if (date !== null && !DATE.test(date)) return jsonResponse({ error: "date_invalid" }, 400);
  }

  // The caller's own permission and step-up decide; nothing is stored before.
  const paths = await userClient.schema("api").rpc("admin_player_photo_upload_paths", {
    p_player_id: playerId,
    p_photo_extension: PHOTO_EXTENSION[photoType],
    p_document_extension: DOCUMENT_EXTENSION[documentType],
  });
  if (paths.error) {
    const code = paths.error.code;
    return jsonResponse(
      { error: "not_allowed", code: code ?? null, message: paths.error.message ?? null },
      problemStatus(code),
    );
  }
  const { intakePath, documentPath } = (paths.data ?? {}) as {
    intakePath?: string;
    documentPath?: string;
  };
  if (!intakePath || !documentPath) return jsonResponse({ error: "paths_unavailable" }, 502);

  const intake = await deps.serviceClient
    .from("player-photo-intake")
    .upload(intakePath, photoBytes, { contentType: photoType, upsert: false });
  if (intake.error) return jsonResponse({ error: "upload_failed" }, 502);
  const signed = await deps.serviceClient
    .from("player-photo-releases")
    .upload(documentPath, documentBytes, { contentType: documentType, upsert: false });
  if (signed.error) {
    await deps.serviceClient.from("player-photo-intake").remove([intakePath]);
    return jsonResponse({ error: "upload_failed" }, 502);
  }

  const submitted = await userClient.schema("api").rpc("admin_player_photo_submit", {
    p_player_id: playerId,
    p_intake_path: intakePath,
    p_release: { ...release, documentPath },
  });
  if (submitted.error) {
    // A refused release leaves no file behind.
    await deps.serviceClient.from("player-photo-intake").remove([intakePath]);
    await deps.serviceClient.from("player-photo-releases").remove([documentPath]);
    const code = submitted.error.code;
    return jsonResponse(
      { error: "release_refused", code: code ?? null, message: submitted.error.message ?? null },
      problemStatus(code),
    );
  }
  const releaseId =
    submitted.data && typeof submitted.data === "object"
      ? ((submitted.data as Record<string, unknown>).releaseId ?? null)
      : null;
  return jsonResponse({ releaseId, status: "pending" }, 201);
}
