// The trusted server-side sanitization pass. This is what
// api.editorial_create_draft/editorial_update_article actually require proof
// of (see app_private.verify_editorial_content_mac) -- the client-side pass
// in src/backend/news/sanitizer.ts is UX only and is never trusted.
//
// Uses the same allowlist as the client-side pass, from
// ./news-editorial-sanitizer-policy.ts -- a same-directory duplicate of
// src/backend/news/sanitizer-policy.ts kept here so this function's
// deployment bundle only needs same-directory relative imports. Keep both in
// sync; news-editorial-write.test.ts exercises the frontend's copy directly.
import sanitizeHtml from "npm:sanitize-html@2.17.5";
import {
  NEWS_SANITIZER_MIN_LENGTH,
  NEWS_SANITIZER_OPTIONS,
  NEWS_SANITIZER_VERSION,
} from "./news-editorial-sanitizer-policy.ts";

export { NEWS_SANITIZER_VERSION };

export class UnsafeContentError extends Error {
  constructor() {
    super("unsafe_content");
    this.name = "UnsafeContentError";
  }
}

export function sanitizeEditorialHtmlTrusted(input: string): string {
  const clean = sanitizeHtml(input, NEWS_SANITIZER_OPTIONS).trim();
  if (clean.length < NEWS_SANITIZER_MIN_LENGTH) throw new UnsafeContentError();
  return clean;
}
