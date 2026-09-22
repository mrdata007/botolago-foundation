import { Logo } from "@/components/brand/Logo";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * The BotolaGO Fantasy lockup: an endorsed sub-brand. The product name leads,
 * set large in the wordmark's own voice — heavy, uppercase, italic — and the
 * official BotolaGO wordmark sits above it, smaller, as the endorser.
 *
 * The first version ran the other way (a 40px wordmark over a small,
 * wide-tracked "FANTASY"), which read as a logo with a caption: the hub's
 * first viewport was mostly master brand, and the product barely registered.
 *
 * Italic is Latin-only (`ltr:`); Arabic has no italic, and its letters join,
 * so it is never letter-spaced either (BG-0069).
 *
 * `endorser="mobile"` drops the wordmark from `md` up, where the Fantasy
 * frame shows the global top bar and the wordmark would appear twice within
 * a hundred pixels. Put the lockup inside the page's `h1`; its accessible
 * name reads "BotolaGO Fantasy" (the wordmark's alt stays in the tree).
 */
export function FantasyBrand({
  endorser = "always",
  className,
}: {
  endorser?: "always" | "mobile";
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <span className={cn("inline-flex max-w-full flex-col items-start gap-1", className)}>
      <Logo size="sm" className={cn(endorser === "mobile" && "md:sr-only")} />
      <span
        className={cn(
          ui.text.hero,
          "uppercase ltr:italic ltr:tracking-tight",
          ui.tone.onGradHeader,
        )}
      >
        {t("fantasy.title")}
      </span>
    </span>
  );
}
