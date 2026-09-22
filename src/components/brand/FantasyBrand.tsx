import { Logo } from "@/components/brand/Logo";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * The BotolaGO Fantasy lockup: the official wordmark with the product name
 * set under it (`lg`) or beside it (`sm`).
 *
 * It replaces two plain-text treatments — a raster favicon beside an H1 that
 * read just "Fantasy" on the hub, and a "BotolaGO Fantasy" eyebrow typed in
 * the label style on the rankings banner — so the product has one identity
 * wherever it names itself.
 *
 * The product name borrows the wordmark's voice: heavy, uppercase, italic and
 * open-tracked. Italic and tracking are Latin-only (`ltr:`): Arabic has no
 * italic and its letters join, so letter-spacing breaks the word (BG-0069).
 *
 * - `lg` — stacked, for a Fantasy hero. Put it inside the page's `h1`; its
 *   accessible name reads "BotolaGO Fantasy".
 * - `sm` — one line, for an eyebrow above a banner title.
 *
 * `tone="light"` is for dark bands (the ink banner, the mesh).
 */
export function FantasyBrand({
  size = "lg",
  tone = "color",
  className,
}: {
  size?: "sm" | "lg";
  tone?: "color" | "light";
  className?: string;
}) {
  const { t } = useI18n();
  const stacked = size === "lg";
  return (
    <span
      className={cn(
        "inline-flex max-w-full",
        stacked ? "flex-col items-start gap-1.5" : "items-center gap-2",
        className,
      )}
    >
      <Logo tone={tone} size={stacked ? "lg" : "sm"} />
      <span
        className={cn(
          "uppercase ltr:italic",
          stacked
            ? cn(ui.text.title, "[font-weight:var(--ui-weight-hero)] ltr:tracking-[0.3em]")
            : cn(ui.text.label, "ltr:tracking-[0.2em]"),
          tone === "light" ? ui.tone.onInk : ui.tone.ink,
        )}
      >
        {t("fantasy.title")}
      </span>
    </span>
  );
}
