/**
 * Club crests and player photos are copies in our own storage, and many clubs
 * and players have none yet (the weekly catalog job fills them a few at a
 * time). So "no usable image" is the ordinary case, and the placeholder (the
 * club-colour monogram, the player silhouette) must show for it, and for an
 * image that fails to load, never an empty box or a broken-image icon.
 *
 * Pure, so the rule is tested on its own and the three components that draw an
 * image (`ClubCrest`, `PlayerPhoto`, `MediaImage`) share one definition.
 */

/**
 * The URL to load, or `undefined` when there is nothing to load: null,
 * undefined, blank, or the literal text a bad serialisation leaves behind
 * ("null", "undefined").
 */
export function usableImageUrl(src: string | null | undefined): string | undefined {
  if (typeof src !== "string") return undefined;
  const trimmed = src.trim();
  if (trimmed === "") return undefined;
  const lowered = trimmed.toLowerCase();
  return lowered === "null" || lowered === "undefined" ? undefined : trimmed;
}

/**
 * True when the placeholder must be drawn: no usable URL, or the URL that was
 * given is the one that failed. `failedSrc` is tracked as the failed URL, not a
 * boolean, so a new URL after a failure gets its own attempt.
 */
export function showImagePlaceholder(
  src: string | null | undefined,
  failedSrc: string | undefined,
): boolean {
  const usable = usableImageUrl(src);
  return usable === undefined || failedSrc === usable;
}
