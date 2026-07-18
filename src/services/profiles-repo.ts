// Typed repository for `profiles` and `user_preferences`.
// Uses the generated Supabase Database types for type safety.

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Language } from "@/types/domain";
import type { NotificationPreferences } from "./auth-types";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type PreferencesRow = Database["public"]["Tables"]["user_preferences"]["Row"];

export interface FullProfile {
  profile: ProfileRow;
  preferences: PreferencesRow | null;
}

/**
 * Load profile + preferences for a given user id, with bounded retry to wait
 * for the trigger-created row(s) on first sign-in.
 */
export async function loadFullProfile(userId: string, maxAttempts = 5): Promise<FullProfile | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const [pRes, prefRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_preferences").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    if (pRes.data) {
      return { profile: pRes.data, preferences: prefRes.data ?? null };
    }
    if (pRes.error && pRes.error.code !== "PGRST116") {
      // "PGRST116" = single row not found; anything else is a real error.
      // Do not loop indefinitely on real errors.
      return null;
    }
    await new Promise((r) => setTimeout(r, 200 + i * 100));
  }
  return null;
}

export interface UpdateProfileInput {
  displayName?: string;
  username?: string;
  favoriteClubId?: string | null;
  avatarPath?: string | null;
  preferredLanguage?: Language;
}

export interface UpdatePreferencesInput {
  matchAlerts?: boolean;
  breakingNews?: boolean;
  fantasyDeadlines?: boolean;
}

export type UpdateProfileError = "username_taken" | "generic";

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<{ ok: true; data: ProfileRow } | { ok: false; error: UpdateProfileError }> {
  const patch: Database["public"]["Tables"]["profiles"]["Update"] = {};
  if (input.displayName !== undefined) patch.display_name = input.displayName;
  if (input.username !== undefined) patch.username = input.username;
  if (input.favoriteClubId !== undefined) patch.favorite_club_id = input.favoriteClubId;
  if (input.avatarPath !== undefined) patch.avatar_url = input.avatarPath;
  if (input.preferredLanguage !== undefined) patch.preferred_language = input.preferredLanguage;

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
      return { ok: false, error: "username_taken" };
    }
    return { ok: false, error: "generic" };
  }
  if (!data) return { ok: false, error: "generic" };
  return { ok: true, data };
}

export async function updatePreferences(
  userId: string,
  input: UpdatePreferencesInput,
): Promise<PreferencesRow | null> {
  const patch: Database["public"]["Tables"]["user_preferences"]["Update"] = {};
  if (input.matchAlerts !== undefined) patch.match_alerts = input.matchAlerts;
  if (input.breakingNews !== undefined) patch.breaking_news = input.breakingNews;
  if (input.fantasyDeadlines !== undefined) patch.fantasy_deadline_reminders = input.fantasyDeadlines;

  // Upsert to be resilient if the trigger row is briefly missing.
  const { data, error } = await supabase
    .from("user_preferences")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" })
    .select("*")
    .maybeSingle();
  if (error) return null;
  return data;
}

export function preferencesToNotifications(row: PreferencesRow | null): NotificationPreferences {
  return {
    matchAlerts: row?.match_alerts ?? true,
    breakingNews: row?.breaking_news ?? true,
    fantasyDeadlines: row?.fantasy_deadline_reminders ?? true,
  };
}

export function coerceLanguage(raw: string | null | undefined): Language {
  return raw === "ar" ? "ar" : "fr";
}

// --------------------- Avatar storage --------------------------------------

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function extForMime(mime: string): string {
  switch (mime) {
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "image/gif": return "gif";
    default: return "jpg";
  }
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob | null> {
  try {
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch { return null; }
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
  try { await supabase.storage.from(AVATAR_BUCKET).remove([path]); } catch { /* ignore */ }
}

export async function signedAvatarUrl(path: string, expiresIn = 60 * 60): Promise<string | null> {
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}
