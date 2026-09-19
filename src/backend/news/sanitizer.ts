import sanitizeHtml from "sanitize-html";
import {
  NEWS_SANITIZER_MIN_LENGTH,
  NEWS_SANITIZER_OPTIONS,
  NEWS_SANITIZER_VERSION,
} from "./sanitizer-policy";
import { NewsError } from "./errors";

export { NEWS_SANITIZER_VERSION };

// NOTE: this client-side pass is UX only (immediate preview, early feedback
// on obviously-invalid input) -- it is NOT the security boundary. A
// compromised, modified, or direct API client could skip this entirely, so
// the actual trust boundary is the server-side sanitizer that the
// news-editorial-write Edge Function runs, using the exact same
// NEWS_SANITIZER_OPTIONS policy imported above (see
// supabase/functions/_shared/news-editorial-sanitizer.ts and
// app_private.verify_editorial_content_mac). api.editorial_create_draft /
// api.editorial_update_article now reject any p_body_html that wasn't
// produced by that trusted server-side pass.
export function sanitizeEditorialHtml(input: string): string {
  const clean = sanitizeHtml(input, NEWS_SANITIZER_OPTIONS).trim();

  if (clean.length < NEWS_SANITIZER_MIN_LENGTH)
    throw new NewsError("unsafe_content", "The sanitized article body is empty or too short.");
  return clean;
}

export function calculateReadingTime(html: string): number {
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
  const wordCount = text.trim().split(/\s+/u).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 220));
}
