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
