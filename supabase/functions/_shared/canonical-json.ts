// Deterministic JSON and sha256, shared by the Edge runtime and src/backend
// (src/backend/football/identity/bulk-mapping/canonical.ts re-exports it).
// Dependency free, so it runs under Bun (tests) and Deno (the Edge Function).

/** Deterministic JSON: object keys sorted, no whitespace. The same value always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(text: string): Promise<string> {
  return hex(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}
