import sanitizeHtml from "sanitize-html";
import { NewsError } from "./errors";

export const NEWS_SANITIZER_VERSION = "sanitize-html@2.17.5";

const allowedTags = [
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

export function sanitizeEditorialHtml(input: string): string {
  const clean = sanitizeHtml(input, {
    allowedTags: [...allowedTags],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"],
    },
    allowedSchemes: ["https"],
    allowedSchemesByTag: { a: ["https", "mailto"], img: ["https"] },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          ...attribs,
          rel: "nofollow noopener noreferrer",
          ...(attribs.target === "_blank" ? { target: "_blank" } : {}),
        },
      }),
      img: (_tagName, attribs) => ({
        tagName: "img",
        attribs: { ...attribs, loading: "lazy" },
      }),
    },
  }).trim();

  if (clean.length < 20)
    throw new NewsError("unsafe_content", "The sanitized article body is empty or too short.");
  return clean;
}

export function calculateReadingTime(html: string): number {
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
  const wordCount = text.trim().split(/\s+/u).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 220));
}
