import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/dictionaries";

export type MatchTabKey = "summary" | "stats" | "h2h";

export const MATCH_TABS: { key: MatchTabKey; label: TranslationKey }[] = [
  { key: "summary", label: "matches.detail.tab.summary" },
  { key: "stats", label: "matches.detail.tab.stats" },
  { key: "h2h", label: "matches.detail.tab.h2h" },
];

/** Sticky segmented control driving the match detail sections. */
export function MatchTabs({
  active,
  onChange,
}: {
  active: MatchTabKey;
  onChange: (key: MatchTabKey) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      role="tablist"
      aria-label={t("matches.detail.tabs_label")}
      className={cn(
        "sticky top-2 z-20 mt-5 flex gap-1 overflow-x-auto rounded-full p-1",
        "border border-[var(--glass-border)] bg-[color:var(--surface-glass-strong)] shadow-subtle backdrop-blur-md",
      )}
    >
      {MATCH_TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              "min-h-11 flex-1 whitespace-nowrap rounded-full px-3 text-[13px] font-bold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]",
              isActive
                ? "cta-brand shadow-subtle"
                : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)]",
            )}
          >
            {t(tab.label)}
          </button>
        );
      })}
    </div>
  );
}
