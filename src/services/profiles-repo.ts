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

export type AvatarUploadError = "too_large" | "bad_type" | "upload_failed";

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
  if (error) return { ok: false, error: "upload_failed" };
  return { ok: true, path };
}

export async function deleteAvatar(path: string): Promise<void> {
  try {
    await supabase.storage.from(AVATAR_BUCKET).remove([path]);
  } catch {
    /* ignore */
  }
}

export async function signedAvatarUrl(path: string, expiresIn = 60 * 60): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}
