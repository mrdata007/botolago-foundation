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

/**
 * A UUID derived from a seed (the same seed always gives the same UUID). Used for
 * idempotency keys, so pressing a button twice, or resuming after a closed
 * browser, replays the same database operation instead of starting a second one.
 */
export async function deterministicUuid(seed: string): Promise<string> {
  const h = await sha256Hex(seed);
  const variant = ((Number.parseInt(h.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
