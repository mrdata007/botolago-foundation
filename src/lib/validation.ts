// Localized-key-returning validators. UI does t(errorKey) to display.
import type { TranslationKey } from "@/i18n/dictionaries";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Mirrors app_private.normalize_username/check constraints. The server remains authoritative.
const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{2,19}$/i;

export function validateEmail(v: string): TranslationKey | null {
  const s = v.trim();
  if (!s) return "auth.error.email_required";
  if (!EMAIL_RE.test(s)) return "auth.error.email_invalid";
  return null;
}

export function validatePassword(v: string): TranslationKey | null {
  if (!v) return "auth.error.password_required";
  if (v.length < 8) return "auth.error.password_short";
  return null;
}

export function validateName(v: string): TranslationKey | null {
  return v.trim().length >= 2 ? null : "auth.error.name_required";
}

export function validateUsername(v: string): TranslationKey | null {
  const s = v.trim();
  if (!s) return "auth.error.username_required";
  if (!USERNAME_RE.test(s)) return "auth.error.username_invalid";
  return null;
}

export function normalizeUsername(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, "_");
}

export function passwordStrength(v: string): 0 | 1 | 2 | 3 {
  if (!v) return 0;
  let score = 0;
  if (v.length >= 8) score++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
  if (/\d/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v) && v.length >= 10) score++;
  return Math.min(score, 3) as 0 | 1 | 2 | 3;
}
