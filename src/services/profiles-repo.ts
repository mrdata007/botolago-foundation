// Avatar storage helpers shared by the production auth adapter.
// Profile and preference access lives behind src/backend/identity repositories.

import { supabase } from "@/integrations/supabase/client";

// --------------------- Avatar storage --------------------------------------

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export function extForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob | null> {
  try {
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    return null;
  }
}

/**
 * `refused`: Storage turned the upload down on its policies -- what an
 * account with a second factor meets while its session still owes the code
 * (20260926003100), and also what an expired token meets. The caller asks the
 * session which it was.
 */
export type AvatarUploadError = "too_large" | "bad_type" | "upload_failed" | "refused";

/**
 * Storage's answer when a bucket policy rejects a request: 403, sent either as
 * the HTTP status or as the body's `statusCode` (with HTTP 400), or failing
 * both, its row-level security message.
 */
export function isStorageRefusal(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const { status, statusCode, message } = error as {
    status?: unknown;
    statusCode?: unknown;
    message?: unknown;
  };
  if (status === 403 || statusCode === 403 || statusCode === "403") return true;
  return typeof message === "string" && /row-level security/i.test(message);
}

export async function uploadAvatarFromDataUrl(
  userId: string,
  dataUrl: string,
): Promise<{ ok: true; path: string } | { ok: false; error: AvatarUploadError }> {
  const blob = await dataUrlToBlob(dataUrl);
  if (!blob) return { ok: false, error: "upload_failed" };
  if (!ALLOWED_MIME.has(blob.type)) return { ok: false, error: "bad_type" };
  if (blob.size > MAX_AVATAR_BYTES) return { ok: false, error: "too_large" };
  const ext = extForMime(blob.type);
  const path = `${userId}/avatar.${ext}`;
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, {
    upsert: true,
    contentType: blob.type,
    cacheControl: "3600",
  });
  if (error) return { ok: false, error: isStorageRefusal(error) ? "refused" : "upload_failed" };
  return { ok: true, path };
}

export async function deleteAvatar(path: string): Promise<void> {
  try {
    await supabase.storage.from(AVATAR_BUCKET).remove([path]);
  } catch {
    /* ignore */
  }
}

/**
 * A short-lived URL for the avatar at `path`, or `null` when Storage gives
 * none: no such object, a network failure, or a session its policy does not
 * serve (an account with a second factor whose code is still owed finds no
 * object). The picture is then simply not shown; nothing asks again until the
 * session is next resolved.
 */
export async function signedAvatarUrl(path: string, expiresIn = 60 * 60): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}
