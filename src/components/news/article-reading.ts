import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * How an article's body reads on the public article page (Option A).
 *
 * The body is the sanitized HTML the CMS stores, injected as one blob and
 * styled by the shared `.editorial-body` rules in `src/styles.css` — the same
 * rules the always-dark CMS preview uses, so they are `currentColor`-based and
 * are not touched here. What the reader adds on top lives in this module and
 * is scoped to the reader by one extra class, `news-article-body`, which the
 * preview does not carry.
 */

/** The class the reader adds beside `editorial-body`; the pull-quote rules key on both. */
export const ARTICLE_BODY_SCOPE = "news-article-body";

/**
 * The body's type: the kit's long-form step (15px, the normal weight, the
 * prose leading) in the default foreground. An Arabic edition read from the
 * French UI does not get the Arabic leading tokens — those follow the page's
 * language — so it is opened up by hand, as the article page always did.
 */
export function articleBodyClass(contentLanguage: "fr" | "ar"): string {
  return cn(
    ARTICLE_BODY_SCOPE,
    ui.text.prose,
    ui.tone.default,
    contentLanguage === "ar" && "leading-loose",
  );
}

/**
 * The pull quote (A-Article): a `blockquote` in the body becomes a tinted card
 * — the article's club tint, a 4px club edge on the inline start (logical, so
 * it mirrors), the card radius — set in the display face, upright.
 *
 * `--ui-club-tint` and `--ui-club-edge` come from the `clubStyle` on the
 * `<article>`; with no club they are the kit's defaults (the sunken surface
 * and the brand foreground), so every article gets a quote that reads.
 *
 * Plain CSS rather than utilities: `.editorial-body` is unlayered, and an
 * unlayered rule beats anything in Tailwind's `@layer utilities` whatever its
 * specificity, so utilities on the wrapper could not restyle the quote
 * without `!important` on every line. Two classes out-rank the shared rule's
 * one. Tokens only, and none of `<`, `>`, `&` or quotes, so the server
 * render cannot escape anything in it.
 */
export const PULL_QUOTE_CSS = [
  `.${ARTICLE_BODY_SCOPE}.editorial-body blockquote {`,
  "  margin-block: 1.4em;",
  "  margin-inline: 0;",
  "  padding-block: var(--ui-space-3);",
  "  padding-inline: var(--ui-space-4);",
  "  border-inline-start: 4px solid var(--ui-club-edge);",
  "  border-radius: var(--ui-radius-card);",
  "  background-color: var(--ui-club-tint);",
  "  color: var(--ui-on-surface);",
  "  font-family: var(--ui-font-display);",
  "  font-size: var(--ui-display-section);",
  "  font-style: normal;",
  "  font-weight: var(--ui-weight-strong);",
  "  line-height: var(--ui-leading-display);",
  "}",
  // Arabic in the display face needs the body's looser line, not the Latin
  // display leading, when the page itself is French.
  `.${ARTICLE_BODY_SCOPE}.editorial-body blockquote:lang(ar) {`,
  "  line-height: inherit;",
  "}",
  `.${ARTICLE_BODY_SCOPE}.editorial-body blockquote p {`,
  "  margin-block: 0;",
  "}",
  `.${ARTICLE_BODY_SCOPE}.editorial-body blockquote p + p {`,
  "  margin-block-start: 0.5em;",
  "}",
].join("\n");
