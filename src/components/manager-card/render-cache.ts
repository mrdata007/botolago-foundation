/**
 * A small least-recently-used cache of rendered card markup (plan section 6.5), so a league table
 * that re-renders does not draw the same card again. 64 entries; the key is built by the caller
 * from the renderer, the profile, the language, the theme, the beat and the width bucket.
 */
const LIMIT = 64;
const entries = new Map<string, string>();

export function cachedRender(key: string, produce: () => string): string {
  const hit = entries.get(key);
  if (hit !== undefined) {
    // Re-insert to mark it as the most recently used.
    entries.delete(key);
    entries.set(key, hit);
    return hit;
  }
  const html = produce();
  entries.set(key, html);
  if (entries.size > LIMIT) entries.delete(entries.keys().next().value!);
  return html;
}

export function renderCacheSize(): number {
  return entries.size;
}

export function clearRenderCache(): void {
  entries.clear();
}

/** Widths are bucketed to 16 px, so a card at 240 and 241 shares one render. */
export function widthBucket(width: number): number {
  return Math.round(width / 16);
}
