import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { ui, UiIconButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * "Page 2 / 21" between two round controls, with an optional summary at the
 * inline start ("501 managers classés"). The chevrons are logical — previous
 * is the start, next the end — and `styles.css` mirrors the lucide chevrons
 * under `dir="rtl"`, so each points the way the reader travels.
 */
export function ListPager({
  page,
  pageCount,
  summary,
  onPrevious,
  onNext,
  className,
}: {
  page: number;
  pageCount: number;
  summary?: ReactNode;
  onPrevious: () => void;
  onNext: () => void;
  className?: string;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  return (
    <div
      className={cn(
        "flex items-center gap-3",
        summary ? "justify-between" : "justify-center",
        className,
      )}
    >
      {summary ? <p className={cn("min-w-0", ui.text.meta, ui.tone.muted)}>{summary}</p> : null}
      <div className="flex shrink-0 items-center gap-2">
        <UiIconButton
          aria-label={t("fantasy.rankings.prev")}
          disabled={page <= 1}
          onClick={onPrevious}
        >
          <ChevronLeft aria-hidden />
        </UiIconButton>
        <span className={cn("whitespace-nowrap", ui.stat.sm, ui.tone.default)}>
          {t("fantasy.rankings.page")} <bdi>{nf.format(page)}</bdi> /{" "}
          <bdi>{nf.format(pageCount)}</bdi>
        </span>
        <UiIconButton
          aria-label={t("fantasy.rankings.next")}
          disabled={page >= pageCount}
          onClick={onNext}
        >
          <ChevronRight aria-hidden />
        </UiIconButton>
      </div>
    </div>
  );
}
