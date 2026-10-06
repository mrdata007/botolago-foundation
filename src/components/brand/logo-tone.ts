/** Which logo file a surface shows. */
export type LogoTone = "auto" | "color" | "light";

/**
 * BG-0149 — which file each tone paints, and where. `auto` renders BOTH files
 * and lets the `.dark` class on `<html>` pick one (`dark:` is the class
 * variant, styles.css:6). That class is set by the inline head script before
 * the first paint and follows an explicit in-app choice, so:
 *
 *   - the server renders the same markup in both themes (nothing here reads
 *     the theme), so there is no hydration mismatch and no swap after load;
 *   - the hidden file is `display: none`, so it is out of the accessibility
 *     tree and the logo is announced once, and both files share one box, so
 *     the swap cannot shift the layout;
 *   - it is NOT `<picture media="(prefers-color-scheme: dark)">`, which
 *     follows the phone and would ignore a visitor who chose Clair or Sombre.
 *
 * The cost is the second SVG (about 9 KB) being fetched while hidden; both
 * are cached after the first page. The colour file's blue (#0151fc) measured
 * 2.95:1 and its black ball and swoosh 1.21:1 on the dark top bar; the white
 * file 17.29:1.
 */
export const LOGO_TONE_FILES: Record<
  LogoTone,
  ReadonlyArray<{ file: "color" | "light"; only?: "light" | "dark" }>
> = {
  auto: [
    { file: "color", only: "light" },
    { file: "light", only: "dark" },
  ],
  color: [{ file: "color" }],
  light: [{ file: "light" }],
};

/**
 * The classes that show a file in one theme only. `display` is what the
 * element is when shown: `block` inside the logo's flex box, `inline-block`
 * inside a line of heading text. Spelled out in full so Tailwind's scanner
 * sees each class.
 */
export function logoThemeClass(
  only: "light" | "dark" | undefined,
  display: "block" | "inline-block",
): string | undefined {
  if (only === "light") return "dark:hidden";
  if (only === "dark")
    return display === "block" ? "hidden dark:block" : "hidden dark:inline-block";
  return undefined;
}
