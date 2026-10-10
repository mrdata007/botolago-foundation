import { useMemo } from "react";

/**
 * The `dangerouslySetInnerHTML` value of a card's markup, one object per string.
 *
 * React 19 compares an element's props by identity, and `{ __html }` written inline is a new object
 * on every render: whenever anything above a card re-rendered, React set `innerHTML` again with the
 * same string. That replaced every node of the card (parse, style, layout and raster of about a
 * thousand SVG elements), threw away the tilt's rebuilt DOM and restarted its float, so a flip, an
 * entrance or a replay redrew the card two to eighteen times (`docs/engineering/CURVA_CARD_SPEED.md`).
 * With the same object while the string is the same, React leaves the node alone.
 */
export function useInnerHtml(html: string | null): { __html: string } | undefined {
  return useMemo(() => (html === null ? undefined : { __html: html }), [html]);
}
