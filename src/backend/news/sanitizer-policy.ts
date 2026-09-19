// The single source of truth for the editorial HTML allowlist used by
// sanitize-html@2.17.5. This module has zero imports so it can be shared,
// unmodified, by both:
//   - sanitizer.ts, the client-side pre-sanitization pass (UX only), and
//   - supabase/functions/_shared/news-editorial-sanitizer.ts, the actual
//     trusted server-side sanitization pass that
//     api.editorial_create_draft/editorial_update_article now require proof
//     of (see app_private.verify_editorial_content_mac).
// Both entry points import the real `sanitize-html` npm package themselves
// (via a bare specifier on the frontend, via a Deno `npm:` specifier in the
// Edge Function) and apply these exact options -- only the policy itself is
// shared here.

export const NEWS_SANITIZER_VERSION = "sanitize-html@2.17.5";
export const NEWS_SANITIZER_MIN_LENGTH = 20;

export const NEWS_SANITIZER_ALLOWED_TAGS = [
  "p",
  "br",
  "h2",
  "h3",
  "h4",
  "strong",
  "em",
  "b",
  "i",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "figure",
  "figcaption",
  "img",
  "hr",
] as const;

export const NEWS_SANITIZER_OPTIONS = {
  allowedTags: [...NEWS_SANITIZER_ALLOWED_TAGS],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading"],
  },
  allowedSchemes: ["https"],
  allowedSchemesByTag: { a: ["https", "mailto"], img: ["https"] },
  allowProtocolRelative: false,
  disallowedTagsMode: "discard" as const,
  enforceHtmlBoundary: true,
  transformTags: {
    a: (_tagName: string, attribs: Record<string, string>) => ({
      tagName: "a",
      attribs: {
        ...attribs,
        rel: "nofollow noopener noreferrer",
        ...(attribs.target === "_blank" ? { target: "_blank" } : {}),
      },
    }),
    img: (_tagName: string, attribs: Record<string, string>) => ({
      tagName: "img",
      attribs: { ...attribs, loading: "lazy" },
    }),
  },
};
