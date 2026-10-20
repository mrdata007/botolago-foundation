/**
 * Brand colours as hex, converted from the oklch tokens in src/styles.css
 * (e-mail clients do not parse oklch). Contrast measured on the sRGB values:
 * white on `ink` 12.8:1, `onInk` on `ink` 9.3:1, `text` on white 19.4:1,
 * `muted` on white 7.4:1 and on `page` 6.9:1.
 */
export const EMAIL_COLORS = {
  /** --brand-primary / --ui-ink, oklch(0.32 0.1 258): header band, button, links. */
  ink: "#0c3164",
  /** --ui-on-ink, oklch(0.88 0.11 205): the cyan on an ink fill ("GO"). */
  onInk: "#73edfa",
  /** --brand-accent, oklch(0.62 0.19 256): borders only, never text. */
  accent: "#2584f5",
  /** --brand-accent at 10% over white: the favourite-club row. */
  favoriteTint: "#e9f3fe",
  /** --ui-page, oklch(0.975 0.004 250). */
  page: "#f5f7f9",
  /** --ui-surface. */
  surface: "#ffffff",
  /** --ui-on-surface, oklch(0.16 0.03 260). */
  text: "#060d1a",
  /** --ui-on-surface-muted, oklch(0.45 0.02 258). */
  muted: "#4e5661",
  /** --ui-rule, oklch(0.93 0.006 250). */
  rule: "#e5e8ec",
} as const;

/** Escapes the five characters that matter in HTML text and attribute values. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
