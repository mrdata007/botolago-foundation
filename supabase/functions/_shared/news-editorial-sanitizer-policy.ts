// Mirrors src/backend/news/sanitizer-policy.ts exactly. Duplicated here
// (rather than imported across the supabase/functions <-> src boundary) so
// this Edge Function's deployment bundle only ever needs same-directory
// relative imports. If the two ever need to diverge, update both together --
// see news-editorial-write.test.ts, which exercises the frontend's copy
// directly to prove the real sanitize-html allowlist behavior this Edge
// Function's copy must match.

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
