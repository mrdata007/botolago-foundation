export function safeAuthRedirect(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return undefined;
  try {
    const base = new URL("https://botolago.invalid");
    const target = new URL(raw, base);
    if (target.origin !== base.origin) return undefined;
    if (target.pathname === "/auth/login" || target.pathname === "/auth/callback") {
      return undefined;
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return undefined;
  }
}
