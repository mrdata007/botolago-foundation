import { useI18n } from "@/i18n/provider";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Design System V2 — Competition group header.
 *
 * Sits above each competition block on the Matches page. Visually distinct
 * but not dominant: a small monogram badge, competition name, and country
 * / category metadata. Uses brand tokens; RTL-safe.
 */
export function CompetitionHeader({
  count,
  className,
}: {
  /** Number of matches under this group, shown as a subtle count. */
  count?: number;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-1 pb-2 pt-1",
        className,
      )}
    >
      <div
        className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white shadow-subtle"
        style={{ background: "var(--bg-brand-gradient)" }}
        aria-hidden
      >
        <Trophy className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-black tracking-tight text-foreground">
          {t("matches.competition.botola")}
        </div>
        <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
          {t("matches.competition.country")}
        </div>
      </div>
      {typeof count === "number" && count > 0 && (
        <span
          className="inline-flex min-w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-hover)] px-2 py-0.5 text-[10px] font-black tabular-nums text-[color:var(--text-secondary)]"
          aria-hidden
        >
          {count}
        </span>
      )}
    </div>
  );
}
