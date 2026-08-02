export function sanitizeAuthCallbackNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export function cleanAuthCallbackUrl(rawUrl: string): string {
  const clean = new URL(rawUrl);
  clean.search = "";
  clean.hash = "";
  return clean.toString();
}
