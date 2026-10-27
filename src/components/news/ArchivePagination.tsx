import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { archivePageCount, archivePageLinks, type NewsArchivePlan } from "./news-archive";

/**
 * The archive's page links: previous, numbered pages and next, all plain
 * links (`/news/archive?page=N`) so the server's HTML carries them.
 */
const PAGE_LINK =
  "inline-flex items-center justify-center gap-1 px-3 [font-weight:var(--ui-weight-heavy)] transition-colors";

export function ArchivePagination({ page, plan }: { page: number; plan: NewsArchivePlan }) {
  const { t } = useI18n();
  const last = archivePageCount(plan);
  if (last <= 1) return null;
  const searchFor = (n: number) => (n > 1 ? { page: n } : {});
  const control = cn(PAGE_LINK, ui.space.tap, ui.radius.full, ui.text.meta, ui.focus);
  const idle = cn(ui.surface.sunken, "hover:bg-[color:var(--ui-surface-raised)]");
  return (
    <nav aria-label={t("news.archive.pages")} className="mt-6">
      <ul className="flex flex-wrap items-center justify-center gap-2">
        {page > 1 && (
          <li>
            <Link
              to="/news/archive"
              search={searchFor(page - 1)}
              rel="prev"
              className={cn(control, idle)}
            >
              <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
              {t("news.archive.prev")}
            </Link>
          </li>
        )}
        {archivePageLinks(page, last).map((n, index) =>
          n === null ? (
            <li key={`gap-${index}`} aria-hidden className={cn(ui.tone.muted, "px-1")}>
              …
            </li>
          ) : (
            <li key={n}>
              {n === page ? (
                <span aria-current="page" className={cn(control, ui.surface.ink)}>
                  {n}
                </span>
              ) : (
                <Link
                  to="/news/archive"
                  search={searchFor(n)}
                  aria-label={t("news.archive.page_n").replace("{page}", String(n))}
                  className={cn(control, idle)}
                >
                  {n}
                </Link>
              )}
            </li>
          ),
        )}
        {page < last && (
          <li>
            <Link
              to="/news/archive"
              search={searchFor(page + 1)}
              rel="next"
              className={cn(control, idle)}
            >
              {t("news.archive.next")}
              <ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
