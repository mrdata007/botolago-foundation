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
    // External https links open in a new tab and carry
    // rel="nofollow noopener noreferrer"; links to this site (a path, or
    // botolago.com) carry neither, so internal links pass link equity and stay
    // in the tab. Whatever `target`/`rel` the input had is discarded. Unsafe
    // schemes (javascript:, data:, http:, protocol-relative //) lose their
    // href in the scheme filter that runs after this transform.
    a: (_tagName: string, attribs: Record<string, string>) => {
      const { target: _target, rel: _rel, ...rest } = attribs;
      const href = (attribs.href ?? "").trim();
      const external =
        /^https:\/\//i.test(href) && !/^https:\/\/(?:www\.)?botolago\.com(?:[/?#:]|$)/i.test(href);
      if (external) {
        return {
          tagName: "a",
          attribs: { ...rest, target: "_blank", rel: "nofollow noopener noreferrer" },
        };
      }
      if (/^mailto:/i.test(href)) return { tagName: "a", attribs: { ...rest, rel: "nofollow" } };
      return { tagName: "a", attribs: rest };
    },
    img: (_tagName: string, attribs: Record<string, string>) => ({
      tagName: "img",
      attribs: { ...attribs, loading: "lazy" },
    }),
  },
};
