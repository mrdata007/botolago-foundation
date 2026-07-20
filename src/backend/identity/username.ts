export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,19}$/;

export const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "api",
  "auth",
  "botolago",
  "help",
  "moderator",
  "official",
  "root",
  "security",
  "staff",
  "support",
  "system",
]);

export function normalizeCanonicalUsername(value: string): string {
  return value.trim().toLowerCase();
}

export type UsernameValidationReason = "invalid" | "reserved" | null;

export function validateCanonicalUsername(value: string): UsernameValidationReason {
  const normalized = normalizeCanonicalUsername(value);
  if (!USERNAME_PATTERN.test(normalized)) return "invalid";
  if (RESERVED_USERNAMES.has(normalized)) return "reserved";
  return null;
}
