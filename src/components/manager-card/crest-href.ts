/**
 * The one test of a club crest's address before a card draws it (`<image href>` in the card's SVG,
 * a canvas `Image` in the share picture). The card is inserted as HTML, so this is where a hostile
 * address stops: only an `https:` URL, a local development `http:` URL (Supabase's local stack) or
 * a raster `data:image`, with no character that could leave an attribute or a `url()`.
 */
const SAFE_CHARS = /^[^\s"'<>()\\`]+$/;
const DATA_IMAGE = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The crest's address as a card may draw it, or null. */
export function crestHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // a crest as a data URL is a few kilobytes; a much longer one is not drawn
  if (value.startsWith("data:"))
    return value.length <= 200_000 && DATA_IMAGE.test(value) ? value : null;
  if (value.length > 2048 || !SAFE_CHARS.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (url.protocol === "https:") return value;
    if (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname)) return value;
    return null;
  } catch {
    return null;
  }
}
